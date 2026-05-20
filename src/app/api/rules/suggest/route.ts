import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

interface SuggestionRow {
  description: string;
  category: string;
  cnt: number;
}

export async function POST() {
  const userId = await getUserId();

  const rows = await sql(
    `SELECT description, category, COUNT(*) as cnt
     FROM transactions
     WHERE user_id = $1
     GROUP BY LOWER(description), category
     HAVING COUNT(*) >= 2
     ORDER BY cnt DESC
     LIMIT 20`,
    [userId]
  ) as SuggestionRow[];

  const suggestions = rows.map((row) => ({
    name: `${row.description} → ${row.category}`,
    match_type: "contains",
    match_value: row.description,
    category: row.category,
    expense_type: null,
    priority: 0,
    count: row.cnt,
  }));

  return NextResponse.json({ suggestions });
}
