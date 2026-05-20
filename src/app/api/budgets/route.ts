import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

interface EnvelopeRow {
  id: number;
  name: string;
  category: string;
  budgeted: number;
  month: string;
  rollover: number;
  created_at: string;
}

interface SpentRow {
  category: string;
  spent: number;
}

interface IncomeRow {
  total: number;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getPreviousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthDateRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const month = request.nextUrl.searchParams.get("month") ?? getCurrentMonth();
    const { from, to } = monthDateRange(month);
    const prevMonth = getPreviousMonth(month);
    const prevRange = monthDateRange(prevMonth);

    // Get envelopes for this month
    const envelopes = await sql(
      "SELECT * FROM envelopes WHERE user_id = $1 AND month = $2 ORDER BY category",
      [userId, month]
    ) as EnvelopeRow[];

    // Get spending by category for this month (expense only, exclude transfers)
    const spentRows = await sql(
      `SELECT category, COALESCE(SUM(eur_amount), 0) as spent
       FROM transactions
       WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND date >= $2 AND date <= $3
       GROUP BY category`,
      [userId, from, to]
    ) as SpentRow[];

    const spentMap = new Map(spentRows.map((r) => [r.category, r.spent]));

    // Get previous month spending for rollover calculation
    const prevSpentRows = await sql(
      `SELECT category, COALESCE(SUM(eur_amount), 0) as spent
       FROM transactions
       WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND date >= $2 AND date <= $3
       GROUP BY category`,
      [userId, prevRange.from, prevRange.to]
    ) as SpentRow[];

    const prevSpentMap = new Map(prevSpentRows.map((r) => [r.category, r.spent]));

    // Get previous month envelopes for rollover
    const prevEnvelopes = await sql(
      "SELECT category, budgeted FROM envelopes WHERE user_id = $1 AND month = $2",
      [userId, prevMonth]
    ) as { category: string; budgeted: number }[];

    const prevBudgetMap = new Map(prevEnvelopes.map((e) => [e.category, e.budgeted]));

    // Get total income for this month
    const incomeRows = await sql(
      `SELECT COALESCE(SUM(eur_amount), 0) as total
       FROM transactions
       WHERE user_id = $1 AND direction = 'income' AND category != 'transferencia' AND date >= $2 AND date <= $3`,
      [userId, from, to]
    );
    const incomeRow = incomeRows[0] as IncomeRow;

    const totalIncome = incomeRow.total;

    const envelopeResults = envelopes.map((env) => {
      const spent = Math.round((spentMap.get(env.category) ?? 0) * 100) / 100;
      let rolloverAmount = 0;
      if (env.rollover === 1) {
        const prevBudgeted = prevBudgetMap.get(env.category) ?? 0;
        const prevSpent = prevSpentMap.get(env.category) ?? 0;
        rolloverAmount = Math.max(0, Math.round((prevBudgeted - prevSpent) * 100) / 100);
      }
      const totalBudget = env.budgeted + rolloverAmount;
      const remaining = Math.round((totalBudget - spent) * 100) / 100;
      const percentage = totalBudget > 0 ? Math.round((spent / totalBudget) * 100) : 0;

      return {
        id: env.id,
        name: env.name,
        category: env.category,
        budgeted: env.budgeted,
        spent,
        remaining,
        percentage,
        rollover: env.rollover,
        rollover_amount: rolloverAmount,
      };
    });

    const totalBudgeted = envelopeResults.reduce((s, e) => s + e.budgeted, 0);
    const totalSpent = envelopeResults.reduce((s, e) => s + e.spent, 0);

    return NextResponse.json({
      month,
      envelopes: envelopeResults,
      totals: {
        income: Math.round(totalIncome * 100) / 100,
        budgeted: Math.round(totalBudgeted * 100) / 100,
        spent: Math.round(totalSpent * 100) / 100,
        unassigned: Math.round((totalIncome - totalBudgeted) * 100) / 100,
      },
    });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { category, budgeted, month, name, rollover } = body as {
      category: string;
      budgeted: number;
      month: string;
      name?: string;
      rollover?: boolean;
    };

    if (!category || budgeted == null || !month) {
      return NextResponse.json({ error: "category, budgeted, and month are required" }, { status: 400 });
    }

    const envelopeName = name ?? category;
    const rolloverInt = rollover ? 1 : 0;

    await sql(
      `INSERT INTO envelopes (user_id, name, category, budgeted, month, rollover)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(user_id, category, month) DO UPDATE SET
         name = EXCLUDED.name,
         budgeted = EXCLUDED.budgeted,
         rollover = EXCLUDED.rollover`,
      [userId, envelopeName, category, budgeted, month, rolloverInt]
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await request.json();
    const { id } = body as { id: number };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await sql("DELETE FROM envelopes WHERE id = $1 AND user_id = $2", [id, userId]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
