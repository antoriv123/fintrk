export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { sql } from "@/lib/db";
import { sendWeeklyRecapEmail } from "@/lib/emails";

// push-admin removed in OSS edition — stubs keep automation gates functional
async function isAutomationEnabled(_name: string): Promise<boolean> { return true; }
async function recordAutomationRun(_name: string, _status: string, _detail: string): Promise<void> { /* no-op */ }

export const maxDuration = 60;

/**
 * Weekly recap email. Vercel cron runs this every Monday at 09:00 UTC (see vercel.json).
 * Only sends to users who:
 *  - Have an email (all signed-up users do).
 *  - Logged at least 1 transaction in the last 7 days (so we have something to recap).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron weekly-recap] CRON_SECRET no configurado — abortando");
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const expected = `Bearer ${cronSecret}`;
  const actual = authHeader ?? "";
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!(await isAutomationEnabled("weekly-recap"))) {
    return NextResponse.json({ skipped: true, reason: "automation disabled" });
  }

  try {
    // Find users with activity in the last 7 days.
    const rows = await sql(
      `SELECT u.id, u.email, u.name,
              COUNT(t.id) FILTER (WHERE t.direction = 'expense') AS tx_count,
              COALESCE(SUM(t.eur_amount) FILTER (WHERE t.direction = 'expense'), 0) AS total_expenses,
              COALESCE(SUM(t.eur_amount) FILTER (WHERE t.direction = 'income'), 0) AS total_income
       FROM users u
       JOIN transactions t ON t.user_id = u.id AND t.date >= (CURRENT_DATE - INTERVAL '7 days')::text
       WHERE u.email IS NOT NULL
       GROUP BY u.id, u.email, u.name
       HAVING COUNT(t.id) > 0`,
      [],
    ) as Array<{ id: number; email: string; name: string | null; tx_count: number; total_expenses: number; total_income: number }>;

    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (const user of rows) {
      const topCategoryRows = await sql(
        `SELECT category, SUM(eur_amount) AS total
         FROM transactions
         WHERE user_id = $1 AND direction = 'expense' AND date >= (CURRENT_DATE - INTERVAL '7 days')::text
         GROUP BY category
         ORDER BY total DESC
         LIMIT 1`,
        [user.id],
      ) as Array<{ category: string; total: number }>;

      const topCategory = topCategoryRows[0]?.category ?? "otros";

      const res = await sendWeeklyRecapEmail({
        to: user.email,
        name: user.name,
        totalExpenses: Number(user.total_expenses),
        totalIncome: Number(user.total_income),
        topCategory,
        transactionsCount: Number(user.tx_count),
      });

      if (res.ok) sent++;
      else { failed++; errors.push(res.error.slice(0, 80)); }
    }

    await recordAutomationRun("weekly-recap", "ok", `candidates=${rows.length} sent=${sent} failed=${failed}`);
    return NextResponse.json({ candidates: rows.length, sent, failed, errors: errors.slice(0, 5) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron weekly-recap]", msg);
    await recordAutomationRun("weekly-recap", "error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
