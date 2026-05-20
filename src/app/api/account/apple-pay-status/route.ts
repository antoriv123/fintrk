export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { listApplePayTokens, countRecentImports } from "@/lib/apple-pay-tokens";

/**
 * Returns the user's Apple Pay setup progress:
 *   step1_installed  → shortcut instalado (detectado al tap "Abrir Atajos")
 *   step2_automated  → usuario confirma que creo la automatizacion
 *   step3_verified   → llego al menos un ingest via fpat_ token (auto)
 *
 * Used by /settings/apple-pay (3-step wizard) and dashboard CTA.
 */

interface Status {
  has_active_token: boolean;
  step1_installed: boolean;
  step2_automated: boolean;
  step3_verified: boolean;
  imports_30d: number;
  last_import_at: string | null;
  all_done: boolean;
}

async function getSetting(userId: number, key: string): Promise<string | null> {
  const rows = await sql(
    "SELECT value FROM app_settings WHERE user_id = $1 AND key = $2",
    [userId, key],
  );
  return rows[0]?.value ?? null;
}

async function setSetting(userId: number, key: string, value: string): Promise<void> {
  await sql(
    `INSERT INTO app_settings (user_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, key, value],
  );
}

export async function GET(): Promise<NextResponse> {
  const userId = await getUserId();
  const [tokens, imports30d, step1, step2, lastImport] = await Promise.all([
    listApplePayTokens(userId),
    countRecentImports(userId, 30),
    getSetting(userId, "apple_pay_step1_installed"),
    getSetting(userId, "apple_pay_step2_automated"),
    sql(
      `SELECT MAX(created_at) AS ts FROM apple_pay_imports
       WHERE user_id = $1 AND status = 'created'`,
      [userId],
    ).catch(() => [] as { ts: string | null }[]),
  ]);

  const hasActiveToken = tokens.some((t) => !t.revoked_at);
  const step3Verified = imports30d > 0;
  const last = (lastImport as { ts: string | null }[])[0]?.ts ?? null;

  const status: Status = {
    has_active_token: hasActiveToken,
    step1_installed: step1 === "true",
    step2_automated: step2 === "true",
    step3_verified: step3Verified,
    imports_30d: imports30d,
    last_import_at: last,
    all_done: hasActiveToken && step1 === "true" && step2 === "true" && step3Verified,
  };

  return NextResponse.json(status);
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const userId = await getUserId();
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const step = typeof body?.step === "string" ? body.step : null;
  const value = body?.value === true || body?.value === "true";

  const allowed: Record<string, string> = {
    step1_installed: "apple_pay_step1_installed",
    step2_automated: "apple_pay_step2_automated",
  };

  if (!step || !allowed[step]) {
    return NextResponse.json({ error: "step invalido (step1_installed | step2_automated)" }, { status: 400 });
  }

  await setSetting(userId, allowed[step], value ? "true" : "false");
  return NextResponse.json({ ok: true });
}
