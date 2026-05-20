import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

/**
 * Fuzzy duplicate check — compares amount (within 0.02) + description similarity
 * (shared tokens, case-insensitive) over a 14-day window around the supplied date.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await req.json();
    const { amount, description, date } = body as { amount?: string | number; description?: string; date?: string };

    if (!amount || !description) {
      return NextResponse.json({ duplicate: false });
    }

    const eurAmount = typeof amount === "number" ? amount : parseFloat(amount);
    if (!isFinite(eurAmount)) {
      return NextResponse.json({ duplicate: false });
    }

    // Candidates: amount close + last 14 days (or ±7 days around provided date).
    const txDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
    const candidates = (txDate
      ? await sql(
          `SELECT id, description, eur_amount, date, direction, category
           FROM transactions
           WHERE user_id = $1
             AND ABS(eur_amount - $2) < 0.02
             AND date BETWEEN (($3::date - INTERVAL '7 days'))::text
                          AND (($3::date + INTERVAL '7 days'))::text
           ORDER BY date DESC
           LIMIT 20`,
          [userId, eurAmount, txDate],
        )
      : await sql(
          `SELECT id, description, eur_amount, date, direction, category
           FROM transactions
           WHERE user_id = $1
             AND ABS(eur_amount - $2) < 0.02
             AND date >= (CURRENT_DATE - INTERVAL '14 days')::text
           ORDER BY date DESC
           LIMIT 20`,
          [userId, eurAmount],
        )) as Array<{ id: number; description: string; eur_amount: number; date: string; direction: string; category: string }>;

    if (candidates.length === 0) {
      return NextResponse.json({ duplicate: false });
    }

    // Token overlap — more robust than first-10-chars.
    const targetTokens = tokenize(description);
    const scored = candidates
      .map((c) => ({ row: c, score: similarity(targetTokens, tokenize(c.description)) }))
      .filter((x) => x.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return NextResponse.json({ duplicate: false });
    }

    return NextResponse.json({
      duplicate: true,
      matches: scored.slice(0, 3).map(({ row, score }) => ({
        id: row.id,
        description: row.description,
        amount: row.eur_amount,
        date: row.date,
        direction: row.direction,
        category: row.category,
        similarity: Math.round(score * 100) / 100,
      })),
    });
  } catch {
    return NextResponse.json({ duplicate: false });
  }
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip accents
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}
