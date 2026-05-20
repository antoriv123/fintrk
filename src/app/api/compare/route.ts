import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

function getMonthRange(month: string): { from: string; to: string } {
  const [year, mon] = month.split("-");
  const lastDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
  return {
    from: `${year}-${mon}-01`,
    to: `${year}-${mon}-${String(lastDay).padStart(2, "0")}`,
  };
}

async function getMonthData(userId: number, month: string) {
  const { from, to } = getMonthRange(month);

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

  const byCategory = await sql(
    "SELECT category, SUM(eur_amount) as total FROM transactions WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND date >= $2 AND date <= $3 GROUP BY category ORDER BY total DESC",
    [userId, from, to]
  ) as { category: string; total: number }[];

  return {
    month,
    income: Math.round(income * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    savings: Math.round((income - expenses) * 100) / 100,
    byCategory,
  };
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  const p = req.nextUrl.searchParams;
  const now = new Date();

  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const month1Param = p.get("month1") ?? prevMonth;
  const month2Param = p.get("month2") ?? currentMonth;

  const month1 = await getMonthData(userId, month1Param);
  const month2 = await getMonthData(userId, month2Param);

  // Build a unified category list from both months
  const allCategories = Array.from(
    new Set([
      ...month1.byCategory.map((c) => c.category),
      ...month2.byCategory.map((c) => c.category),
    ])
  );

  const changes = allCategories.map((category) => {
    const m1 = month1.byCategory.find((c) => c.category === category)?.total ?? 0;
    const m2 = month2.byCategory.find((c) => c.category === category)?.total ?? 0;
    const change = m1 > 0 ? Math.round(((m2 - m1) / m1) * 100) : m2 > 0 ? 100 : 0;
    return {
      category,
      month1: Math.round(m1 * 100) / 100,
      month2: Math.round(m2 * 100) / 100,
      change,
      direction: m2 > m1 ? "up" : m2 < m1 ? "down" : "same",
    };
  });

  // Sort by the higher spend of the two months
  changes.sort((a, b) => Math.max(b.month1, b.month2) - Math.max(a.month1, a.month2));

  return NextResponse.json({ month1, month2, changes });
}
