import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import type { SavingsGoalRow, GoalWithProgress } from "../route";

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
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
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
    progress_amount = Math.max(0, (await getTotal("income")) - (await getTotal("expense")));
  } else if (goal.type === "income") {
    progress_amount = await getTotal("income");
  } else if (goal.type === "expense_limit") {
    progress_amount = Math.max(0, goal.target_amount - (await getTotal("expense")));
  }

  const progress_pct =
    goal.target_amount > 0
      ? Math.min(100, Math.round((progress_amount / goal.target_amount) * 100))
      : 0;

  return { progress_amount, progress_pct, period_from: from, period_to: to };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id } = await params;

    const existingRows = await sql(
      "SELECT * FROM savings_goals WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    const existing = existingRows[0] as SavingsGoalRow | undefined;

    if (!existing) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const body = (await request.json()) as Partial<{
      name: string;
      target_amount: number;
      deadline: string | null;
      type: string;
      period: string;
      reward: string | null;
      icon: string;
      is_completed: number;
    }>;

    await sql(
      `UPDATE savings_goals SET
        name = $1,
        target_amount = $2,
        deadline = $3,
        type = $4,
        period = $5,
        reward = $6,
        icon = $7,
        is_completed = $8
      WHERE id = $9 AND user_id = $10`,
      [
        body.name ?? existing.name,
        body.target_amount ?? existing.target_amount,
        "deadline" in body ? body.deadline : existing.deadline,
        body.type ?? existing.type,
        body.period ?? existing.period,
        "reward" in body ? body.reward : existing.reward,
        body.icon ?? existing.icon,
        body.is_completed ?? existing.is_completed,
        id,
        userId,
      ]
    );

    const updatedRows = await sql(
      "SELECT * FROM savings_goals WHERE id = $1 AND user_id = $2",
      [id, userId]
    );
    const updated = updatedRows[0] as SavingsGoalRow;

    const withProgress: GoalWithProgress = {
      ...updated,
      ...(await calculateProgress(userId, updated)),
    };

    return NextResponse.json({ goal: withProgress });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id } = await params;

    const existingRows = await sql(
      "SELECT id FROM savings_goals WHERE id = $1 AND user_id = $2",
      [id, userId]
    );

    if (existingRows.length === 0) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    await sql("DELETE FROM savings_goals WHERE id = $1 AND user_id = $2", [id, userId]);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
