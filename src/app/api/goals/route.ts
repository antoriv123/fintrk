import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { sanitizeText } from "@/lib/sanitize";

export interface SavingsGoalRow {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  is_completed: number;
  created_at: string;
  type: "savings" | "income" | "expense_limit";
  period: "monthly" | "quarterly" | "yearly" | "total";
  reward: string | null;
  icon: string;
}

export interface GoalWithProgress extends SavingsGoalRow {
  progress_amount: number;
  progress_pct: number;
  period_from: string;
  period_to: string;
}

function getPeriodDates(period: string): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === "monthly") {
    const from = new Date(year, month, 1).toISOString().split("T")[0];
    const to = new Date(year, month + 1, 0).toISOString().split("T")[0];
    return { from, to };
  }

  if (period === "quarterly") {
    const q = Math.floor(month / 3);
    const from = new Date(year, q * 3, 1).toISOString().split("T")[0];
    const to = new Date(year, q * 3 + 3, 0).toISOString().split("T")[0];
    return { from, to };
  }

  if (period === "yearly") {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    return { from, to };
  }

  // total: all time
  return { from: "2000-01-01", to: "2099-12-31" };
}

async function calculateProgress(
  userId: number,
  goal: SavingsGoalRow
): Promise<{ progress_amount: number; progress_pct: number; period_from: string; period_to: string }> {
  const { from, to } = getPeriodDates(goal.period);

  const getTotal = async (direction: string) => {
    const rows = await sql(
      "SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE user_id = $1 AND direction = $2 AND date >= $3 AND date <= $4",
      [userId, direction, from, to]
    );
    return (rows[0] as { total: number }).total;
  };

  let progress_amount = 0;

  if (goal.type === "savings") {
    const income = await getTotal("income");
    const expenses = await getTotal("expense");
    progress_amount = Math.max(0, income - expenses);
  } else if (goal.type === "income") {
    progress_amount = await getTotal("income");
  } else if (goal.type === "expense_limit") {
    const expenses = await getTotal("expense");
    progress_amount = Math.max(0, goal.target_amount - expenses);
  }

  const progress_pct =
    goal.target_amount > 0
      ? Math.min(100, Math.round((progress_amount / goal.target_amount) * 100))
      : 0;

  return { progress_amount, progress_pct, period_from: from, period_to: to };
}

export async function GET() {
  try {
    const userId = await getUserId();

    const activeGoals = await sql(
      "SELECT * FROM savings_goals WHERE user_id = $1 AND is_completed = 0 ORDER BY created_at ASC",
      [userId]
    ) as SavingsGoalRow[];

    const completedGoals = await sql(
      "SELECT * FROM savings_goals WHERE user_id = $1 AND is_completed = 1 ORDER BY created_at DESC LIMIT 10",
      [userId]
    ) as SavingsGoalRow[];

    const allGoals = [...activeGoals, ...completedGoals];
    if (allGoals.length === 0) {
      return NextResponse.json({ goals: [], completed: [] });
    }

    // Pre-fetch totals for all unique periods in a single batch (2 queries max instead of 2*N)
    const periods = new Set(allGoals.map(g => g.period));
    const periodTotals = new Map<string, { income: number; expenses: number; from: string; to: string }>();

    for (const period of periods) {
      const { from, to } = getPeriodDates(period);
      const rows = await sql(
        `SELECT
          COALESCE(SUM(CASE WHEN direction = 'income' THEN eur_amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN direction = 'expense' THEN eur_amount ELSE 0 END), 0) as expenses
        FROM transactions WHERE user_id = $1 AND date >= $2 AND date <= $3`,
        [userId, from, to]
      );
      periodTotals.set(period, {
        income: Number(rows[0].income),
        expenses: Number(rows[0].expenses),
        from,
        to,
      });
    }

    function computeProgress(goal: SavingsGoalRow): GoalWithProgress {
      const pt = periodTotals.get(goal.period) ?? { income: 0, expenses: 0, from: "", to: "" };
      let progress_amount = 0;

      if (goal.type === "savings") {
        progress_amount = Math.max(0, pt.income - pt.expenses);
      } else if (goal.type === "income") {
        progress_amount = pt.income;
      } else if (goal.type === "expense_limit") {
        progress_amount = Math.max(0, goal.target_amount - pt.expenses);
      }

      const progress_pct = goal.target_amount > 0
        ? Math.min(100, Math.round((progress_amount / goal.target_amount) * 100))
        : 0;

      return { ...goal, progress_amount, progress_pct, period_from: pt.from, period_to: pt.to };
    }

    const goalsWithProgress = activeGoals.map(computeProgress);
    const completedWithProgress = completedGoals.map(computeProgress);

    return NextResponse.json({ goals: goalsWithProgress, completed: completedWithProgress });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    const body = (await request.json()) as {
      name?: string;
      target_amount?: number;
      deadline?: string;
      type?: string;
      period?: string;
      reward?: string;
      icon?: string;
    };

    if (!body.name || !body.target_amount) {
      return NextResponse.json({ error: "name and target_amount are required" }, { status: 400 });
    }

    const name = sanitizeText(body.name, 100);
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const VALID_TYPES = ["savings", "income", "expense_limit"] as const;
    const type = VALID_TYPES.includes(body.type as typeof VALID_TYPES[number])
      ? (body.type as typeof VALID_TYPES[number])
      : "savings";

    const VALID_PERIODS = ["monthly", "quarterly", "yearly", "total"] as const;
    const period = VALID_PERIODS.includes(body.period as typeof VALID_PERIODS[number])
      ? (body.period as typeof VALID_PERIODS[number])
      : "monthly";

    const rows = await sql(
      "INSERT INTO savings_goals (user_id, name, target_amount, deadline, type, period, reward, icon) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
      [
        userId,
        name,
        body.target_amount,
        body.deadline ?? null,
        type,
        period,
        body.reward ?? null,
        body.icon ?? "🎯",
      ]
    );

    const created = rows[0] as SavingsGoalRow;

    const withProgress: GoalWithProgress = {
      ...created,
      ...(await calculateProgress(userId, created)),
    };

    return NextResponse.json({ goal: withProgress }, { status: 201 });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
