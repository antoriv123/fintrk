import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await req.json();
    const { ids, value } = body as { ids: number[]; value: 0 | 1 };

    if (!Array.isArray(ids) || ids.length === 0 || (value !== 0 && value !== 1)) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    // Run sequentially (replaces SQLite transaction)
    for (const id of ids) {
      await sql("UPDATE transactions SET is_reconciled = $1 WHERE id = $2 AND user_id = $3", [value, id, userId]);
    }

    return NextResponse.json({ updated: ids.length });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
