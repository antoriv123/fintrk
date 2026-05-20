import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

export async function GET() {
  const userId = await getUserId();

  // Last 30 days
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 29);

  const fromStr = from.toISOString().split("T")[0];
  const toStr = today.toISOString().split("T")[0];

  const rows = await sql(
    `SELECT date,
            SUM(CASE WHEN direction = 'expense' THEN eur_amount ELSE 0 END) as total,
            COUNT(CASE WHEN direction = 'expense' THEN 1 END) as count
     FROM transactions
     WHERE date >= $1 AND date <= $2 AND category != 'transferencia' AND user_id = $3
     GROUP BY date
     ORDER BY date ASC`,
    [fromStr, toStr, userId]
  ) as { date: string; total: number; count: number }[];

  // Fill in days with no spending as 0
  const rowMap = new Map(rows.map((r) => [r.date, r]));
  const result: { date: string; total: number; count: number }[] = [];

  const cursor = new Date(from);
  while (cursor <= today) {
    const dateStr = cursor.toISOString().split("T")[0];
    const row = rowMap.get(dateStr);
    result.push({
      date: dateStr,
      total: row ? Math.round(row.total * 100) / 100 : 0,
      count: row ? row.count : 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return NextResponse.json(result);
}
