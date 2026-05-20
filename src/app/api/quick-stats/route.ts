import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import type { QuickStats } from "@/lib/api-types";

export type { QuickStats };

export async function GET(req: NextRequest): Promise<NextResponse<QuickStats>> {
  try {
    const userId = await getUserId();
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ dailyAverage: 0, zeroSpendDays: 0, maxExpense: 0, maxExpenseDescription: "", savingsRate: 0 });
    }

    const totalExpenseRows = await sql(
      "SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE direction = 'expense' AND category != 'transferencia' AND date >= $1 AND date <= $2 AND user_id = $3",
      [from, to, userId]
    );
    const totalExpenses = (totalExpenseRows[0] as { total: number }).total;

    const totalIncomeRows = await sql(
      "SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE direction = 'income' AND category != 'transferencia' AND date >= $1 AND date <= $2 AND user_id = $3",
      [from, to, userId]
    );
    const totalIncome = (totalIncomeRows[0] as { total: number }).total;

    // Total calendar days in the period
    const startDate = new Date(from);
    const endDate = new Date(to);
    const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1);

    const dailyAverage = totalExpenses / totalDays;

    // Days with at least one expense in the period
    const daysWithExpenseRows = await sql(
      "SELECT COUNT(DISTINCT date) as count FROM transactions WHERE direction = 'expense' AND date >= $1 AND date <= $2 AND user_id = $3",
      [from, to, userId]
    );
    const daysWithExpense = (daysWithExpenseRows[0] as { count: number }).count;

    const zeroSpendDays = Math.max(0, totalDays - daysWithExpense);

    // Biggest single expense
    const maxRows = await sql(
      "SELECT eur_amount, description FROM transactions WHERE direction = 'expense' AND category != 'transferencia' AND date >= $1 AND date <= $2 AND user_id = $3 ORDER BY eur_amount DESC LIMIT 1",
      [from, to, userId]
    );
    const maxRow = maxRows[0] as { eur_amount: number; description: string } | undefined;

    const maxExpense = maxRow?.eur_amount ?? 0;
    const maxExpenseDescription = maxRow?.description ?? "";

    const savingsRate = totalIncome > 0
      ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100)
      : 0;

    return NextResponse.json({
      dailyAverage: Math.round(dailyAverage * 100) / 100,
      zeroSpendDays,
      maxExpense: Math.round(maxExpense * 100) / 100,
      maxExpenseDescription,
      savingsRate,
    });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" } as unknown as QuickStats, { status: 500 });
  }
}
