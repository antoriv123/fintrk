import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import crypto from "crypto";

// Secure PIN hashing with scrypt + random salt
function hashPin(pin: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt ?? crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(pin, usedSalt, 64).toString("hex");
  return { hash: derived, salt: usedSalt };
}

function verifyPin(pin: string, storedValue: string): boolean {
  // Support legacy SHA-256 hashes (64 hex chars, no colon)
  if (!storedValue.includes(":")) {
    const legacySha = crypto.createHash("sha256").update(pin).digest("hex");
    return storedValue === legacySha;
  }
  const [salt, hash] = storedValue.split(":");
  const { hash: computed } = hashPin(pin, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
}

// Rate limiting: max 5 attempts per 15 minutes
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip: string): { allowed: boolean; retryAfterSecs?: number } {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSecs: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true };
}

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const { action, pin, newPin } = await req.json();

  if (action === "check") {
    const rows = await sql("SELECT value FROM app_settings WHERE key = 'pin_hash' AND user_id = $1", [userId]);
    const row = rows[0] as { value: string } | undefined;
    return NextResponse.json({ hasPin: !!row });
  }

  if (action === "verify") {
    const ip = getClientIp(req);
    const limit = checkRateLimit(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { valid: false, error: `Demasiados intentos. Espera ${limit.retryAfterSecs}s.` },
        { status: 429 }
      );
    }

    const rows = await sql("SELECT value FROM app_settings WHERE key = 'pin_hash' AND user_id = $1", [userId]);
    const row = rows[0] as { value: string } | undefined;
    if (!row) return NextResponse.json({ valid: true });

    const valid = verifyPin(pin, row.value);

    if (valid) {
      // Reset attempts on success
      attempts.delete(ip);

      // Migrate legacy SHA-256 hash to scrypt
      if (!row.value.includes(":")) {
        const { hash, salt } = hashPin(pin);
        await sql("UPDATE app_settings SET value = $1, updated_at = NOW() WHERE key = 'pin_hash' AND user_id = $2", [`${salt}:${hash}`, userId]);
      }

      // Set HttpOnly cookie from server side
      const response = NextResponse.json({ valid: true });
      response.cookies.set("pin_verified", "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });
      return response;
    }

    return NextResponse.json({ valid: false });
  }

  if (action === "set") {
    if (!newPin || newPin.length < 4 || newPin.length > 6) {
      return NextResponse.json({ error: "PIN debe tener 4-6 dígitos" }, { status: 400 });
    }
    const { hash, salt } = hashPin(newPin);
    await sql(
      "INSERT INTO app_settings (key, user_id, value, updated_at) VALUES ('pin_hash', $1, $2, NOW()) ON CONFLICT (key, user_id) DO UPDATE SET value = $2, updated_at = NOW()",
      [userId, `${salt}:${hash}`]
    );
    return NextResponse.json({ ok: true });
  }

  if (action === "remove") {
    const rows = await sql("SELECT value FROM app_settings WHERE key = 'pin_hash' AND user_id = $1", [userId]);
    const row = rows[0] as { value: string } | undefined;
    if (row && !verifyPin(pin, row.value)) {
      return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
    }
    await sql("DELETE FROM app_settings WHERE key = 'pin_hash' AND user_id = $1", [userId]);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete("pin_verified");
    return response;
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
