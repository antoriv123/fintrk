import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import type { Transaction } from "@/lib/db";

interface TagCount {
  tag: string;
  count: number;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    const tag = req.nextUrl.searchParams.get("tag");

    if (tag) {
      // Return transactions for a specific tag
      const transactions = await sql(
        `SELECT t.* FROM transactions t
         JOIN transaction_tags tt ON tt.transaction_id = t.id
         WHERE t.user_id = $1 AND tt.tag = $2
         ORDER BY t.date DESC, t.id DESC`,
        [userId, tag.toLowerCase().trim()]
      ) as Transaction[];

      return NextResponse.json(transactions);
    }

    // Return all tags with counts (only from user's transactions)
    const tags = await sql(
      `SELECT tt.tag, COUNT(*) as count
       FROM transaction_tags tt
       JOIN transactions t ON t.id = tt.transaction_id
       WHERE t.user_id = $1
       GROUP BY tt.tag
       ORDER BY count DESC, tt.tag ASC`,
      [userId]
    ) as TagCount[];

    return NextResponse.json(tags);
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
