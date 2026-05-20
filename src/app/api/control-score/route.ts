import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

// Financial control index: how well organized are your finances
// Each criterion contributes to the score (0-100%)
export async function GET() {
  try {
    const userId = await getUserId();

    const checks = {
      hasAccounts: false,       // 15 pts: at least 1 account
      multipleAccounts: false,  // 5 pts: 2+ accounts
      hasTransactions: false,   // 10 pts: at least 1 transaction
      recent: false,            // 15 pts: transaction in last 7 days
      categorized: false,       // 10 pts: 90%+ transactions have non-"otros" category
      hasBudget: false,         // 10 pts: at least 1 budget set
      hasGoal: false,           // 10 pts: at least 1 savings goal
      hasFixedExpenses: false,  // 5 pts: fixed expenses configured
      streak: false,            // 10 pts: daily streak >= 3
      aiInsight: false,         // 10 pts: generated at least 1 AI insight
    };

    // Accounts
    const accountRows = await sql("SELECT COUNT(*) as c FROM accounts WHERE user_id = $1 AND is_active = 1", [userId]);
    const accountCount = accountRows[0]?.c ?? 0;
    checks.hasAccounts = accountCount >= 1;
    checks.multipleAccounts = accountCount >= 2;

    // Transactions
    const txRows = await sql("SELECT COUNT(*) as c FROM transactions WHERE user_id = $1", [userId]);
    const txCount = txRows[0]?.c ?? 0;
    checks.hasTransactions = txCount > 0;

    // Recent activity
    const recentRows = await sql(
      "SELECT COUNT(*) as c FROM transactions WHERE user_id = $1 AND date >= (CURRENT_DATE - INTERVAL '7 days')::text",
      [userId]
    );
    checks.recent = (recentRows[0]?.c ?? 0) > 0;

    // Categorized transactions
    if (txCount > 0) {
      const otrosRows = await sql(
        "SELECT COUNT(*) as c FROM transactions WHERE user_id = $1 AND category IN ('otros', 'otros_ingresos')",
        [userId]
      );
      const otrosCount = otrosRows[0]?.c ?? 0;
      checks.categorized = (otrosCount / txCount) < 0.1;
    }

    // Budgets
    const budgetRows = await sql("SELECT COUNT(*) as c FROM budgets WHERE user_id = $1", [userId]);
    checks.hasBudget = (budgetRows[0]?.c ?? 0) > 0;

    // Goals
    const goalRows = await sql("SELECT COUNT(*) as c FROM savings_goals WHERE user_id = $1", [userId]);
    checks.hasGoal = (goalRows[0]?.c ?? 0) > 0;

    // Fixed expenses
    const fixedRows = await sql("SELECT COUNT(*) as c FROM subscriptions WHERE user_id = $1", [userId]);
    checks.hasFixedExpenses = (fixedRows[0]?.c ?? 0) > 0;

    // Streak
    const streakRows = await sql("SELECT current_streak FROM streaks WHERE user_id = $1", [userId]);
    checks.streak = (streakRows[0]?.current_streak ?? 0) >= 3;

    // AI insight
    const insightRows = await sql(
      "SELECT COUNT(*) as c FROM app_settings WHERE user_id = $1 AND key = 'ai_insights_cache'",
      [userId]
    );
    checks.aiInsight = (insightRows[0]?.c ?? 0) > 0;

    // Calculate score
    const weights: Record<string, number> = {
      hasAccounts: 15,
      multipleAccounts: 5,
      hasTransactions: 10,
      recent: 15,
      categorized: 10,
      hasBudget: 10,
      hasGoal: 10,
      hasFixedExpenses: 5,
      streak: 10,
      aiInsight: 10,
    };

    let score = 0;
    const details: { label: string; done: boolean; points: number }[] = [];

    const labels: Record<string, string> = {
      hasAccounts: "Al menos una cuenta",
      multipleAccounts: "Dos o más cuentas",
      hasTransactions: "Primer movimiento registrado",
      recent: "Actividad en los últimos 7 días",
      categorized: "Movimientos bien categorizados",
      hasBudget: "Presupuesto configurado",
      hasGoal: "Objetivo de ahorro activo",
      hasFixedExpenses: "Gastos fijos registrados",
      streak: "Racha de 3+ días",
      aiInsight: "Análisis IA generado",
    };

    for (const [key, weight] of Object.entries(weights)) {
      const done = checks[key as keyof typeof checks];
      if (done) score += weight;
      details.push({ label: labels[key] ?? key, done, points: weight });
    }

    return NextResponse.json({ score, details });
  } catch (e) {
    console.error("Control score error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
