import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

export async function POST(
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

    const rows = await sql("SELECT is_reconciled FROM transactions WHERE id = $1 AND user_id = $2", [id, userId]);
    const tx = rows[0] as { is_reconciled: number } | undefined;

    if (!tx) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const newValue = tx.is_reconciled ? 0 : 1;
    await sql("UPDATE transactions SET is_reconciled = $1 WHERE id = $2 AND user_id = $3", [newValue, id, userId]);

    return NextResponse.json({ is_reconciled: newValue });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
