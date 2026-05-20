import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    // Verify the transfer belongs to this user by checking the linked transactions
    const transferRows = await sql(
      `SELECT t.* FROM transfers t
      JOIN transactions ft ON ft.id = t.from_transaction_id AND ft.user_id = $1
      WHERE t.id = $2`,
      [userId, id]
    );
    const transfer = transferRows[0] as {
      id: number;
      from_transaction_id: number;
      to_transaction_id: number;
    } | undefined;

    if (!transfer) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    await sql("DELETE FROM transaction_tags WHERE transaction_id = $1", [transfer.from_transaction_id]);
    await sql("DELETE FROM transaction_tags WHERE transaction_id = $1", [transfer.to_transaction_id]);
    await sql("DELETE FROM transactions WHERE id = $1 AND user_id = $2", [transfer.from_transaction_id, userId]);
    await sql("DELETE FROM transactions WHERE id = $1 AND user_id = $2", [transfer.to_transaction_id, userId]);
    await sql("DELETE FROM transfers WHERE id = $1", [id]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
