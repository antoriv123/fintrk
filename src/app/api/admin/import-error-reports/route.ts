/**
 * GET  /api/admin/import-error-reports        → list reports (summaries)
 * GET  /api/admin/import-error-reports?id=123 → full report with file_base64
 * PATCH /api/admin/import-error-reports       → mark resolved: {id, resolved: true|false}
 * DELETE /api/admin/import-error-reports?id=123 → delete (keeps DB clean)
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

interface ReportRow {
  id: number;
  user_id: number | null;
  email: string | null;
  error_message: string;
  file_type: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  file_base64: string | null;
  csv_text: string | null;
  notes: string | null;
  user_agent: string | null;
  created_at: string;
  resolved_at: string | null;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Create table on first access so admin view doesn't 500 before any reports exist
  await sql(`
    CREATE TABLE IF NOT EXISTS import_error_reports (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      email TEXT,
      error_message TEXT NOT NULL,
      file_type TEXT,
      file_name TEXT,
      file_size_bytes INTEGER,
      file_base64 TEXT,
      csv_text TEXT,
      notes TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `);

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const rows = (await sql("SELECT * FROM import_error_reports WHERE id = $1", [id])) as ReportRow[];
    if (rows.length === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ report: rows[0] });
  }

  // List: exclude heavy payload fields for the index view
  const rows = (await sql(
    `SELECT id, user_id, email, error_message, file_type, file_name,
            file_size_bytes, notes, user_agent, created_at, resolved_at
     FROM import_error_reports
     ORDER BY resolved_at NULLS FIRST, created_at DESC
     LIMIT 200`
  )) as Omit<ReportRow, "file_base64" | "csv_text">[];

  return NextResponse.json({
    total: rows.length,
    reports: rows,
  });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, resolved } = body as { id?: number; resolved?: boolean };
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await sql(
    resolved
      ? "UPDATE import_error_reports SET resolved_at = NOW() WHERE id = $1"
      : "UPDATE import_error_reports SET resolved_at = NULL WHERE id = $1",
    [id]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await sql("DELETE FROM import_error_reports WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
