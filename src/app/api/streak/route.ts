import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";


function todayStr(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getUserHour(timezoneOffset?: number): number {
  // Default to CET (UTC+2) if no offset provided
  const now = new Date();
  const utcHour = now.getUTCHours();
  const offset = timezoneOffset ?? 2;
  return (utcHour + offset + 24) % 24;
}

// GET: get current streak status
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  const today = todayStr();
  const yesterday = yesterdayStr();
  const tzOffset = parseInt(req.nextUrl.searchParams.get("tz") ?? "2", 10);
  const userHour = getUserHour(tzOffset);

  // Get streak record
  const streakRows = await sql(
    "SELECT current_streak, best_streak, last_checkin_date FROM streaks WHERE user_id = $1",
    [userId]
  );
  const streak = streakRows[0] ?? { current_streak: 0, best_streak: 0, last_checkin_date: null };

  // Check if already checked in today
  const checkinRows = await sql(
    "SELECT type FROM daily_checkins WHERE user_id = $1 AND date = $2",
    [userId, today]
  );
  const checkedInToday = checkinRows.length > 0;
  const checkinType = checkinRows[0]?.type ?? null;

  // Check if user has any *user-logged* transactions today. Auto-generated
  // interest payments from remunerated accounts don't count toward the streak —
  // the streak rewards the habit of checking in, not automations.
  const txRows = await sql(
    "SELECT COUNT(*) as c FROM transactions WHERE user_id = $1 AND date = $2 AND category != 'intereses' AND (is_demo IS NULL OR is_demo = 0)",
    [userId, today]
  );
  const hasTransactionsToday = (txRows[0]?.c ?? 0) > 0;

  // Auto check-in if user has transactions today but no check-in yet
  let checkedInToday2 = checkedInToday;
  if (!checkedInToday && hasTransactionsToday) {
    await sql("INSERT INTO daily_checkins (user_id, date, type) VALUES ($1, $2, 'expense_logged') ON CONFLICT (user_id, date) DO NOTHING", [userId, today]);
    checkedInToday2 = true;

    // Update streak (upsert to avoid race conditions)
    const newStreak = (streakRows.length > 0 && streak.last_checkin_date === yesterday) ? streak.current_streak + 1 : 1;
    const newBest = Math.max(streak.best_streak ?? 0, newStreak);
    await sql(
      `INSERT INTO streaks (user_id, current_streak, best_streak, last_checkin_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         current_streak = CASE WHEN streaks.last_checkin_date = $4 THEN streaks.current_streak ELSE $2 END,
         best_streak = GREATEST(streaks.best_streak, $3),
         last_checkin_date = $4,
         updated_at = NOW()`,
      [userId, newStreak, newBest, today]
    );
    streak.current_streak = newStreak;
    streak.best_streak = newBest;
    streak.last_checkin_date = today;
  }

  // Check if yesterday has a checkin or transactions
  const yesterdayCheckinRows = await sql(
    "SELECT type FROM daily_checkins WHERE user_id = $1 AND date = $2",
    [userId, yesterday]
  );
  const checkedInYesterday = yesterdayCheckinRows.length > 0;

  const yesterdayTxRows = await sql(
    "SELECT COUNT(*) as c FROM transactions WHERE user_id = $1 AND date = $2 AND category != 'intereses' AND (is_demo IS NULL OR is_demo = 0)",
    [userId, yesterday]
  );
  const hasTransactionsYesterday = (yesterdayTxRows[0]?.c ?? 0) > 0;

  // Can mark "no expense" for TODAY: after 21:00 local time
  const canMarkNoExpense = userHour >= 21 && !checkedInToday2 && !hasTransactionsToday;

  // Can mark "no expense" for YESTERDAY: before 12:00 local time, if yesterday has no checkin or tx
  const canMarkNoExpenseYesterday = userHour < 12 && !checkedInYesterday && !hasTransactionsYesterday;

  // Calculate if streak is still alive
  let currentStreak = streak.current_streak;
  const lastDate = streak.last_checkin_date;

  // If last check-in was before yesterday, streak is broken
  // BUT: if user can still mark yesterday (before noon today), don't break it yet
  if (lastDate && lastDate < yesterday && !checkedInToday2 && !canMarkNoExpenseYesterday) {
    currentStreak = 0;
  }

  // If has transactions today but no check-in, auto-count it
  let todayStatus: "checked_in" | "has_transactions" | "pending" | "waiting_for_night" = "pending";
  if (checkedInToday2) {
    todayStatus = "checked_in";
  } else if (hasTransactionsToday) {
    todayStatus = "has_transactions";
  } else if (userHour < 21) {
    todayStatus = "waiting_for_night";
  }

  return NextResponse.json({
    currentStreak,
    bestStreak: streak.best_streak,
    lastCheckinDate: lastDate,
    todayStatus,
    checkinType,
    canMarkNoExpense,
    canMarkNoExpenseYesterday,
    hasTransactionsToday,
  });
}

// POST: check in for today (or yesterday if before noon)
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const today = todayStr();
  const yesterday = yesterdayStr();

  let body: { type?: string; tz?: number; target?: "today" | "yesterday" } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const type = body.type ?? "expense_logged";
  const tzOffset = body.tz ?? 2;
  const userHour = getUserHour(tzOffset);
  const target = body.target ?? "today";
  const targetDate = target === "yesterday" ? yesterday : today;

  // Validate "no_expense" time windows:
  // - For TODAY: only after 21:00
  // - For YESTERDAY: only before 12:00 (grace period next morning)
  if (type === "no_expense") {
    if (target === "today" && userHour < 21) {
      return NextResponse.json(
        { error: "Puedes marcar 'sin gastos' de hoy a partir de las 21:00" },
        { status: 400 }
      );
    }
    if (target === "yesterday" && userHour >= 12) {
      return NextResponse.json(
        { error: "El periodo para marcar ayer termino a las 12:00" },
        { status: 400 }
      );
    }
  }

  // Check if already checked in for that date
  const existing = await sql(
    "SELECT id FROM daily_checkins WHERE user_id = $1 AND date = $2",
    [userId, targetDate]
  );
  if (existing.length > 0) {
    return NextResponse.json({ error: "Ya registraste ese dia", alreadyCheckedIn: true }, { status: 409 });
  }

  // Create check-in
  await sql(
    "INSERT INTO daily_checkins (user_id, date, type) VALUES ($1, $2, $3) ON CONFLICT (user_id, date) DO NOTHING",
    [userId, targetDate, type]
  );

  // Recalculate streak based on all recent checkins + transactions
  const streakRows = await sql(
    "SELECT current_streak, best_streak, last_checkin_date FROM streaks WHERE user_id = $1",
    [userId]
  );

  let currentStreak = 1;
  let bestStreak = 1;

  if (streakRows.length > 0) {
    const last = streakRows[0];
    const lastDate = last.last_checkin_date;

    if (target === "today") {
      // Marking today — normal logic
      if (lastDate === yesterday) {
        currentStreak = last.current_streak + 1;
      } else if (lastDate === today) {
        currentStreak = last.current_streak;
      }
    } else {
      // Marking yesterday — extend streak if last was day before yesterday
      const dayBeforeYesterday = new Date();
      dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
      const dby = `${dayBeforeYesterday.getFullYear()}-${String(dayBeforeYesterday.getMonth() + 1).padStart(2, "0")}-${String(dayBeforeYesterday.getDate()).padStart(2, "0")}`;

      if (lastDate === dby) {
        currentStreak = last.current_streak + 1;
      } else if (lastDate === yesterday || lastDate === today) {
        currentStreak = last.current_streak;
      }
    }
    bestStreak = Math.max(last.best_streak, currentStreak);
  }

  // Use the MAX of targetDate and existing last_checkin_date to avoid going backwards
  const newLastCheckinDate = streakRows.length > 0 && streakRows[0].last_checkin_date > targetDate
    ? streakRows[0].last_checkin_date
    : targetDate;

  await sql(
    `INSERT INTO streaks (user_id, current_streak, best_streak, last_checkin_date)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       current_streak = $2,
       best_streak = GREATEST(streaks.best_streak, $3),
       last_checkin_date = $4,
       updated_at = NOW()`,
    [userId, currentStreak, bestStreak, newLastCheckinDate]
  );

  return NextResponse.json({
    currentStreak,
    bestStreak,
    checkinType: type,
  });
}
