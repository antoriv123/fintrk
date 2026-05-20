import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

interface EnvelopeRow {
  name: string;
  category: string;
  budgeted: number;
  rollover: number;
}

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  const body = await request.json();
  const { from_month, to_month } = body as { from_month: string; to_month: string };

  if (!from_month || !to_month) {
    return NextResponse.json({ error: "from_month and to_month are required" }, { status: 400 });
  }

  const sourceEnvelopes = await sql(
    "SELECT name, category, budgeted, rollover FROM envelopes WHERE user_id = $1 AND month = $2",
    [userId, from_month]
  ) as EnvelopeRow[];

  if (sourceEnvelopes.length === 0) {
    return NextResponse.json({ error: "No envelopes found for source month" }, { status: 404 });
  }

  let copied = 0;
  for (const env of sourceEnvelopes) {
    const result = await sql(
      "INSERT INTO envelopes (user_id, name, category, budgeted, month, rollover) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
      [userId, env.name, env.category, env.budgeted, to_month, env.rollover]
    );
    // Neon returns the inserted rows; if conflict, empty array
    if (result.length > 0) copied++;
  }

  return NextResponse.json({ ok: true, copied, total: sourceEnvelopes.length });
}
