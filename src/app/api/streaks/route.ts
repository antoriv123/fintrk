import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

export async function GET() {
  const userId = await getUserId();
  const now = new Date();
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  // Los logros cuentan SOLO a partir de la fecha en que el user se registro en
  // Fintrk. Si alguien importa 3 anios de extractos historicos no deberia
  // desbloquear "Un anio entero" ni "Trimestre en verde" retroactivamente.
  const [joinRow] = (await sql(
    "SELECT created_at FROM users WHERE id = $1",
    [userId],
  )) as { created_at: string | Date }[];
  const joinDate = joinRow?.created_at
    ? new Date(joinRow.created_at)
    : new Date(now.getFullYear(), now.getMonth() - 23, 1);
  const joinDateStr = joinDate.toISOString().slice(0, 10);

  // Single query: get monthly income/expenses desde registro. Limitado a 24 meses max.
  const twoYearsAgo = new Date(now.getFullYear(), now.getMonth() - 23, 1);
  const effectiveStart = joinDate > twoYearsAgo ? joinDate : twoYearsAgo;
  const fromDate = `${effectiveStart.getFullYear()}-${String(effectiveStart.getMonth() + 1).padStart(2, "0")}-01`;

  const monthlyRows = await sql(
    `SELECT
      TO_CHAR(TO_DATE(date, 'YYYY-MM-DD'), 'YYYY-MM') as month_key,
      COALESCE(SUM(CASE WHEN direction = 'income' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN direction = 'expense' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as expenses
    FROM transactions
    WHERE user_id = $1 AND date >= $2
    GROUP BY month_key
    ORDER BY month_key`,
    [userId, fromDate]
  ) as { month_key: string; income: number; expenses: number }[];

  // Build monthly data from the query results
  const monthMap = new Map(monthlyRows.map(r => [r.month_key, { income: Number(r.income), expenses: Number(r.expenses) }]));

  const monthlyData: { month: string; income: number; expenses: number; savings: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const data = monthMap.get(key) ?? { income: 0, expenses: 0 };
    monthlyData.push({
      month: `${months[d.getMonth()]} ${d.getFullYear()}`,
      income: data.income,
      expenses: data.expenses,
      savings: data.income - data.expenses,
    });
  }

  const activeMonths = monthlyData.filter((m) => m.income > 0 || m.expenses > 0);

  // Savings streak
  let savingsStreak = 0;
  for (let i = activeMonths.length - 1; i >= 0; i--) {
    if (activeMonths[i].savings > 0) savingsStreak++;
    else break;
  }

  let bestSavingsStreak = 0;
  let currentStreak = 0;
  for (const m of activeMonths) {
    if (m.savings > 0) {
      currentStreak++;
      bestSavingsStreak = Math.max(bestSavingsStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  let underBudgetStreak = 0;
  for (let i = activeMonths.length - 1; i >= 0; i--) {
    if (activeMonths[i].expenses < activeMonths[i].income) underBudgetStreak++;
    else break;
  }

  // All stats in a single batch (3 queries instead of 48+4)
  const [totalTxRows, totalIncomeRows, totalExpenseRows, firstTxRows] = await Promise.all([
    sql("SELECT COUNT(*) as count FROM transactions WHERE user_id = $1 AND date >= $2", [userId, joinDateStr]),
    sql("SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE user_id = $1 AND direction = 'income' AND category != 'transferencia' AND date >= $2", [userId, joinDateStr]),
    sql("SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND date >= $2", [userId, joinDateStr]),
    sql("SELECT date FROM transactions WHERE user_id = $1 AND date >= $2 ORDER BY date ASC LIMIT 1", [userId, joinDateStr]),
  ]);

  const totalTransactions = Number(totalTxRows[0].count);
  const totalIncome = Number(totalIncomeRows[0].total);
  const totalExpenses = Number(totalExpenseRows[0].total);
  const totalSaved = totalIncome - totalExpenses;

  const bestMonth = activeMonths.reduce(
    (best, m) => (m.savings > best.savings ? m : best),
    { month: "—", savings: 0, income: 0, expenses: 0 }
  );

  const worstMonth = activeMonths.reduce(
    (worst, m) => (m.savings < worst.savings ? m : worst),
    { month: "—", savings: Infinity, income: 0, expenses: 0 }
  );
  if (worstMonth.savings === Infinity) worstMonth.savings = 0;

  const cheapestMonth = activeMonths.filter((m) => m.expenses > 0).reduce(
    (best, m) => (m.expenses < best.expenses ? m : best),
    { month: "—", expenses: Infinity, income: 0, savings: 0 }
  );
  if (cheapestMonth.expenses === Infinity) cheapestMonth.expenses = 0;

  const highestEarning = activeMonths.reduce(
    (best, m) => (m.income > best.income ? m : best),
    { month: "—", income: 0, expenses: 0, savings: 0 }
  );

  const firstTx = firstTxRows[0] as { date: string } | undefined;
  // Tracking arranca el dia del registro (no la primera tx), para que los logros
  // de tracking reflejen cuanto tiempo lleva usando Fintrk.
  const trackingSince = joinDateStr;
  const trackingDays = Math.max(
    1,
    Math.ceil((Date.now() - joinDate.getTime()) / 86400000),
  );
  void firstTx; // conservado por claridad, por si mas tarde queremos el first-tx separado

  // Queries adicionales para los nuevos logros.
  const [aiScanRows, accountsRows, categorizedRows, categoriesUsedRows] = await Promise.all([
    sql(
      "SELECT COUNT(*)::int as count FROM transactions WHERE user_id = $1 AND category != 'otros' AND category != 'otros-ingreso' AND category != 'transferencia' AND date >= $2",
      [userId, joinDateStr],
    ).catch(() => [{ count: 0 }]),
    sql("SELECT COUNT(*)::int as count FROM accounts WHERE user_id = $1 AND created_at >= $2", [userId, joinDateStr]).catch(() => [{ count: 0 }]),
    sql(
      "SELECT COUNT(*)::int as count FROM transactions WHERE user_id = $1 AND category IN ('otros', 'otros-ingreso') AND date >= $2",
      [userId, joinDateStr],
    ).catch(() => [{ count: 0 }]),
    sql(
      "SELECT COUNT(DISTINCT category)::int as count FROM transactions WHERE user_id = $1 AND category NOT IN ('otros', 'otros-ingreso', 'transferencia') AND date >= $2",
      [userId, joinDateStr],
    ).catch(() => [{ count: 0 }]),
  ]);
  const categorizedCount = Number((categorizedRows[0] as { count: number }).count);
  const uncategorizedCount = Number((aiScanRows[0] as { count: number }).count);
  const accountsCount = Number((accountsRows[0] as { count: number }).count);
  const uniqueCategoriesUsed = Number((categoriesUsedRows[0] as { count: number }).count);

  // Achievements — tier para estilo visual: bronze/silver/gold/platinum.
  interface Achievement {
    id: string; name: string; description: string; icon: string; tier: "bronze" | "silver" | "gold" | "platinum";
    unlocked: boolean; progress?: number; target?: number;
  }

  const achievements: Achievement[] = [
    // Transacciones
    { id: "first-tx", name: "El primer paso", description: "Registra tu primera transacción", icon: "Sparkles", tier: "bronze", unlocked: totalTransactions > 0 },
    { id: "tx-100", name: "Constante", description: "100 movimientos registrados", icon: "Activity", tier: "silver", unlocked: totalTransactions >= 100, progress: Math.min(totalTransactions, 100), target: 100 },
    { id: "tx-500", name: "Disciplinado", description: "500 movimientos registrados", icon: "LineChart", tier: "gold", unlocked: totalTransactions >= 500, progress: Math.min(totalTransactions, 500), target: 500 },
    { id: "tx-1000", name: "Maestro del registro", description: "1.000 movimientos registrados", icon: "Trophy", tier: "platinum", unlocked: totalTransactions >= 1000, progress: Math.min(totalTransactions, 1000), target: 1000 },
    // Ahorro mensual consecutivo
    { id: "savings-1", name: "Primer mes en verde", description: "Cierra un mes con balance positivo", icon: "Leaf", tier: "bronze", unlocked: savingsStreak >= 1 },
    { id: "savings-3", name: "Trimestre en verde", description: "3 meses seguidos ahorrando", icon: "TrendingUp", tier: "silver", unlocked: bestSavingsStreak >= 3, progress: Math.min(bestSavingsStreak, 3), target: 3 },
    { id: "savings-6", name: "Medio año constante", description: "6 meses seguidos ahorrando", icon: "Target", tier: "gold", unlocked: bestSavingsStreak >= 6, progress: Math.min(bestSavingsStreak, 6), target: 6 },
    { id: "savings-12", name: "Año impecable", description: "12 meses consecutivos ahorrando", icon: "Award", tier: "platinum", unlocked: bestSavingsStreak >= 12, progress: Math.min(bestSavingsStreak, 12), target: 12 },
    // Ahorro total
    { id: "saved-1k", name: "Primer colchón", description: "€1.000 acumulados", icon: "Coins", tier: "silver", unlocked: totalSaved >= 1000, progress: Math.min(Math.round(totalSaved), 1000), target: 1000 },
    { id: "saved-5k", name: "Red de seguridad", description: "€5.000 acumulados", icon: "Gem", tier: "gold", unlocked: totalSaved >= 5000, progress: Math.min(Math.round(totalSaved), 5000), target: 5000 },
    { id: "saved-10k", name: "Cinco cifras", description: "€10.000 acumulados", icon: "Rocket", tier: "platinum", unlocked: totalSaved >= 10000, progress: Math.min(Math.round(totalSaved), 10000), target: 10000 },
    // Tracking tiempo
    { id: "tracking-30", name: "Primer mes tracking", description: "30 días usando Fintrk", icon: "CalendarCheck", tier: "bronze", unlocked: trackingDays >= 30, progress: Math.min(trackingDays, 30), target: 30 },
    { id: "tracking-90", name: "Trimestre tracking", description: "90 días usando Fintrk", icon: "CalendarRange", tier: "silver", unlocked: trackingDays >= 90, progress: Math.min(trackingDays, 90), target: 90 },
    { id: "tracking-365", name: "Un año entero", description: "365 días usando Fintrk", icon: "CalendarHeart", tier: "platinum", unlocked: trackingDays >= 365, progress: Math.min(trackingDays, 365), target: 365 },
    // Organizacion
    { id: "categorized-50", name: "Organizado", description: "50 gastos con categoría clara", icon: "LayoutGrid", tier: "silver", unlocked: categorizedCount >= 50, progress: Math.min(categorizedCount, 50), target: 50 },
    { id: "clean-slate", name: "Orden total", description: "0 movimientos sin categorizar", icon: "CheckCircle2", tier: "gold", unlocked: uncategorizedCount === 0 && totalTransactions > 10 },
    { id: "explorer", name: "Explorador", description: "Usa 5 categorías distintas", icon: "Compass", tier: "bronze", unlocked: uniqueCategoriesUsed >= 5, progress: Math.min(uniqueCategoriesUsed, 5), target: 5 },
    // Cuentas
    { id: "multi-account", name: "Vista completa", description: "Conecta 2 cuentas o más", icon: "Wallet", tier: "silver", unlocked: accountsCount >= 2, progress: Math.min(accountsCount, 2), target: 2 },
  ];

  return NextResponse.json({
    streaks: { savings: savingsStreak, bestSavings: bestSavingsStreak, underBudget: underBudgetStreak },
    records: { bestMonth, worstMonth, cheapestMonth, highestEarning },
    totals: {
      transactions: totalTransactions,
      income: Math.round(totalIncome * 100) / 100,
      expenses: Math.round(totalExpenses * 100) / 100,
      saved: Math.round(totalSaved * 100) / 100,
    },
    tracking: { since: trackingSince, days: trackingDays },
    achievements,
    monthsTracked: activeMonths.length,
  });
}
