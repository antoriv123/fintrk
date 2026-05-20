import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

interface MonthStats {
  month: string;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
}

function getMonthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

export async function GET() {
  let userId: number;
  try {
    userId = await getUserId();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const now = new Date();

  try {

  // Last 6 months stats
  const monthlyStats: MonthStats[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const { from, to } = getMonthRange(d.getFullYear(), d.getMonth() + 1);

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

    const savings = income - expenses;
    const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;

    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    monthlyStats.push({
      month: `${months[d.getMonth()]} ${d.getFullYear()}`,
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      savingsRate,
    });
  }

  // Current month
  const currentRange = getMonthRange(now.getFullYear(), now.getMonth() + 1);
  const prevRange = getMonthRange(
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
    now.getMonth() === 0 ? 12 : now.getMonth()
  );

  // Category changes vs last month
  const currentByCategory = await sql(
    "SELECT category, SUM(eur_amount) as total FROM transactions WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND date >= $2 AND date <= $3 GROUP BY category ORDER BY total DESC",
    [userId, currentRange.from, currentRange.to]
  ) as { category: string; total: number }[];

  const prevByCategory = await sql(
    "SELECT category, SUM(eur_amount) as total FROM transactions WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND date >= $2 AND date <= $3 GROUP BY category ORDER BY total DESC",
    [userId, prevRange.from, prevRange.to]
  ) as { category: string; total: number }[];

  const prevMap = new Map(prevByCategory.map((c) => [c.category, c.total]));

  const categoryChanges = currentByCategory.map((c) => {
    const prev = prevMap.get(c.category) ?? 0;
    const changePct = prev > 0 ? Math.round(((c.total - prev) / prev) * 100) : (c.total > 0 ? 100 : 0);
    return {
      category: c.category,
      current: Math.round(c.total * 100) / 100,
      previous: Math.round(prev * 100) / 100,
      changePct,
      direction: changePct > 5 ? "up" as const : changePct < -5 ? "down" as const : "same" as const,
    };
  });

  // Alerts
  const alerts: { type: "warning" | "success" | "info"; message: string }[] = [];

  const currentExpenses = monthlyStats[monthlyStats.length - 1]?.expenses ?? 0;
  const prevExpenses = monthlyStats[monthlyStats.length - 2]?.expenses ?? 0;
  if (prevExpenses > 0 && currentExpenses > prevExpenses * 1.15) {
    const pct = Math.round(((currentExpenses - prevExpenses) / prevExpenses) * 100);
    alerts.push({ type: "warning", message: `Gastas ${pct}% más que el mes pasado` });
  }

  const currentSavingsRate = monthlyStats[monthlyStats.length - 1]?.savingsRate ?? 0;
  if (currentSavingsRate >= 20) {
    alerts.push({ type: "success", message: `Tasa de ahorro del ${currentSavingsRate}% — excelente` });
  } else if (currentSavingsRate < 0) {
    alerts.push({ type: "warning", message: `Estás gastando más de lo que ganas este mes` });
  }

  // Top 5 biggest expenses this month
  const topExpenses = await sql(
    "SELECT description, eur_amount, category, date FROM transactions WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND date >= $2 AND date <= $3 ORDER BY eur_amount DESC LIMIT 5",
    [userId, currentRange.from, currentRange.to]
  ) as { description: string; eur_amount: number; category: string; date: string }[];

  // Spending velocity
  const daysElapsed = Math.max(1, now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyAvg = currentExpenses / daysElapsed;
  const projectedExpenses = Math.round(dailyAvg * daysInMonth * 100) / 100;

  const currentIncome = monthlyStats[monthlyStats.length - 1]?.income ?? 0;
  if (projectedExpenses > currentIncome && currentIncome > 0) {
    alerts.push({ type: "warning", message: `Al ritmo actual, gastarás €${projectedExpenses.toLocaleString()} — más que tus ingresos` });
  }

  // Biggest category increase
  const biggestIncrease = categoryChanges.filter((c) => c.direction === "up").sort((a, b) => b.changePct - a.changePct)[0];
  if (biggestIncrease && biggestIncrease.changePct > 20) {
    alerts.push({ type: "info", message: `${biggestIncrease.category}: +${biggestIncrease.changePct}% vs mes anterior` });
  }

  // Savings streak
  let savingsStreak = 0;
  for (let i = monthlyStats.length - 1; i >= 0; i--) {
    if (monthlyStats[i].savings > 0) savingsStreak++;
    else break;
  }

  // Expense type breakdown this month
  const byExpenseType = await sql(
    "SELECT expense_type, SUM(eur_amount) as total FROM transactions WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND expense_type IS NOT NULL AND date >= $2 AND date <= $3 GROUP BY expense_type",
    [userId, currentRange.from, currentRange.to]
  ) as { expense_type: string; total: number }[];

  // Average daily spending by day of week
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dayOfWeekSpending: any[] = [];
  try {
    const rawDays = await sql(
      `SELECT
        EXTRACT(DOW FROM date::date)::int as day_num,
        AVG(daily_total) as avg_amount
      FROM (
        SELECT date, SUM(eur_amount) as daily_total
        FROM transactions
        WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia'
        AND date >= (CURRENT_DATE - INTERVAL '90 days')::text
        GROUP BY date
      ) sub
      GROUP BY day_num
      ORDER BY day_num`,
      [userId]
    ) as { day_num: number; avg_amount: number }[];
    const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    dayOfWeekSpending = rawDays.map(d => ({
      day_name: dayNames[d.day_num] ?? "?",
      day_num: d.day_num,
      avg_amount: d.avg_amount,
    }));
  } catch { /* skip if fails */ }

  return NextResponse.json({
    monthlyStats,
    categoryChanges,
    alerts,
    topExpenses,
    velocity: {
      dailyAvg: Math.round(dailyAvg * 100) / 100,
      projected: projectedExpenses,
      daysLeft: daysInMonth - daysElapsed,
      daysElapsed,
    },
    savingsStreak,
    byExpenseType,
    dayOfWeekSpending,
    currentSavingsRate,
  });
  } catch (e) {
    console.error("Insights API error:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Error al cargar insights" },
      { status: 500 }
    );
  }
}
