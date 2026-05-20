export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

/**
 * Compact endpoint for the iOS Savings widget.
 * Returns amount saved this month vs previous, plus optional goal progress.
 */
export async function GET() {
  try {
    const userId = await getUserId();
    const now = new Date();
    const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

    const cur = ym(now.getFullYear(), now.getMonth() + 1);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = ym(prevDate.getFullYear(), prevDate.getMonth() + 1);

    async function monthSavings(yyyyMm: string): Promise<number> {
      const [row] = await sql(
        `SELECT
           COALESCE(SUM(CASE WHEN direction = 'income' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) AS income,
           COALESCE(SUM(CASE WHEN direction = 'expense' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) AS expense
         FROM transactions
         WHERE user_id = $1 AND substr(date, 1, 7) = $2`,
        [userId, yyyyMm],
      );
      return Number(row?.income ?? 0) - Number(row?.expense ?? 0);
    }

    const [saved, previous] = await Promise.all([monthSavings(cur), monthSavings(prev)]);

    // Optional savings goal
    const [goalRow] = await sql(
      "SELECT target_amount FROM goals WHERE user_id = $1 AND kind = 'monthly_savings' LIMIT 1",
      [userId],
    ).catch(() => [undefined]);
    const goalEur = goalRow?.target_amount ? Number(goalRow.target_amount) : null;
    const progressPct = goalEur && goalEur > 0
      ? Math.max(0, Math.min(1, saved / goalEur))
      : null;

    return NextResponse.json({
      currentMonth: cur,
      savedEur: Math.round(saved * 100) / 100,
      previousMonthEur: Math.round(previous * 100) / 100,
      goalEur,
      progressPct,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
