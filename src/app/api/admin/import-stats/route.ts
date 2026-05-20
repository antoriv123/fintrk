/**
 * GET /api/admin/import-stats — aggregated stats over the last 30 days.
 * Admin only.
 *
 * Returns:
 *   - totals (preview vs import count, AI escalation rate, avg duration)
 *   - breakdown by detected_bank (which banks are users uploading?)
 *   - breakdown by ai_reason (when does the fallback fire?)
 *   - recent errors (last 10 failed imports)
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // Ensure table exists so we don't 500 before any imports happened
  await sql(`
    CREATE TABLE IF NOT EXISTS import_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      file_type TEXT,
      file_size_bytes INTEGER,
      page_count INTEGER,
      detected_format TEXT,
      detected_bank TEXT,
      tx_count INTEGER NOT NULL DEFAULT 0,
      weak_detection BOOLEAN NOT NULL DEFAULT false,
      ai_escalated BOOLEAN NOT NULL DEFAULT false,
      ai_reason TEXT,
      consistency_ok BOOLEAN,
      duration_ms INTEGER,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const totalsRows = await sql(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE action = 'preview')::int AS previews,
      COUNT(*) FILTER (WHERE action = 'import')::int AS imports,
      COUNT(*) FILTER (WHERE ai_escalated)::int AS ai_escalations,
      COUNT(*) FILTER (WHERE weak_detection)::int AS weak_detections,
      COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS failures,
      COUNT(*) FILTER (WHERE consistency_ok = false)::int AS inconsistent,
      COALESCE(AVG(duration_ms), 0)::int AS avg_duration_ms,
      COALESCE(AVG(tx_count) FILTER (WHERE error IS NULL), 0)::int AS avg_tx_count
    FROM import_events
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);

  const byBankRows = await sql(`
    SELECT
      detected_bank,
      COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS failures,
      COUNT(*) FILTER (WHERE ai_escalated)::int AS ai_escalations,
      COALESCE(AVG(tx_count) FILTER (WHERE error IS NULL), 0)::int AS avg_tx,
      COALESCE(AVG(duration_ms), 0)::int AS avg_duration_ms
    FROM import_events
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY detected_bank
    ORDER BY count DESC
  `);

  const byReasonRows = await sql(`
    SELECT ai_reason, COUNT(*)::int AS count
    FROM import_events
    WHERE ai_escalated AND created_at > NOW() - INTERVAL '30 days'
    GROUP BY ai_reason
    ORDER BY count DESC
  `);

  const recentErrorsRows = await sql(`
    SELECT id, user_id, detected_bank, error, created_at
    FROM import_events
    WHERE error IS NOT NULL AND created_at > NOW() - INTERVAL '30 days'
    ORDER BY created_at DESC
    LIMIT 10
  `);

  return NextResponse.json({
    totals: totalsRows[0] ?? {},
    byBank: byBankRows,
    byReason: byReasonRows,
    recentErrors: recentErrorsRows,
  });
}
