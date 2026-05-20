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

  // Verify the transaction belongs to a position owned by this user
  const existingRows = await sql(
    `SELECT t.id FROM investment_transactions t
     JOIN investment_positions p ON p.id = t.position_id
     WHERE t.id = $1 AND p.user_id = $2`,
    [id, userId]
  );
  if (existingRows.length === 0) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  await sql("DELETE FROM investment_transactions WHERE id = $1", [id]);

  return NextResponse.json({ ok: true });
}
