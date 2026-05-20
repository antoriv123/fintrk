/**
 * Personal access tokens para el shortcut Apple Pay.
 *
 * Formato: `fpat_` + 32 bytes aleatorios base64url (256 bits de entropia).
 * Almacenamiento: HMAC-SHA256(token, JWT_SECRET) — permite lookup O(1).
 *
 * Por que HMAC y no bcrypt:
 *   - bcrypt fue disenado para passwords de baja entropia; aqui el token tiene
 *     256 bits — no existen tablas arcoiris posibles.
 *   - bcrypt usa salt aleatorio → no se puede buscar por hash, habria que
 *     probar todos los tokens del sistema contra cada request.
 *   - HMAC con un secreto server-side da las mismas garantias de
 *     "conocer el hash no permite recuperar el token" y es deterministico.
 */

import { randomBytes, createHmac } from "crypto";
import { sql } from "./db";

const TOKEN_PREFIX = "fpat_";
const TOKEN_BYTES = 32;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
}

export interface GeneratedToken {
  token: string;     // plaintext, mostrar al usuario una sola vez
  hash: string;      // HMAC-SHA256 hex, se guarda en DB
  preview: string;   // para UI, "fpat_abcd...WXYZ"
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function generateApplePayToken(): GeneratedToken {
  const raw = base64url(randomBytes(TOKEN_BYTES));
  const token = TOKEN_PREFIX + raw;
  return {
    token,
    hash: hashApplePayToken(token),
    preview: previewToken(token),
  };
}

export function hashApplePayToken(token: string): string {
  if (!token || !token.startsWith(TOKEN_PREFIX)) {
    throw new Error("Invalid Fintrk personal access token format");
  }
  return createHmac("sha256", getSecret()).update(token).digest("hex");
}

export function previewToken(token: string): string {
  if (!token.startsWith(TOKEN_PREFIX)) return token.slice(0, 8) + "...";
  const rest = token.slice(TOKEN_PREFIX.length);
  const head = rest.slice(0, 4);
  const tail = rest.slice(-4);
  return `${TOKEN_PREFIX}${head}...${tail}`;
}

// ─── DB layer ───────────────────────────────────────────────────────────

let _tablesReady = false;

export async function ensureApplePayTables(): Promise<void> {
  if (_tablesReady) return;
  await sql(`
    CREATE TABLE IF NOT EXISTS apple_pay_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      token_preview TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'iPhone',
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sql(`CREATE INDEX IF NOT EXISTS idx_apple_pay_tokens_user ON apple_pay_tokens(user_id)`);
  await sql(`
    CREATE TABLE IF NOT EXISTS apple_pay_imports (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_id INTEGER REFERENCES apple_pay_tokens(id) ON DELETE SET NULL,
      transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
      external_id TEXT,
      raw_payload JSONB NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await sql(`CREATE INDEX IF NOT EXISTS idx_apple_pay_imports_user ON apple_pay_imports(user_id, created_at DESC)`);
  await sql(`CREATE INDEX IF NOT EXISTS idx_apple_pay_imports_ext ON apple_pay_imports(user_id, external_id) WHERE external_id IS NOT NULL`);
  _tablesReady = true;
}

export interface ApplePayTokenRow {
  id: number;
  user_id: number;
  token_preview: string;
  name: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export async function createApplePayToken(userId: number, name: string): Promise<{ token: string; row: ApplePayTokenRow }> {
  await ensureApplePayTables();
  const trimmedName = (name || "iPhone").trim().slice(0, 50) || "iPhone";
  const generated = generateApplePayToken();
  const rows = await sql(
    `INSERT INTO apple_pay_tokens (user_id, token_hash, token_preview, name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, token_preview, name, last_used_at, revoked_at, created_at`,
    [userId, generated.hash, generated.preview, trimmedName],
  );
  return { token: generated.token, row: rows[0] as ApplePayTokenRow };
}

export async function listApplePayTokens(userId: number): Promise<ApplePayTokenRow[]> {
  await ensureApplePayTables();
  const rows = await sql(
    `SELECT id, user_id, token_preview, name, last_used_at, revoked_at, created_at
     FROM apple_pay_tokens
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return rows as ApplePayTokenRow[];
}

export async function revokeApplePayToken(userId: number, tokenId: number): Promise<boolean> {
  await ensureApplePayTables();
  const rows = await sql(
    `UPDATE apple_pay_tokens
     SET revoked_at = NOW()
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [tokenId, userId],
  );
  return rows.length > 0;
}

export interface VerifiedToken {
  tokenId: number;
  userId: number;
}

export async function verifyApplePayToken(token: string): Promise<VerifiedToken | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  let hash: string;
  try {
    hash = hashApplePayToken(token);
  } catch {
    return null;
  }
  await ensureApplePayTables();
  const rows = await sql(
    `SELECT id, user_id FROM apple_pay_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [hash],
  );
  if (rows.length === 0) return null;
  const row = rows[0] as { id: number; user_id: number };
  // Fire-and-forget last_used_at update — we don't block the response on it.
  sql(
    `UPDATE apple_pay_tokens SET last_used_at = NOW() WHERE id = $1`,
    [row.id],
  ).catch(() => {});
  return { tokenId: row.id, userId: row.user_id };
}

export async function countRecentImports(userId: number, days = 30): Promise<number> {
  await ensureApplePayTables();
  const rows = await sql(
    `SELECT COUNT(*)::int AS c FROM apple_pay_imports
     WHERE user_id = $1 AND created_at > NOW() - ($2 || ' days')::INTERVAL`,
    [userId, String(days)],
  );
  return (rows[0]?.c as number) ?? 0;
}
