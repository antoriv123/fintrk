import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { analyzeAccount } from "@/lib/ai";
import { getUserId } from "@/lib/get-user-id";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";

export async function GET() {
  const userId = await getUserId();

  const rl = await checkAiRateLimit(Number(userId), "analyze");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Limite alcanzado. Espera ${rl.retryAfterSec}s.` },
      { status: 429 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "AI no configurada" },
      { status: 503 }
    );
  }

  // Gather data for analysis
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsStr = sixMonthsAgo.toISOString().slice(0, 10);

  const [balanceRows, monthlyRows, categoryRows, recurringRows, accountRows] =
    await Promise.all([
      // Total balance
      sql(
        `SELECT
          COALESCE(SUM(CASE WHEN direction='income' THEN eur_amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN direction='expense' THEN eur_amount ELSE 0 END), 0) as net
        FROM transactions WHERE user_id = $1`,
        [userId]
      ),

      // Monthly trends (last 6 months)
      sql(
        `SELECT
          TO_CHAR(date::date, 'YYYY-MM') as month,
          COALESCE(SUM(CASE WHEN direction='income' THEN eur_amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN direction='expense' THEN eur_amount ELSE 0 END), 0) as expenses
        FROM transactions
        WHERE user_id = $1 AND date >= $2 AND category != 'transferencia'
        GROUP BY TO_CHAR(date::date, 'YYYY-MM')
        ORDER BY month DESC
        LIMIT 6`,
        [userId, sixMonthsStr]
      ),

      // Top expense categories this month
      sql(
        `SELECT category, SUM(eur_amount) as amount
        FROM transactions
        WHERE user_id = $1 AND direction = 'expense'
          AND date LIKE $2 AND category != 'transferencia'
        GROUP BY category
        ORDER BY amount DESC
        LIMIT 8`,
        [userId, `${thisMonth}%`]
      ),

      // Recurring expenses
      sql(
        `SELECT description, average_amount as amount
        FROM recurring_transactions
        WHERE user_id = $1 AND direction = 'expense' AND is_active = 1
        ORDER BY average_amount DESC
        LIMIT 10`,
        [userId]
      ),

      // Account balances
      sql(
        `SELECT a.name,
          a.initial_balance
          + COALESCE(SUM(CASE WHEN t.direction='income' THEN t.eur_amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN t.direction='expense' THEN t.eur_amount ELSE 0 END), 0) as balance
        FROM accounts a
        LEFT JOIN transactions t ON t.account = a.slug AND t.user_id = a.user_id
        WHERE a.user_id = $1 AND a.is_active = 1
        GROUP BY a.id, a.name, a.initial_balance
        ORDER BY balance DESC`,
        [userId]
      ),
    ]);

  const accountInitialSum = accountRows.reduce(
    (sum: number, a: { balance: number }) => sum + (a.balance ?? 0),
    0
  );
  const txNet = Number(balanceRows[0]?.net ?? 0);
  const totalBalance = accountInitialSum > 0 ? accountInitialSum : txNet;

  const currentMonth = monthlyRows.find(
    (m: { month: string }) => m.month === thisMonth
  );
  const monthlyIncome = Number(currentMonth?.income ?? 0);
  const monthlyExpenses = Number(currentMonth?.expenses ?? 0);
  const savingsRate =
    monthlyIncome > 0
      ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100
      : 0;

  const analysis = await analyzeAccount({
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
    savingsRate,
    topCategories: categoryRows.map((c: { category: string; amount: number }) => ({
      category: c.category,
      amount: Number(c.amount),
    })),
    recentTrends: monthlyRows.map(
      (m: { month: string; income: number; expenses: number }) => ({
        month: m.month,
        income: Number(m.income),
        expenses: Number(m.expenses),
      })
    ),
    recurringExpenses: recurringRows.map(
      (r: { description: string; amount: number }) => ({
        description: r.description,
        amount: Number(r.amount),
      })
    ),
    accountBreakdown: accountRows.map(
      (a: { name: string; balance: number }) => ({
        name: a.name,
        balance: Number(a.balance),
      })
    ),
  });

  return NextResponse.json({
    analysis,
    summary: {
      totalBalance,
      monthlyIncome,
      monthlyExpenses,
      savingsRate,
    },
  });
}
