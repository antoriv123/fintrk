export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { sql } from "@/lib/db";
import { Resend } from "resend";

const FEEDBACK_TO = process.env.FEEDBACK_TO_EMAIL ?? "hola@fintrk.app";

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await req.json().catch(() => ({}));
    const { message, url, sentiment } = body as { message?: string; url?: string; sentiment?: string };

    if (!message || message.trim().length < 3) {
      return NextResponse.json({ error: "Mensaje demasiado corto" }, { status: 400 });
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: "Mensaje demasiado largo (max 4000)" }, { status: 400 });
    }

    const rows = await sql("SELECT email, name FROM users WHERE id = $1", [userId]);
    const user = rows[0];

    // Persist to DB if table exists (optional — do not hard-fail).
    try {
      await sql(
        `CREATE TABLE IF NOT EXISTS feedback (
           id SERIAL PRIMARY KEY,
           user_id INTEGER,
           email TEXT,
           sentiment TEXT,
           message TEXT NOT NULL,
           url TEXT,
           created_at TIMESTAMPTZ DEFAULT NOW()
         )`,
      );
      await sql(
        "INSERT INTO feedback (user_id, email, sentiment, message, url) VALUES ($1, $2, $3, $4, $5)",
        [userId, user?.email ?? null, sentiment ?? null, message.trim(), url ?? null],
      );
    } catch (dbErr) {
      console.warn("[feedback] db insert failed:", dbErr);
    }

    // Send email to founder
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const subject = `[Fintrk feedback] ${sentiment ? `(${sentiment}) ` : ""}${(user?.name ?? user?.email ?? "Usuario").slice(0, 40)}`;
        const html = `
          <p><strong>Usuario</strong>: ${user?.email ?? `user_id ${userId}`}${user?.name ? ` · ${user.name}` : ""}</p>
          <p><strong>Desde</strong>: ${url ?? "(no URL)"}</p>
          <p><strong>Sentiment</strong>: ${sentiment ?? "n/d"}</p>
          <hr/>
          <pre style="white-space:pre-wrap;font-family:system-ui;">${escapeHtml(message.trim())}</pre>
        `;
        await resend.emails.send({
          from: process.env.RESEND_FROM ?? "Fintrk <hola@fintrk.app>",
          to: FEEDBACK_TO,
          subject,
          html,
          replyTo: user?.email ?? undefined,
        });
      } catch (emailErr) {
        console.warn("[feedback] email send failed:", emailErr);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[feedback] error:", e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
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
