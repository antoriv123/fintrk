import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

/**
 * Suggest category based on user's past categorization patterns.
 * Looks for transactions with similar descriptions and returns the most common category.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await req.json();
    const { description } = body;

    if (!description || typeof description !== "string" || description.length < 3) {
      return NextResponse.json({ category: null });
    }

    // Strategy 1: Exact match on first 10 chars (strongest signal)
    const exactMatch = await sql(
      `SELECT category, expense_type, COUNT(*) as cnt
       FROM transactions
       WHERE user_id = $1 AND LOWER(LEFT(description, 10)) = LOWER(LEFT($2, 10))
       AND category != 'otros' AND category != 'transferencia'
       GROUP BY category, expense_type
       ORDER BY cnt DESC
       LIMIT 1`,
      [userId, description]
    );

    if (exactMatch.length > 0) {
      return NextResponse.json({
        category: exactMatch[0].category,
        expense_type: exactMatch[0].expense_type,
        confidence: "high",
        source: "history",
      });
    }

    // Strategy 2: Word matching — find transactions sharing significant words
    const words = description.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    if (words.length > 0) {
      const fuzzyMatch = await sql(
        `SELECT category, expense_type, COUNT(*) as cnt
         FROM transactions
         WHERE user_id = $1 AND LOWER(description) LIKE $2
         AND category != 'otros' AND category != 'transferencia'
         GROUP BY category, expense_type
         ORDER BY cnt DESC
         LIMIT 1`,
        [userId, `%${words[0]}%`]
      );

      if (fuzzyMatch.length > 0 && Number(fuzzyMatch[0].cnt) >= 2) {
        return NextResponse.json({
          category: fuzzyMatch[0].category,
          expense_type: fuzzyMatch[0].expense_type,
          confidence: "medium",
          source: "history",
        });
      }
    }

    return NextResponse.json({ category: null });
  } catch {
    return NextResponse.json({ category: null });
  }
}
