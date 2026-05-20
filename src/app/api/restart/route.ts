import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

export async function POST() {
  try {
    const userId = await getUserId();

    // Delete only the current user's data (NOT TRUNCATE which would wipe all users)
    // Order matters: delete dependent rows first to respect foreign keys
    await sql(
      "DELETE FROM transaction_tags WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = $1)",
      [userId]
    );
    await sql(
      "DELETE FROM budget_alerts_sent WHERE user_id = $1",
      [userId]
    );
    await sql(
      "DELETE FROM transfers WHERE from_transaction_id IN (SELECT id FROM transactions WHERE user_id = $1)",
      [userId]
    );
    await sql("DELETE FROM transactions WHERE user_id = $1", [userId]);

    return NextResponse.json({ ok: true, deleted: "user" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
