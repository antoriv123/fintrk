export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { timingSafeEqual } from "crypto";

// push-admin and send-push removed in OSS edition — stubs keep automation gates functional
async function isAutomationEnabled(_name: string): Promise<boolean> { return true; }
async function recordAutomationRun(_name: string, _status: string, _detail: string): Promise<void> { /* no-op */ }

export const maxDuration = 60;

/**
 * reengagement cron
 *
 * Trigger: Vercel cron diario a las 17:00 UTC (19:00 CET).
 * Audiencia: usuarios con push activo + ultima actividad entre 3 y 30 dias atras.
 *   - Menos de 3 dias atras: aun activos, no molestar.
 *   - Mas de 30 dias atras: probablemente ya no van a volver, no quemar tokens.
 * Canal: APNs + web push via sendPushToUser. Antes solo enviaba web push y
 *   los 22 tokens APNs se quedaban sin recibir nada.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron reengagement] CRON_SECRET no configurado — abortando");
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const expected = `Bearer ${cronSecret}`;
  const actual = authHeader ?? "";
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!(await isAutomationEnabled("reengagement"))) {
    return NextResponse.json({ skipped: true, reason: "automation disabled" });
  }

  try {
    // Last activity = max(latest transaction date, latest check-in date).
    // Window: > 3 dias y <= 30 dias.
    const candidates = (await sql(
      `SELECT DISTINCT s.user_id, st.current_streak
       FROM push_subscriptions s
       LEFT JOIN streaks st ON st.user_id = s.user_id
       LEFT JOIN LATERAL (
         SELECT MAX(dd) AS last_activity FROM (
           SELECT MAX(date) AS dd FROM transactions WHERE user_id = s.user_id
           UNION ALL
           SELECT MAX(date) AS dd FROM daily_checkins WHERE user_id = s.user_id
         ) x
       ) la ON true
       WHERE s.invalid_at IS NULL
         AND (la.last_activity IS NULL OR la.last_activity < (CURRENT_DATE - INTERVAL '3 days'))
         AND (la.last_activity IS NULL OR la.last_activity > (CURRENT_DATE - INTERVAL '30 days'))`,
      [],
    )) as { user_id: number; current_streak: number | null }[];

    if (candidates.length === 0) {
      await recordAutomationRun("reengagement", "ok", "candidates=0");
      return NextResponse.json({ usersNotified: 0 });
    }

    // push disabled in OSS edition — compute only, no send
    await recordAutomationRun(
      "reengagement",
      "ok",
      `candidates=${candidates.length} dispatched=0`,
    );
    return NextResponse.json({ usersNotified: candidates.length, dispatched: 0, note: "push disabled in OSS edition" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron reengagement] error:", msg);
    await recordAutomationRun("reengagement", "error", msg);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
