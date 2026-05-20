import { NextRequest, NextResponse } from "next/server";
import { createUser, createToken, setSessionCookie, validatePasswordStrength } from "@/lib/auth";
import { sql } from "@/lib/db";

// Rate limit registrations per IP: 3 per hour
const regAttempts = new Map<string, { count: number; resetAt: number }>();
const REG_MAX = 3;
const REG_WINDOW_MS = 60 * 60 * 1000;

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const now = Date.now();

  // Rate limit registrations
  const entry = regAttempts.get(ip);
  if (entry && now < entry.resetAt && entry.count >= REG_MAX) {
    return NextResponse.json(
      { error: "Demasiados registros. Intenta mas tarde." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const privacyAccepted = body.privacyAccepted === true;

  // Validation
  if (!email || !password || !name) {
    return NextResponse.json({ error: "Todos los campos son requeridos" }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email no valido" }, { status: 400 });
  }

  // Password strength
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  if (name.length < 2 || name.length > 50) {
    return NextResponse.json({ error: "El nombre debe tener entre 2 y 50 caracteres" }, { status: 400 });
  }

  try {
    const user = await createUser(email, password, name);

    // Track registration for rate limiting
    if (!entry || now > entry.resetAt) {
      regAttempts.set(ip, { count: 1, resetAt: now + REG_WINDOW_MS });
    } else {
      entry.count++;
    }

    // Record GDPR Art.7 consent timestamp. Wrapped in defensive try/catch so a
    // missing column (privacy_accepted_at / privacy_version / terms_*) in prod
    // does NOT roll back a successful user creation. Before this guard a schema
    // drift left orphan users in the DB and returned 500 "Error al crear la
    // cuenta" to the client, blocking the signup flow entirely.
    if (privacyAccepted) {
      try {
        await sql(
          `UPDATE users
             SET privacy_accepted_at = COALESCE(privacy_accepted_at, NOW()),
                 privacy_version    = $2,
                 terms_accepted_at  = COALESCE(terms_accepted_at, NOW()),
                 terms_version      = $2
           WHERE id = $1`,
          [user.id, "2026-04-19"]
        );
      } catch (e) {
        console.warn(
          "[register] privacy columns UPDATE failed (schema drift?):",
          e instanceof Error ? e.message : e,
        );
      }
      try {
        await sql(
          `INSERT INTO app_settings (user_id, key, value) VALUES ($1, 'privacy_accepted_at', $2)
           ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [user.id, new Date().toISOString()]
        );
      } catch (e) {
        console.warn(
          "[register] app_settings privacy_accepted_at UPSERT failed:",
          e instanceof Error ? e.message : e,
        );
      }
    }

    // Auto-login after registration
    const token = await createToken({ userId: user.id, email: user.email, role: "user" });
    await setSessionCookie(token);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      token, // For native apps using Bearer auth
    }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "EMAIL_EXISTS") {
      return NextResponse.json({ error: "Ya existe una cuenta con ese email" }, { status: 409 });
    }
    // Log full error so Vercel logs show the real root cause instead of the
    // opaque generic 500 the client used to see.
    console.error(
      "[register] unexpected error:",
      e instanceof Error ? e.stack ?? e.message : e,
    );
    return NextResponse.json({ error: "Error al crear la cuenta" }, { status: 500 });
  }
}
