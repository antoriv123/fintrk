import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

export interface SearchResult {
  id: number;
  amount: number;
  currency: string;
  description: string;
  date: string;
  category: string;
  direction: "income" | "expense";
  tags: string[];
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    const q = req.nextUrl.searchParams.get("q")?.trim();

    if (!q || q.length < 1) {
      return NextResponse.json([]);
    }

    const like = `%${q}%`;
    const lowerQ = q.toLowerCase();

    const rows = await sql(
      `SELECT DISTINCT t.id, t.amount, t.currency, t.description, t.date, t.category, t.direction,
              STRING_AGG(tt.tag, ',') as tags_csv
       FROM transactions t
       LEFT JOIN transaction_tags tt ON tt.transaction_id = t.id
       WHERE t.user_id = $1
         AND (
           t.description ILIKE $2
           OR t.category ILIKE $3
           OR EXISTS (
             SELECT 1 FROM transaction_tags tts
             WHERE tts.transaction_id = t.id AND tts.tag ILIKE $4
           )
         )
       GROUP BY t.id, t.amount, t.currency, t.description, t.date, t.category, t.direction
       ORDER BY t.date DESC, t.id DESC
       LIMIT 20`,
      [userId, like, like, `%${lowerQ}%`]
    ) as (Omit<SearchResult, "tags"> & { tags_csv: string | null })[];

    const results: SearchResult[] = rows.map(({ tags_csv, ...row }) => ({
      ...row,
      tags: tags_csv ? tags_csv.split(",").sort() : [],
    }));

    return NextResponse.json(results);
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
