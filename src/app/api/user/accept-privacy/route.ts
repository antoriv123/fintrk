import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

/**
 * Records GDPR art. 7 consent trail: when the user accepted the privacy
 * policy and which version. Called from the onboarding StepPrivacy.
 *
 * Body: { version?: string }  (defaults to current version)
 */
const CURRENT_PRIVACY_VERSION = "2026-04-19";
const CURRENT_TERMS_VERSION = "2026-04-19";

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await req.json().catch(() => ({}));
    const privacyVersion = typeof body?.privacyVersion === "string"
      ? body.privacyVersion.slice(0, 40)
      : CURRENT_PRIVACY_VERSION;
    const termsVersion = typeof body?.termsVersion === "string"
      ? body.termsVersion.slice(0, 40)
      : CURRENT_TERMS_VERSION;

    await sql(
      `UPDATE users
         SET privacy_accepted_at = COALESCE(privacy_accepted_at, NOW()),
             privacy_version    = $2,
             terms_accepted_at  = COALESCE(terms_accepted_at, NOW()),
             terms_version      = $3
       WHERE id = $1`,
      [userId, privacyVersion, termsVersion],
    );

    return NextResponse.json({ ok: true, privacyVersion, termsVersion });
  } catch (e) {
    console.error("[accept-privacy]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
