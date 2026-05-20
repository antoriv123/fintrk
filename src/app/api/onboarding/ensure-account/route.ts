import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

/**
 * Upserts an account for the current user so the onboarding can import
 * transactions into it before the final /complete call.
 *
 * Idempotent: calling twice with the same slug updates name/color/balance
 * but never creates a duplicate.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await req.json().catch(() => ({}));
    const {
      slug,
      name,
      color,
      currency = "EUR",
      initialBalance = 0,
    } = body as {
      slug?: string;
      name?: string;
      color?: string;
      currency?: string;
      initialBalance?: number;
    };

    if (!slug || !name) {
      return NextResponse.json({ error: "slug y name requeridos" }, { status: 400 });
    }

    await sql(
      `INSERT INTO accounts (slug, name, emoji, initial_balance, currency, color, user_id)
       VALUES ($1, $2, '🏦', $3, $4, $5, $6)
       ON CONFLICT (user_id, slug) DO UPDATE SET
         name = EXCLUDED.name,
         initial_balance = EXCLUDED.initial_balance,
         currency = EXCLUDED.currency,
         color = EXCLUDED.color`,
      [slug, name, initialBalance || 0, currency, color || "#6b7280", userId],
    );

    return NextResponse.json({ ok: true, slug });
  } catch (e) {
    console.error("[onboarding ensure-account] error:", e);
    return NextResponse.json({ error: "No se pudo crear la cuenta" }, { status: 500 });
  }
}
