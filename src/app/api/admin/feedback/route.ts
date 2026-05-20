export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

interface Row {
  id: number;
  user_id: number | null;
  email: string | null;
  sentiment: string | null;
  message: string;
  url: string | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);
  const sentiment = url.searchParams.get("sentiment");

  try {
    // Create table if missing — same shape as /api/feedback POST creates.
    await sql(`CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      email TEXT,
      sentiment TEXT,
      message TEXT NOT NULL,
      url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    const rows = sentiment
      ? (await sql(
          `SELECT f.id, f.user_id, COALESCE(u.email, f.email) as email, f.sentiment, f.message, f.url, f.created_at
           FROM feedback f LEFT JOIN users u ON u.id = f.user_id
           WHERE f.sentiment = $1
           ORDER BY f.created_at DESC LIMIT $2`,
          [sentiment, limit],
        )) as Row[]
      : (await sql(
          `SELECT f.id, f.user_id, COALESCE(u.email, f.email) as email, f.sentiment, f.message, f.url, f.created_at
           FROM feedback f LEFT JOIN users u ON u.id = f.user_id
           ORDER BY f.created_at DESC LIMIT $1`,
          [limit],
        )) as Row[];

    const summary = (await sql(
      `SELECT sentiment, COUNT(*)::int as n
       FROM feedback
       WHERE created_at > NOW() - INTERVAL '90 days'
       GROUP BY sentiment
       ORDER BY n DESC`,
    )) as { sentiment: string | null; n: number }[];

    return NextResponse.json({ rows, summary });
  } catch (e) {
    console.error("[admin feedback] query failed:", e);
    return NextResponse.json({ error: "Query failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await sql("DELETE FROM feedback WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}
