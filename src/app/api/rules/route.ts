import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

export interface RuleRow {
  id: number;
  name: string;
  match_type: "contains" | "exact" | "regex" | "account";
  match_value: string;
  category: string;
  expense_type: string | null;
  priority: number;
  is_active: number;
  times_applied: number;
  created_at: string;
}

export async function GET() {
  const userId = await getUserId();

  const rules = await sql(
    "SELECT * FROM categorization_rules WHERE user_id = $1 ORDER BY priority DESC, id ASC",
    [userId]
  ) as RuleRow[];
  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const userId = await getUserId();

  const body = (await request.json()) as {
    name?: string;
    match_type?: string;
    match_value?: string;
    category?: string;
    expense_type?: string | null;
    priority?: number;
  };

  if (!body.name || !body.match_type || !body.match_value || !body.category) {
    return NextResponse.json(
      { error: "name, match_type, match_value and category are required" },
      { status: 400 }
    );
  }

  const insertRows = await sql(
    `INSERT INTO categorization_rules (name, match_type, match_value, category, expense_type, priority, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      body.name,
      body.match_type,
      body.match_value,
      body.category,
      body.expense_type ?? null,
      body.priority ?? 0,
      userId,
    ]
  );

  const createdRows = await sql(
    "SELECT * FROM categorization_rules WHERE id = $1 AND user_id = $2",
    [insertRows[0].id, userId]
  ) as RuleRow[];

  return NextResponse.json({ rule: createdRows[0] }, { status: 201 });
}
