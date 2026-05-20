import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    const p = req.nextUrl.searchParams;
    const year = parseInt(p.get("year") ?? String(new Date().getFullYear()), 10);

    const months = [];
    for (let i = 0; i < 12; i++) {
      const month = String(i + 1).padStart(2, "0");
      const from = `${year}-${month}-01`;
      const lastDay = new Date(year, i + 1, 0).getDate();
      const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

      const incomeRows = await sql(
        "SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE user_id = $1 AND direction = 'income' AND category != 'transferencia' AND date >= $2 AND date <= $3",
        [userId, from, to]
      );
      const income = (incomeRows[0] as { total: number }).total;

      const expenseRows = await sql(
        "SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND date >= $2 AND date <= $3",
        [userId, from, to]
      );
      const expenses = (expenseRows[0] as { total: number }).total;

      months.push({
        month: `${year}-${month}`,
        label: MONTH_LABELS[i],
        income: Math.round(income),
        expenses: Math.round(expenses),
        savings: Math.round(income - expenses),
      });
    }

    const totalIncome = months.reduce((s, m) => s + m.income, 0);
    const totalExpenses = months.reduce((s, m) => s + m.expenses, 0);
    const totalSavings = totalIncome - totalExpenses;

    // Only count months with activity for averages
    const activeMonths = months.filter((m) => m.income > 0 || m.expenses > 0).length || 1;

    const categoryTotals = await sql(
      "SELECT category, SUM(eur_amount) as total FROM transactions WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND date >= $2 AND date <= $3 GROUP BY category ORDER BY total DESC",
      [userId, `${year}-01-01`, `${year}-12-31`]
    ) as { category: string; total: number }[];

    return NextResponse.json({
      year,
      months,
      totals: {
        income: totalIncome,
        expenses: totalExpenses,
        savings: totalSavings,
      },
      categoryTotals: categoryTotals.map((r) => ({ ...r, total: Math.round(r.total) })),
      avgMonthlyIncome: Math.round(totalIncome / activeMonths),
      avgMonthlyExpenses: Math.round(totalExpenses / activeMonths),
    });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
