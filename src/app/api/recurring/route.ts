import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

interface RecurringRow {
  id: number;
  description: string;
  category: string;
  expense_type: string | null;
  direction: string;
  average_amount: number;
  currency: string;
  frequency: string;
  is_active: number;
  last_seen: string | null;
  created_at: string;
}

interface MonthTransactionRow {
  description: string;
}

export async function GET() {
  const userId = await getUserId();

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const from = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

  const recurring = await sql(
    "SELECT * FROM recurring_transactions WHERE is_active = 1 AND user_id = $1 ORDER BY direction, average_amount DESC",
    [userId]
  ) as RecurringRow[];

  // Fetch distinct lowercased descriptions that appear this month
  const thisMonthRows = await sql(
    `SELECT DISTINCT LOWER(TRIM(description)) AS description
     FROM transactions
     WHERE date >= $1 AND date <= $2 AND user_id = $3`,
    [from, to, userId]
  ) as MonthTransactionRow[];

  const paidThisMonth = new Set(thisMonthRows.map((r) => r.description));

  const result = recurring.map((r) => ({
    id: r.id,
    description: r.description,
    category: r.category,
    expense_type: r.expense_type,
    direction: r.direction,
    average_amount: r.average_amount,
    currency: r.currency,
    frequency: r.frequency,
    last_seen: r.last_seen,
    paid_this_month: paidThisMonth.has(r.description.toLowerCase()),
  }));

  return NextResponse.json({ recurring: result });
}
