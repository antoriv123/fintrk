export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { cookies } from "next/headers";

/**
 * Hard delete of user + all owned data (GDPR art. 17).
 * Requires body { confirmation: "BORRAR MI CUENTA" | "DELETE MY ACCOUNT" }.
 *
 * Strategy: best-effort DELETE on runtime-created tables that lack a FK to users,
 * then DELETE FROM users which cascades through every ON DELETE CASCADE FK.
 * That cleans transactions, subscriptions, accounts, savings_goals, app_settings,
 * investment_*, categorization_rules, envelopes, budgets, net_worth_snapshots,
 * daily_checkins, push_subscriptions, streaks, transfers, transaction_tags,
 * transaction_splits, push_log, import_error_reports (after migration 2026-04-19).
 */
export async function POST(req: NextRequest) {
  let userId: number;
  try {
    userId = await getUserId();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (body?.confirmation !== "BORRAR MI CUENTA" && body?.confirmation !== "DELETE MY ACCOUNT") {
    return NextResponse.json(
      { error: "Confirmacion requerida. Envia { confirmation: 'BORRAR MI CUENTA' }" },
      { status: 400 },
    );
  }

  // Tables without a CASCADE FK to users (runtime-created, created on-demand by other code paths).
  // Silently skipped if the table does not exist yet on this deployment.
  const bestEffortTables = [
    "push_log",
    "import_error_reports",
    "ai_usage",
    "import_events",
    "feedback",
    "user_subscriptions",
    "apple_pay_imports",
    "apple_pay_tokens",
  ];

  for (const table of bestEffortTables) {
    try {
      await sql(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 42P01 = relation does not exist. Any other error is worth knowing about,
      // but we still continue — cascading DELETE users handles the important tables.
      if (!/does not exist/i.test(msg)) {
        console.warn(`[account delete] ${table} cleanup:`, msg);
      }
    }
  }

  // Primary delete — cascades to every table with ON DELETE CASCADE FK to users.
  // If this fails, we report the error instead of silently leaving a partial state.
  try {
    await sql("DELETE FROM users WHERE id = $1", [userId]);
  } catch (e) {
    console.error("[account delete] users delete failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "No se pudo borrar la cuenta. Contacta con help@fintrk.app" },
      { status: 500 },
    );
  }

  // Clear auth cookie so the session is invalidated client-side.
  try {
    const jar = await cookies();
    jar.delete("ft_session");
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true });
}
