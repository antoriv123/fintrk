import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { accrueInterest } from "@/lib/interest";
import { getUserId } from "@/lib/get-user-id";
import type { AccountBalance, BalancesResponse } from "@/lib/api-types";

export type { AccountBalance, BalancesResponse };

interface AccountRow {
  slug: string;
  name: string;
  emoji: string;
  initial_balance: number;
  color: string;
}

interface BalanceRow {
  account: string | null;
  income: number;
  expenses: number;
}

export async function GET(): Promise<NextResponse<BalancesResponse>> {
  const userId = await getUserId();

  await accrueInterest(userId);

  // Get per-account transaction sums (include ALL transactions for correct balance)
  const txRows = await sql(
    `SELECT
      account,
      SUM(CASE WHEN direction = 'income' THEN eur_amount ELSE 0 END) AS income,
      SUM(CASE WHEN direction = 'expense' THEN eur_amount ELSE 0 END) AS expenses
    FROM transactions
    WHERE user_id = $1
    GROUP BY account`,
    [userId]
  ) as BalanceRow[];

  const txByAccount = new Map<string, { income: number; expenses: number }>();
  let unassignedIncome = 0;
  let unassignedExpenses = 0;

  for (const row of txRows) {
    if (row.account === null || row.account === "") {
      unassignedIncome += row.income ?? 0;
      unassignedExpenses += row.expenses ?? 0;
    } else {
      txByAccount.set(row.account, { income: row.income ?? 0, expenses: row.expenses ?? 0 });
    }
  }

  const unassigned = unassignedIncome - unassignedExpenses;

  try {
    const accountRows = await sql(
      `SELECT slug, name, emoji, initial_balance, color
       FROM accounts
       WHERE is_active = 1 AND user_id = $1
       ORDER BY id ASC`,
      [userId]
    ) as AccountRow[];

    const accounts: AccountBalance[] = accountRows.map((a) => {
      const tx = txByAccount.get(a.slug) ?? { income: 0, expenses: 0 };
      const balance = (a.initial_balance ?? 0) + tx.income - tx.expenses;
      return {
        slug: a.slug,
        name: a.name,
        emoji: a.emoji ?? "💳",
        balance,
        color: a.color ?? "#6b7280",
      };
    });

    const total = accounts.reduce((sum, a) => sum + a.balance, 0) + unassigned;

    return NextResponse.json({ accounts, total, unassigned });
  } catch {
    // accounts table doesn't exist yet — return totals from transactions only
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const tx of txByAccount.values()) {
      totalIncome += tx.income;
      totalExpenses += tx.expenses;
    }
    totalIncome += unassignedIncome;
    totalExpenses += unassignedExpenses;

    return NextResponse.json({
      accounts: [],
      total: totalIncome - totalExpenses,
      unassigned: 0,
    });
  }
}
