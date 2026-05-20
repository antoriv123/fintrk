import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existingRows = await sql(
    "SELECT id FROM investment_positions WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  if (existingRows.length === 0) {
    return NextResponse.json({ error: "Position not found" }, { status: 404 });
  }

  await sql("DELETE FROM investment_transactions WHERE position_id = $1", [id]);
  await sql("DELETE FROM investment_positions WHERE id = $1 AND user_id = $2", [id, userId]);

  return NextResponse.json({ ok: true });
}
