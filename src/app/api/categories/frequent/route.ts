import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

export async function GET() {
  try {
    const userId = await getUserId();

    const rows = await sql(
      `SELECT category, COUNT(*) as count
       FROM transactions
       WHERE user_id = $1 AND category IS NOT NULL AND category != '' AND category != 'transferencia'
       GROUP BY category
       ORDER BY count DESC
       LIMIT 10`,
      [userId]
    ) as { category: string; count: number }[];

    return NextResponse.json(rows);
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
