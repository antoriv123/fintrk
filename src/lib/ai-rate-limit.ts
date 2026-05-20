import { sql } from "./db";

const AI_MAX = 30;
const AI_WINDOW_MS = 60 * 60 * 1000;

let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  await sql(`CREATE TABLE IF NOT EXISTS ai_usage (
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    reset_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, endpoint)
  )`);
  tableReady = true;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

/**
 * Atomic, DB-backed per-user rate limit that survives serverless cold starts.
 * Returns `{ allowed: false }` when the user has hit the limit within AI_WINDOW_MS.
 *
 * `maxPerWindow` defaults to AI_MAX (30/h) — pass a smaller number for
 * lower-impact endpoints (e.g. 5/h for error reports).
 */
export async function checkAiRateLimit(
  userId: number,
  endpoint: string,
  maxPerWindow: number = AI_MAX,
): Promise<RateLimitResult> {
  try {
    await ensureTable();

    // Upsert + atomic increment in a single query: if the existing window has expired, reset it;
    // otherwise increment count. Returns the resulting row so we can decide allow/deny.
    const rows = await sql(
      `INSERT INTO ai_usage (user_id, endpoint, count, reset_at)
       VALUES ($1, $2, 1, NOW() + INTERVAL '1 hour')
       ON CONFLICT (user_id, endpoint) DO UPDATE
       SET count = CASE
             WHEN ai_usage.reset_at < NOW() THEN 1
             ELSE ai_usage.count + 1
           END,
           reset_at = CASE
             WHEN ai_usage.reset_at < NOW() THEN NOW() + INTERVAL '1 hour'
             ELSE ai_usage.reset_at
           END
       RETURNING count, reset_at`,
      [userId, endpoint]
    ) as { count: number; reset_at: string }[];

    if (rows.length === 0) {
      return { allowed: true, retryAfterSec: 0, remaining: maxPerWindow - 1 };
    }

    const { count, reset_at } = rows[0];
    const resetMs = new Date(reset_at).getTime();
    const retryAfterSec = Math.max(0, Math.ceil((resetMs - Date.now()) / 1000));

    if (count > maxPerWindow) {
      return { allowed: false, retryAfterSec, remaining: 0 };
    }
    return { allowed: true, retryAfterSec, remaining: Math.max(0, maxPerWindow - count) };
  } catch {
    // Fail-open so a DB outage doesn't block real users. Telemetry elsewhere.
    return { allowed: true, retryAfterSec: 0, remaining: maxPerWindow };
  }
}

export const AI_RATE_WINDOW_MS = AI_WINDOW_MS;
export const AI_RATE_MAX = AI_MAX;
