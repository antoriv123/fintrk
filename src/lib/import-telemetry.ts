/**
 * Import telemetry — persists one row per import call so we can answer:
 *   - Which banks do users actually upload? Where should we invest effort?
 *   - How often does the AI fallback fire? Is it expensive?
 *   - How often does the consistency check flag a problem?
 *   - How long do imports typically take?
 *
 * One row per successful parse response (preview or import action). We don't
 * store the actual transactions or the file — just counters and metadata.
 */

import { sql } from "./db";

let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
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
  await sql(`CREATE INDEX IF NOT EXISTS idx_import_events_created_at ON import_events (created_at DESC)`);
  await sql(`CREATE INDEX IF NOT EXISTS idx_import_events_detected_bank ON import_events (detected_bank)`);
  tableReady = true;
}

export interface ImportEvent {
  userId: number;
  action: "preview" | "import";
  fileType: "pdf" | "excel" | "csv" | string;
  fileSizeBytes: number;
  pageCount: number;
  detectedFormat: string;
  /** Derived from format. e.g. "santander" / "bbva" / "unknown" / "ofx". */
  detectedBank: string;
  txCount: number;
  weakDetection: boolean;
  aiEscalated: boolean;
  /** Reason the escalation was triggered (or null if no escalation). */
  aiReason: string | null;
  /** Consistency check result. null = no check ran (no opening/closing balance). */
  consistencyOk: boolean | null;
  durationMs: number;
  /** Error string when we end up returning a failure response. null on success. */
  error: string | null;
}

/**
 * Fire-and-forget telemetry. Never throws — a DB failure here must not block
 * the real import response. Errors are logged to console only.
 */
export async function recordImportEvent(ev: ImportEvent): Promise<void> {
  try {
    await ensureTable();
    await sql(
      `INSERT INTO import_events (
         user_id, action, file_type, file_size_bytes, page_count,
         detected_format, detected_bank, tx_count,
         weak_detection, ai_escalated, ai_reason,
         consistency_ok, duration_ms, error
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        ev.userId,
        ev.action,
        ev.fileType,
        ev.fileSizeBytes,
        ev.pageCount,
        ev.detectedFormat,
        ev.detectedBank,
        ev.txCount,
        ev.weakDetection,
        ev.aiEscalated,
        ev.aiReason,
        ev.consistencyOk,
        ev.durationMs,
        ev.error,
      ],
    );
  } catch (e) {
    console.warn("[import-telemetry] insert failed (swallowed):", e);
  }
}

/**
 * Map a parse result `format` string to a canonical bank/source slug suitable
 * for grouping in stats. Keeps related paths under one label so admin views
 * don't explode with variants.
 */
export function normaliseBankFromFormat(format: string): string {
  const f = format.toLowerCase();
  // Standard formats
  if (f === "ofx" || f === "qif" || f === "camt053" || f === "mt940") return f;
  // Native parsers
  for (const bank of [
    "bbva", "ing", "revolut", "bunq", "santander", "sabadell", "caixabank",
    "bankinter", "openbank", "kutxabank", "unicaja", "abanca", "ibercaja",
    "deutsche-bank", "evobanco", "imaginbank", "n26", "wise", "myinvestor",
    "abn_amro", "abn-amro", "rabobank",
  ]) {
    if (f.includes(bank)) return bank.replace(/_/g, "-");
  }
  if (f === "vision" || f === "ai-fallback") return "ai-only";
  if (f.includes("generic")) return "unknown";
  if (f === "excel") return "excel-unknown";
  return f || "unknown";
}
