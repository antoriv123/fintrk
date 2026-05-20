export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

/**
 * Compact endpoint for the iOS Balance widget.
 * Returns total eur_amount across all accounts + how many accounts.
 */
export async function GET() {
  try {
    const userId = await getUserId();

    const [totals] = await sql(
      `SELECT
         COALESCE(SUM(initial_balance), 0) AS initial_sum,
         COUNT(*) AS accounts_count
       FROM accounts
       WHERE user_id = $1 AND is_active = 1`,
      [userId],
    );

    const [txTotals] = await sql(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'income' THEN eur_amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN direction = 'expense' THEN eur_amount ELSE 0 END), 0) AS expense
       FROM transactions
       WHERE user_id = $1`,
      [userId],
    );

    const totalEur = Number(totals?.initial_sum ?? 0)
      + Number(txTotals?.income ?? 0)
      - Number(txTotals?.expense ?? 0);

    return NextResponse.json({
      totalEur: Math.round(totalEur * 100) / 100,
      accountsCount: Number(totals?.accounts_count ?? 0),
      lastUpdated: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
