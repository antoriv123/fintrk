import { SignJWT, jwtVerify } from "jose";
import { hash, compare } from "bcryptjs";
import { cookies } from "next/headers";
import { sql } from "./db";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("JWT_SECRET environment variable is required");
const JWT_SECRET = new TextEncoder().encode(jwtSecret);

const COOKIE_NAME = "ft_session";
const TOKEN_EXPIRY = "30d";
const BCRYPT_ROUNDS = 12;

// Account lockout settings
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface JWTPayload {
  userId: number;
  email: string;
  role?: string;
}

// --- Password ---

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (!/[A-Z]/.test(password)) return "La contraseña debe tener al menos una mayuscula";
  if (!/[a-z]/.test(password)) return "La contraseña debe tener al menos una minuscula";
  if (!/[0-9]/.test(password)) return "La contraseña debe tener al menos un numero";
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return compare(password, hashedPassword);
}

// --- JWT ---

export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

// --- Session cookie ---

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
}

export async function getSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

// --- Account lockout (DB-persisted) ---

export async function recordFailedLogin(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  await sql(
    `UPDATE users SET
       failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
       last_failed_login = NOW()
     WHERE email = $1`,
    [normalizedEmail]
  );
}

export async function isAccountLocked(email: string): Promise<{ locked: boolean; minutesLeft: number }> {
  const normalizedEmail = email.toLowerCase().trim();
  const rows = await sql(
    `SELECT failed_login_attempts, last_failed_login FROM users WHERE email = $1`,
    [normalizedEmail]
  );
  if (rows.length === 0) return { locked: false, minutesLeft: 0 };

  const attempts = Number(rows[0].failed_login_attempts) || 0;
  const lastFailed = rows[0].last_failed_login ? new Date(rows[0].last_failed_login as string) : null;

  if (attempts >= MAX_FAILED_ATTEMPTS && lastFailed) {
    const lockoutEnd = new Date(lastFailed.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
    if (new Date() < lockoutEnd) {
      const minutesLeft = Math.ceil((lockoutEnd.getTime() - Date.now()) / 60000);
      return { locked: true, minutesLeft };
    }
  }
  return { locked: false, minutesLeft: 0 };
}

export async function resetFailedLogins(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  await sql(
    `UPDATE users SET failed_login_attempts = 0, last_failed_login = NULL WHERE email = $1`,
    [normalizedEmail]
  );
}

// --- User operations ---

export async function createUser(email: string, password: string, name: string): Promise<User> {
  const normalizedEmail = email.toLowerCase().trim();

  // Check if user exists
  const existing = await sql("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  if (existing.length > 0) {
    throw new Error("EMAIL_EXISTS");
  }

  const passwordHash = await hashPassword(password);
  const result = await sql(
    "INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at",
    [normalizedEmail, passwordHash, name.trim()]
  );

  return result[0] as User;
}

export async function authenticateUser(email: string, password: string): Promise<(User & { role: string }) | null> {
  const normalizedEmail = email.toLowerCase().trim();

  const rows = await sql(
    "SELECT id, email, name, password_hash, role, created_at FROM users WHERE email = $1",
    [normalizedEmail]
  );

  if (rows.length === 0) {
    // Prevent timing attacks: hash anyway so response time is consistent
    await hash("dummy-password-for-timing", BCRYPT_ROUNDS);
    return null;
  }

  const user = rows[0];
  const valid = await verifyPassword(password, user.password_hash as string);
  if (!valid) return null;

  return {
    id: user.id as number,
    email: user.email as string,
    name: user.name as string,
    role: (user.role as string) || "user",
    created_at: user.created_at as string,
  };
}

// --- Onboarding status ---

// A user is considered onboarded if any of these are true:
//   1. The flag app_settings.onboarding_completed = 'true' is present
//   2. They already have at least one account
//   3. They already have at least one transaction
//   4. They were created more than 1 hour ago (heuristic for legacy users
//      created before the flag existed, who finished onboarding without
//      the explicit write — they were "already here")
//
// When (2), (3) or (4) trigger, we backfill the flag so subsequent calls
// short-circuit on the cheap lookup. Failures during backfill are non-fatal.
export async function isUserOnboarded(userId: number): Promise<boolean> {
  // 1. Cheap lookup first
  try {
    const flagRows = (await sql(
      "SELECT value FROM app_settings WHERE user_id = $1 AND key = 'onboarding_completed' LIMIT 1",
      [userId],
    )) as Array<{ value: string }>;
    if (flagRows.length > 0 && String(flagRows[0].value).toLowerCase() === "true") {
      return true;
    }
  } catch (e) {
    console.warn("[isUserOnboarded] flag lookup failed", e);
  }

  // 2. Activity heuristics. Run in parallel.
  let hasActivity = false;
  try {
    const [accounts, transactions, userInfo] = await Promise.all([
      sql("SELECT 1 FROM accounts WHERE user_id = $1 LIMIT 1", [userId]),
      sql("SELECT 1 FROM transactions WHERE user_id = $1 LIMIT 1", [userId]),
      sql("SELECT created_at FROM users WHERE id = $1 LIMIT 1", [userId]),
    ]);
    if (accounts.length > 0 || transactions.length > 0) {
      hasActivity = true;
    } else if (userInfo.length > 0) {
      const createdAt = userInfo[0].created_at ? new Date(userInfo[0].created_at as string) : null;
      if (createdAt && Date.now() - createdAt.getTime() > 60 * 60 * 1000) {
        hasActivity = true;
      }
    }
  } catch (e) {
    console.warn("[isUserOnboarded] activity check failed", e);
    return false;
  }

  if (!hasActivity) return false;

  // 3. Backfill so we don't repeat the activity check on every login
  try {
    await sql(
      `INSERT INTO app_settings (user_id, key, value)
       VALUES ($1, 'onboarding_completed', 'true')
       ON CONFLICT (user_id, key) DO UPDATE SET value = 'true', updated_at = NOW()`,
      [userId],
    );
  } catch (e) {
    console.warn("[isUserOnboarded] backfill failed", e);
  }

  return true;
}

// --- Auth helpers for API routes ---

export async function getCurrentUser(): Promise<JWTPayload | null> {
  const token = await getSessionCookie();
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth(): Promise<JWTPayload> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireAdmin(): Promise<JWTPayload> {
  const user = await requireAuth();
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return user;
}
