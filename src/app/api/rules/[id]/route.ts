import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import type { RuleRow } from "../route";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  const { id } = await params;

  const existingRows = await sql(
    "SELECT * FROM categorization_rules WHERE id = $1 AND user_id = $2",
    [id, userId]
  ) as RuleRow[];

  const existing = existingRows[0] ?? null;

  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const body = (await request.json()) as Partial<{
    name: string;
    match_type: string;
    match_value: string;
    category: string;
    expense_type: string | null;
    priority: number;
    is_active: number;
  }>;

  await sql(
    `UPDATE categorization_rules SET
      name = $1,
      match_type = $2,
      match_value = $3,
      category = $4,
      expense_type = $5,
      priority = $6,
      is_active = $7
    WHERE id = $8 AND user_id = $9`,
    [
      body.name ?? existing.name,
      body.match_type ?? existing.match_type,
      body.match_value ?? existing.match_value,
      body.category ?? existing.category,
      "expense_type" in body ? body.expense_type : existing.expense_type,
      body.priority ?? existing.priority,
      body.is_active ?? existing.is_active,
      id,
      userId,
    ]
  );

  const updatedRows = await sql(
    "SELECT * FROM categorization_rules WHERE id = $1 AND user_id = $2",
    [id, userId]
  ) as RuleRow[];

  return NextResponse.json({ rule: updatedRows[0] });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  const { id } = await params;

  const existingRows = await sql(
    "SELECT id FROM categorization_rules WHERE id = $1 AND user_id = $2",
    [id, userId]
  );

  if (existingRows.length === 0) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  await sql("DELETE FROM categorization_rules WHERE id = $1 AND user_id = $2", [id, userId]);
  return NextResponse.json({ success: true });
}
