export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { timingSafeEqual } from "crypto";

// push-admin and send-push removed in OSS edition — stubs keep automation gates functional
async function isAutomationEnabled(_name: string): Promise<boolean> { return true; }
async function recordAutomationRun(_name: string, _status: string, _detail: string): Promise<void> { /* no-op */ }

export const maxDuration = 60;

/**
 * streak-reminder cron
 *
 * Trigger: Vercel cron diario a las 19:00 UTC (21:00 CET).
 * Audiencia: usuarios con racha > 0 que NO han registrado nada HOY (ni
 *   transaccion ni daily_checkin). Es el ultimo aviso antes de perderla.
 * Canal: APNs + web push via sendPushToUser (un solo helper, sin
 *   duplicar logica de envio).
 *
 * NO duplica la reactivacion de inactivos 3+ dias — eso vive en el cron
 * `reengagement`.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron streak-reminder] CRON_SECRET no configurado — abortando");
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const expected = `Bearer ${cronSecret}`;
  const actual = authHeader ?? "";
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!(await isAutomationEnabled("streak-reminder"))) {
    return NextResponse.json({ skipped: true, reason: "automation disabled" });
  }

  try {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const usersToNotify = (await sql(
      `SELECT DISTINCT s.user_id, st.current_streak
       FROM push_subscriptions s
       JOIN streaks st ON st.user_id = s.user_id AND st.current_streak > 0
       WHERE s.invalid_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM daily_checkins dc WHERE dc.user_id = s.user_id AND dc.date = $1
       )
       AND NOT EXISTS (
         SELECT 1 FROM transactions t WHERE t.user_id = s.user_id AND t.date = $1
       )`,
      [todayStr],
    )) as { user_id: number; current_streak: number }[];

    if (usersToNotify.length === 0) {
      await recordAutomationRun("streak-reminder", "ok", `candidates=0 date=${todayStr}`);
      return NextResponse.json({ usersNotified: 0, date: todayStr });
    }

    // push disabled in OSS edition — compute only, no send
    await recordAutomationRun(
      "streak-reminder",
      "ok",
      `candidates=${usersToNotify.length} dispatched=0 date=${todayStr}`,
    );
    return NextResponse.json({ usersNotified: usersToNotify.length, dispatched: 0, date: todayStr, note: "push disabled in OSS edition" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron streak-reminder] error:", msg);
    await recordAutomationRun("streak-reminder", "error", msg);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
