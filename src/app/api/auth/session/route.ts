import { NextResponse } from "next/server";
import { getCurrentUser, isUserOnboarded } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    const session = await getCurrentUser();
    if (!session) {
      return NextResponse.json({ user: null });
    }

    const rows = await sql(
      "SELECT id, email, name, role, subscription_tier, created_at, apple_sub, password_hash FROM users WHERE id = $1",
      [session.userId],
    );
    const user = rows[0];

    if (!user) {
      return NextResponse.json({ user: null });
    }

    const onboarded = await isUserOnboarded(Number(user.id));

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || "user",
        subscriptionTier: user.subscription_tier || "free",
        createdAt: user.created_at,
        // Apple Sign In users already have name+email verified by Apple and
        // no password. Used by onboarding to skip identity+password steps
        // (App Store Guideline 4 — Sign in with Apple).
        viaApple: Boolean(user.apple_sub),
        hasPassword: Boolean(user.password_hash),
        onboarded,
      },
    });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
