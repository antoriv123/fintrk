import { NextRequest, NextResponse } from "next/server";
import { getTransactions } from "@/lib/queries";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { clearDemoTransactions } from "@/lib/demo-data";
import {
  sanitizeText,
  parsePositiveNumber,
  validateDate,
  validateDirection,
  validateCurrency,
  validateExpenseType,
  sanitizeSlug,
} from "@/lib/sanitize";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  const p = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(parseInt(p.get("limit") ?? "50") || 50, 1), 200);
  const offset = Math.max(parseInt(p.get("offset") ?? "0") || 0, 0);

  const sortParam = p.get("sort");
  const sort: "date" | "created" = sortParam === "created" ? "created" : "date";
  const recentDaysParam = parseInt(p.get("recentDays") ?? "", 10);
  const recentDays = Number.isFinite(recentDaysParam) && recentDaysParam > 0 && recentDaysParam <= 365
    ? recentDaysParam
    : undefined;

  const data = await getTransactions(userId, {
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    category: p.get("category") ?? undefined,
    expense_type: p.get("expense_type") ?? undefined,
    direction: p.get("direction") ?? undefined,
    search: p.get("search")?.slice(0, 100) ?? undefined,
    tag: p.get("tag") ?? undefined,
    account: p.get("account") ?? undefined,
    reconciled: p.get("reconciled") ?? undefined,
    sort,
    recentDays,
    limit,
    offset,
  });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const body = await req.json();

  const amount = parsePositiveNumber(body.amount);
  const direction = validateDirection(body.direction);
  const description = sanitizeText(body.description, 300);
  const category = sanitizeText(body.category, 50);
  const date = validateDate(body.date);
  const currency = validateCurrency(body.currency);
  const expenseType = direction === "expense" ? validateExpenseType(body.expense_type) : null;
  const account = body.account ? sanitizeSlug(body.account) : null;
  const eurAmount = parsePositiveNumber(body.eur_amount) ?? amount;

  if (!amount || !direction || !description || !category || !date) {
    return NextResponse.json({ error: "Campos requeridos: amount, direction, description, category, date" }, { status: 400 });
  }

  // Require account if user has accounts
  if (!account) {
    const accountCount = await sql("SELECT COUNT(*) as c FROM accounts WHERE user_id = $1 AND is_active = 1", [userId]);
    if ((accountCount[0]?.c ?? 0) > 0) {
      return NextResponse.json({ error: "Selecciona una cuenta" }, { status: 400 });
    }
  }

  // Clear demo transactions before the first real save so the user never sees them mixed.
  try { await clearDemoTransactions(Number(userId)); } catch {}

  const rows = await sql(
    `INSERT INTO transactions (user_id, amount, currency, eur_amount, direction, description, category, expense_type, date, image_path, telegram_message_id, account)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, $10)
     RETURNING id`,
    [userId, amount, currency, eurAmount, direction, description, category, expenseType, date, account]
  );

  // Interest payments from remunerated accounts are automations, not user actions —
  // they must not count toward the streak. Same for "transferencia" (internal moves).
  const countsForStreak = category !== "intereses" && category !== "transferencia";

  let currentStreak = 0;
  let isFirstStreak = false;

  if (countsForStreak) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    sql("INSERT INTO daily_checkins (user_id, date, type) VALUES ($1, $2, 'expense_logged') ON CONFLICT (user_id, date) DO NOTHING", [userId, todayStr]).catch(() => {});

    const yesterdayDate = new Date(today); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getDate()).padStart(2, "0")}`;

    try {
      const streakRows = await sql(
        "SELECT current_streak, best_streak, last_checkin_date FROM streaks WHERE user_id = $1",
        [userId]
      );
      if (streakRows.length === 0) {
        await sql(
          "INSERT INTO streaks (user_id, current_streak, best_streak, last_checkin_date) VALUES ($1, 1, 1, $2)",
          [userId, todayStr]
        );
        currentStreak = 1;
        isFirstStreak = true;
      } else {
        const s = streakRows[0];
        if (s.last_checkin_date === todayStr) {
          currentStreak = s.current_streak;
        } else {
          const newStreak = s.last_checkin_date === yesterdayStr ? s.current_streak + 1 : 1;
          const newBest = Math.max(s.best_streak, newStreak);
          await sql(
            "UPDATE streaks SET current_streak = $1, best_streak = $2, last_checkin_date = $3, updated_at = NOW() WHERE user_id = $4",
            [newStreak, newBest, todayStr, userId]
          );
          currentStreak = newStreak;
        }
      }
    } catch {
      // Streak is non-critical — don't block the response.
    }
  }

  return NextResponse.json(
    { id: rows[0].id, streak: { current: currentStreak, isFirst: isFirstStreak, counted: countsForStreak } },
    { status: 201 }
  );
}
