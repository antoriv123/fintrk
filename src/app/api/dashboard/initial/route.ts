import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { getSummary, getTransactions } from "@/lib/queries";

export const runtime = "nodejs";

type TodayStatus = "checked_in" | "has_transactions" | "pending" | "waiting_for_night";

interface StreakPayload {
  currentStreak: number;
  bestStreak: number;
  lastCheckinDate: string | null;
  todayStatus: TodayStatus;
  checkinType: string | null;
  canMarkNoExpense: boolean;
  canMarkNoExpenseYesterday: boolean;
  hasTransactionsToday: boolean;
}

function localDate(offsetHours = 2, deltaDays = 0): string {
  const d = new Date(Date.now() + offsetHours * 3_600_000);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function getUserHour(timezoneOffset?: number): number {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const offset = timezoneOffset ?? 2;
  return (utcHour + offset + 24) % 24;
}

async function getInitialStreak(userId: number, tzOffset: number): Promise<StreakPayload> {
  const today = localDate(tzOffset);
  const yesterday = localDate(tzOffset, -1);
  const userHour = getUserHour(tzOffset);

  const [row] = (await sql(
    `WITH streak AS (
       SELECT current_streak, best_streak, last_checkin_date
       FROM streaks
       WHERE user_id = $1
     ),
     today_checkin AS (
       SELECT type FROM daily_checkins WHERE user_id = $1 AND date = $2 LIMIT 1
     ),
     yesterday_checkin AS (
       SELECT 1 AS ok FROM daily_checkins WHERE user_id = $1 AND date = $3 LIMIT 1
     ),
     today_tx AS (
       SELECT COUNT(*)::int AS c
       FROM transactions
       WHERE user_id = $1 AND date = $2 AND category != 'intereses' AND (is_demo IS NULL OR is_demo = 0)
     ),
     yesterday_tx AS (
       SELECT COUNT(*)::int AS c
       FROM transactions
       WHERE user_id = $1 AND date = $3 AND category != 'intereses' AND (is_demo IS NULL OR is_demo = 0)
     )
     SELECT
       COALESCE((SELECT current_streak FROM streak), 0)::int AS current_streak,
       COALESCE((SELECT best_streak FROM streak), 0)::int AS best_streak,
       (SELECT last_checkin_date FROM streak) AS last_checkin_date,
       (SELECT type FROM today_checkin) AS checkin_type,
       EXISTS(SELECT 1 FROM today_checkin) AS checked_in_today,
       EXISTS(SELECT 1 FROM yesterday_checkin) AS checked_in_yesterday,
       COALESCE((SELECT c FROM today_tx), 0)::int AS today_tx_count,
       COALESCE((SELECT c FROM yesterday_tx), 0)::int AS yesterday_tx_count`,
    [userId, today, yesterday],
  )) as {
    current_streak: number;
    best_streak: number;
    last_checkin_date: string | null;
    checkin_type: string | null;
    checked_in_today: boolean;
    checked_in_yesterday: boolean;
    today_tx_count: number;
    yesterday_tx_count: number;
  }[];

  let checkedInToday = Boolean(row?.checked_in_today);
  let currentStreak = Number(row?.current_streak ?? 0);
  let bestStreak = Number(row?.best_streak ?? 0);
  let lastCheckinDate = row?.last_checkin_date ?? null;
  const hasTransactionsToday = Number(row?.today_tx_count ?? 0) > 0;

  if (!checkedInToday && hasTransactionsToday) {
    await sql(
      "INSERT INTO daily_checkins (user_id, date, type) VALUES ($1, $2, 'expense_logged') ON CONFLICT (user_id, date) DO NOTHING",
      [userId, today],
    );
    checkedInToday = true;
    const newStreak = lastCheckinDate === yesterday ? currentStreak + 1 : 1;
    const newBest = Math.max(bestStreak, newStreak);
    await sql(
      `INSERT INTO streaks (user_id, current_streak, best_streak, last_checkin_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         current_streak = CASE WHEN streaks.last_checkin_date = $4 THEN streaks.current_streak ELSE $2 END,
         best_streak = GREATEST(streaks.best_streak, $3),
         last_checkin_date = $4,
         updated_at = NOW()`,
      [userId, newStreak, newBest, today],
    );
    currentStreak = newStreak;
    bestStreak = newBest;
    lastCheckinDate = today;
  }

  const hasTransactionsYesterday = Number(row?.yesterday_tx_count ?? 0) > 0;
  const canMarkNoExpense = userHour >= 21 && !checkedInToday && !hasTransactionsToday;
  const canMarkNoExpenseYesterday = userHour < 12 && !row?.checked_in_yesterday && !hasTransactionsYesterday;

  if (lastCheckinDate && lastCheckinDate < yesterday && !checkedInToday && !canMarkNoExpenseYesterday) {
    currentStreak = 0;
  }

  let todayStatus: TodayStatus = "pending";
  if (checkedInToday) todayStatus = "checked_in";
  else if (hasTransactionsToday) todayStatus = "has_transactions";
  else if (userHour < 21) todayStatus = "waiting_for_night";

  return {
    currentStreak,
    bestStreak,
    lastCheckinDate,
    todayStatus,
    checkinType: row?.checkin_type ?? null,
    canMarkNoExpense,
    canMarkNoExpenseYesterday,
    hasTransactionsToday,
  };
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    const p = req.nextUrl.searchParams;
    const now = new Date();
    const from = p.get("from") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const to = p.get("to") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
    const tz = Math.max(-12, Math.min(14, parseInt(p.get("tz") ?? "2", 10) || 2));

    const [summary, recentTransactions, streak, accountRows] = await Promise.all([
      getSummary(userId, from, to),
      getTransactions(userId, { from, to, limit: 5 }),
      getInitialStreak(userId, tz),
      sql(
        "SELECT currency FROM accounts WHERE user_id = $1 AND is_active = 1 ORDER BY created_at ASC LIMIT 1",
        [userId],
      ) as Promise<{ currency?: string }[]>,
    ]);

    return NextResponse.json({
      summary,
      recentTransactions,
      streak,
      primaryCurrency: accountRows[0]?.currency ?? "EUR",
    });
  } catch (e) {
    console.error("Dashboard initial error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
