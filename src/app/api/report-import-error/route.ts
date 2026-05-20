/**
 * POST /api/report-import-error
 *
 * When a user's bank statement import fails, they can send us the exact file
 * + error message so we can reproduce and fix the problem. The file is stored
 * in the `import_error_reports` table (encrypted at rest by Neon) and mailed
 * to the founder inbox via Resend as an attachment.
 *
 * Body:
 *   {
 *     error_message: string,  // the error shown in the UI
 *     file_type: "pdf" | "excel" | "csv",
 *     file_name?: string,
 *     file_base64?: string,   // required unless csv_text is provided
 *     csv_text?: string,      // preferred for CSV (no need to re-encode)
 *     user_agent?: string,
 *     notes?: string,         // optional user-provided context
 *   }
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { sql } from "@/lib/db";
import { Resend } from "resend";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";

const REPORT_TO = process.env.IMPORT_ERROR_REPORT_TO
  ?? process.env.FEEDBACK_TO_EMAIL
  ?? "";

// Hard limit so a malicious user can't drop 100MB on our DB/mail.
const MAX_FILE_BYTES = 15 * 1024 * 1024;

type Body = {
  error_message?: string;
  file_type?: "pdf" | "excel" | "csv" | string;
  file_name?: string;
  file_base64?: string;
  csv_text?: string;
  user_agent?: string;
  notes?: string;
  // Auto-clasificación del caller (opcional). Si no llega, lo inferimos.
  error_kind?: "parser_crash" | "zero_tx" | "weak_result" | "needs_manual_review" | "user_reported";
};

function inferErrorKind(msg: string, userProvided?: string | null): string {
  if (userProvided) return userProvided;
  const m = (msg || "").toLowerCase();
  if (m.includes("crash") || m.includes("exception") || m.includes("stack")) return "parser_crash";
  if (m.includes("0 transaccion") || m.includes("no se encontraron") || m.includes("cero")) return "zero_tx";
  if (m.includes("consistency") || m.includes("cuadra") || m.includes("manual")) return "needs_manual_review";
  if (m.includes("weak") || m.includes("débil") || m.includes("revisar")) return "weak_result";
  return "user_reported";
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();

    // 5 reports per hour per user — prevents abuse without blocking legit retries.
    const rateLimit = await checkAiRateLimit(Number(userId), "report-import-error", 5);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `Has enviado demasiados reportes en la última hora. Intenta de nuevo en ${Math.ceil(rateLimit.retryAfterSec / 60)} min.`,
        },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSec) } },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const {
      error_message = "",
      file_type = "unknown",
      file_name = "(sin nombre)",
      file_base64,
      csv_text,
      user_agent = "",
      notes = "",
      error_kind: clientKind,
    } = body;

    const errorKind = inferErrorKind(error_message, clientKind);

    if (!error_message.trim()) {
      return NextResponse.json({ error: "error_message requerido" }, { status: 400 });
    }
    if (!file_base64 && !csv_text) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }

    const sizeBytes = file_base64
      ? Math.ceil(file_base64.length * 0.75)
      : new Blob([csv_text ?? ""]).size;
    if (sizeBytes > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Archivo demasiado grande" }, { status: 413 });
    }

    const rows = await sql("SELECT email, name FROM users WHERE id = $1", [userId]);
    const user = rows[0] as { email?: string; name?: string } | undefined;

    // Persist to DB (best-effort — if table creation races we still send the email)
    let reportId: number | null = null;
    try {
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
      // Intentamos incluir error_kind si la columna existe (migration aplicada).
      // Si no, fallback al INSERT clasico y hacemos UPDATE posterior best-effort.
      let ins: unknown[] = [];
      try {
        ins = await sql(
          `INSERT INTO import_error_reports
             (user_id, email, error_message, file_type, file_name, file_size_bytes, file_base64, csv_text, notes, user_agent, error_kind)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [
            userId,
            user?.email ?? null,
            error_message.trim().slice(0, 2000),
            String(file_type).slice(0, 20),
            String(file_name).slice(0, 200),
            sizeBytes,
            file_base64 ?? null,
            csv_text ?? null,
            notes.trim().slice(0, 2000) || null,
            user_agent.slice(0, 400) || null,
            errorKind,
          ],
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/column .*error_kind.* does not exist/i.test(msg) || /syntax/i.test(msg)) {
          // Migration aun no aplicada: fallback al schema antiguo.
          ins = await sql(
            `INSERT INTO import_error_reports
               (user_id, email, error_message, file_type, file_name, file_size_bytes, file_base64, csv_text, notes, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [
              userId,
              user?.email ?? null,
              error_message.trim().slice(0, 2000),
              String(file_type).slice(0, 20),
              String(file_name).slice(0, 200),
              sizeBytes,
              file_base64 ?? null,
              csv_text ?? null,
              notes.trim().slice(0, 2000) || null,
              user_agent.slice(0, 400) || null,
            ],
          );
        } else {
          throw e;
        }
      }
      reportId = (ins[0] as { id: number } | undefined)?.id ?? null;
    } catch (dbErr) {
      console.warn("[report-import-error] db insert failed:", dbErr);
    }

    // Email the maintainer with the file attached so they can reproduce
    if (process.env.RESEND_API_KEY && REPORT_TO) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const subject = `[Fintrk import error] ${(user?.email ?? `user ${userId}`).slice(0, 40)}${reportId ? ` #${reportId}` : ""}`;
        const html = `
          <h2>Error al importar extracto</h2>
          <p><strong>Usuario</strong>: ${escapeHtml(user?.email ?? `id ${userId}`)}${user?.name ? ` · ${escapeHtml(user.name)}` : ""}</p>
          <p><strong>Archivo</strong>: ${escapeHtml(file_name)} · ${escapeHtml(String(file_type))} · ${(sizeBytes / 1024).toFixed(1)} KB</p>
          <p><strong>Report ID</strong>: ${reportId ?? "(no DB)"}</p>
          <p><strong>User-Agent</strong>: ${escapeHtml(user_agent || "(desconocido)")}</p>
          <h3>Error</h3>
          <pre style="white-space:pre-wrap;background:#fee;padding:12px;border-radius:6px;font-family:monospace;">${escapeHtml(error_message)}</pre>
          ${notes ? `<h3>Notas del usuario</h3><pre style="white-space:pre-wrap;">${escapeHtml(notes)}</pre>` : ""}
          <hr/>
          <p style="color:#666;font-size:12px;">
            El archivo va adjunto. Puedes reproducirlo localmente subiéndolo a /import.
            Para marcar como resuelto: UPDATE import_error_reports SET resolved_at = NOW() WHERE id = ${reportId ?? 0};
          </p>
        `;

        const attachments = [];
        if (file_base64) {
          attachments.push({
            filename: file_name || `extracto.${file_type}`,
            content: file_base64,
          });
        } else if (csv_text) {
          attachments.push({
            filename: file_name || "extracto.csv",
            content: Buffer.from(csv_text).toString("base64"),
          });
        }

        await resend.emails.send({
          from: process.env.RESEND_FROM ?? "Fintrk <hola@fintrk.app>",
          to: REPORT_TO,
          subject,
          html,
          replyTo: user?.email ?? undefined,
          attachments,
        });
      } catch (emailErr) {
        console.warn("[report-import-error] email send failed:", emailErr);
        // Don't hard-fail: the DB copy is enough as long as the maintainer
        // checks the admin panel.
      }
    } else {
      console.warn("[report-import-error] RESEND_API_KEY or IMPORT_ERROR_REPORT_TO missing — report stored in DB only");
    }

    return NextResponse.json({ ok: true, reportId });
  } catch (e) {
    console.error("[report-import-error] error:", e);
    return NextResponse.json({ error: "No se pudo enviar el reporte" }, { status: 500 });
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
