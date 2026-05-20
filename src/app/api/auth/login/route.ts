import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  createToken,
  setSessionCookie,
  isAccountLocked,
  recordFailedLogin,
  resetFailedLogins,
  isUserOnboarded,
} from "@/lib/auth";

// In-memory IP rate limiting (defense in depth alongside DB lockout)
const ipAttempts = new Map<string, { count: number; resetAt: number }>();
const IP_MAX_ATTEMPTS = 10;
const IP_WINDOW_MS = 15 * 60 * 1000;

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const now = Date.now();

  // IP-based rate limit (broader protection against distributed attacks)
  const ipEntry = ipAttempts.get(ip);
  if (ipEntry && now < ipEntry.resetAt && ipEntry.count >= IP_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((ipEntry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: `Demasiados intentos. Espera ${retryAfter} segundos.` },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
  }

  // Check DB-persisted account lockout
  const lockStatus = await isAccountLocked(email);
  if (lockStatus.locked) {
    return NextResponse.json(
      { error: `Cuenta bloqueada por seguridad. Intenta de nuevo en ${lockStatus.minutesLeft} minutos.` },
      { status: 423 }
    );
  }

  const user = await authenticateUser(email, password);

  if (!user) {
    // Track failed attempt (both IP and account level)
    if (!ipEntry || now > ipEntry.resetAt) {
      ipAttempts.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    } else {
      ipEntry.count++;
    }
    await recordFailedLogin(email);

    // Generic error to prevent user enumeration
    return NextResponse.json({ error: "Credenciales incorrectas" }, { status: 401 });
  }

  // Reset all counters on success + track last login
  ipAttempts.delete(ip);
  await resetFailedLogins(email);

  const { sql } = await import("@/lib/db");
  await sql("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

  const token = await createToken({ userId: user.id, email: user.email, role: user.role });
  await setSessionCookie(token);

  const onboarded = await isUserOnboarded(user.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token, // For native apps using Bearer auth
    onboarded,
  });
}
