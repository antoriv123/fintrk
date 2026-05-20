export const runtime = "nodejs";

/**
 * Apple Pay Shortcut ingest endpoint.
 *
 * Auth: Bearer fpat_XXX (personal access token, HMAC-SHA256 lookup).
 * Route is in PUBLIC_API_ROUTES — middleware doesn't inject x-user-id.
 *
 * Flow:
 *  1. Verify token → get userId.
 *  2. Rate limit: 200 ingests/h per user.
 *  3. Validate + normalize payload.
 *  4. Idempotency: external_id match in last 7 days → return existing tx.
 *  5. Content dedup: same date + amount + merchant_key → return existing tx.
 *  6. Auto-categorize (local rules, AI fallback only if rules miss).
 *  7. Pick default account (prefer one matching card_last4).
 *  8. INSERT transaction + update streak + INSERT apple_pay_imports log.
 *  9. Respond 201 { transaction_id, category, status, streak }.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  verifyApplePayToken,
  ensureApplePayTables,
} from "@/lib/apple-pay-tokens";
import {
  normalizeIngestPayload,
  pickDefaultAccount,
  isExternalDuplicate,
  isContentDuplicate,
  type ExistingTx,
  type PriorImport,
} from "@/lib/apple-pay-ingest";
import { suggestCategory } from "@/lib/auto-categorize";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { categorizeTransactions } from "@/lib/ai";
import { clearDemoTransactions } from "@/lib/demo-data";

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  // Tolerant parse — iOS Shortcuts and other clients sometimes send the header with
  // variable casing ("bearer"), no prefix at all, or trailing whitespace. As long as
  // what they sent is a fpat_-prefixed token, we accept it.
  const trimmed = h.trim();
  const match = trimmed.match(/^(?:bearer\s+)?(fpat_[A-Za-z0-9_-]+)$/i);
  return match ? match[1] : null;
}

async function updateStreak(userId: number, dateStr: string): Promise<{ current: number; isFirst: boolean } | null> {
  try {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    // Only count toward streak when the tx date is today's local day.
    if (dateStr !== todayStr) return null;

    sql(
      "INSERT INTO daily_checkins (user_id, date, type) VALUES ($1, $2, 'expense_logged') ON CONFLICT (user_id, date) DO NOTHING",
      [userId, todayStr],
    ).catch(() => {});

    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getDate()).padStart(2, "0")}`;

    const streakRows = await sql(
      "SELECT current_streak, best_streak, last_checkin_date FROM streaks WHERE user_id = $1",
      [userId],
    );
    if (streakRows.length === 0) {
      await sql(
        "INSERT INTO streaks (user_id, current_streak, best_streak, last_checkin_date) VALUES ($1, 1, 1, $2)",
        [userId, todayStr],
      );
      return { current: 1, isFirst: true };
    }
    const s = streakRows[0];
    if (s.last_checkin_date === todayStr) {
      return { current: s.current_streak as number, isFirst: false };
    }
    const newStreak = s.last_checkin_date === yesterdayStr ? (s.current_streak as number) + 1 : 1;
    const newBest = Math.max(s.best_streak as number, newStreak);
    await sql(
      "UPDATE streaks SET current_streak = $1, best_streak = $2, last_checkin_date = $3, updated_at = NOW() WHERE user_id = $4",
      [newStreak, newBest, todayStr, userId],
    );
    return { current: newStreak, isFirst: false };
  } catch {
    return null;
  }
}

async function resolveCategory(
  description: string,
  amount: number,
  currency: string,
  date: string,
): Promise<{ category: string; expense_type: string | null }> {
  // Instant local rules first — covers 80% of common merchants with no latency.
  const local = suggestCategory(description);
  if (local) return { category: local.category, expense_type: local.expenseType };

  // AI fallback only when rules miss. Best-effort: if it fails, fall back to "otros".
  try {
    const [result] = await categorizeTransactions([{
      description,
      amount,
      currency,
      date,
      direction: "expense",
    }]);
    if (result) return { category: result.category, expense_type: result.expense_type };
  } catch {
    // swallow — AI is best-effort here
  }
  return { category: "otros", expense_type: "discrecional" };
}

export async function POST(req: NextRequest) {
  const bearer = extractBearer(req);
  if (!bearer) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }

  const verified = await verifyApplePayToken(bearer);
  if (!verified) {
    return NextResponse.json({ error: "Token invalido o revocado" }, { status: 401 });
  }
  const { userId, tokenId } = verified;

  // Rate limit per user (all tokens share the bucket).
  const rl = await checkAiRateLimit(userId, "apple_pay_ingest", 200);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit excedido", retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const body = await req.json().catch(() => null);
  const norm = normalizeIngestPayload(body);
  if (!norm.ok) {
    await logImport(userId, tokenId, null, body, null, "rejected", norm.error);
    return NextResponse.json({ error: norm.error }, { status: 400 });
  }
  const payload = norm.value;

  // 1. Idempotency by external_id (7-day window).
  if (payload.external_id) {
    const priorRows = await sql(
      `SELECT external_id, transaction_id FROM apple_pay_imports
       WHERE user_id = $1 AND external_id = $2 AND transaction_id IS NOT NULL
         AND created_at > NOW() - INTERVAL '7 days'
       ORDER BY created_at DESC LIMIT 1`,
      [userId, payload.external_id],
    );
    const hit = isExternalDuplicate(priorRows as PriorImport[], payload.external_id);
    if (hit) {
      await logImport(userId, tokenId, hit.transaction_id, body, payload.external_id, "duplicate", "external_id");
      return NextResponse.json(
        { ok: true, status: "duplicate", transaction_id: hit.transaction_id, reason: "external_id" },
        { status: 200 },
      );
    }
  }

  // 2. Content dedup against recent transactions (7-day window).
  const recentRows = await sql(
    `SELECT date, amount, description FROM transactions
     WHERE user_id = $1 AND direction = 'expense' AND date BETWEEN $2 AND $3`,
    [userId, addDays(payload.date, -3), addDays(payload.date, 3)],
  );
  const contentDup = isContentDuplicate(
    recentRows as ExistingTx[],
    { date: payload.date, amount: payload.amount, description: payload.merchant },
  );
  if (contentDup) {
    await logImport(userId, tokenId, null, body, payload.external_id, "duplicate", "content");
    return NextResponse.json(
      { ok: true, status: "duplicate", reason: "content" },
      { status: 200 },
    );
  }

  // 3. Auto-categorize.
  const { category, expense_type } = await resolveCategory(
    payload.merchant,
    payload.amount,
    payload.currency,
    payload.date,
  );

  // 4. Pick default account (prefer name matching last4).
  const accountRows = await sql(
    `SELECT slug, name FROM accounts WHERE user_id = $1 AND is_active = 1 ORDER BY created_at ASC`,
    [userId],
  );
  const account = pickDefaultAccount(
    accountRows as { slug: string; name: string }[],
    payload.card_last4,
  );

  // Clear demo transactions before the first real save.
  clearDemoTransactions(userId).catch(() => {});

  // 5. INSERT transaction. EUR conversion: we don't know the FX rate at ingest time,
  //    so if currency !== EUR the user will see it in original currency. Convert to
  //    EUR via a post-ingest job if needed later.
  const eurAmount = payload.currency === "EUR" ? payload.amount : payload.amount;
  const inserted = await sql(
    `INSERT INTO transactions
       (user_id, amount, currency, eur_amount, direction, description, category, expense_type, date, image_path, telegram_message_id, account)
     VALUES ($1, $2, $3, $4, 'expense', $5, $6, $7, $8, NULL, NULL, $9)
     RETURNING id`,
    [userId, payload.amount, payload.currency, eurAmount, payload.merchant, category, expense_type, payload.date, account],
  );
  const transactionId = inserted[0].id as number;

  // 6. Streak bump (only if tx date is today).
  const streakInfo = await updateStreak(userId, payload.date);

  // 7. Log import.
  await logImport(userId, tokenId, transactionId, body, payload.external_id, "created", null);

  return NextResponse.json(
    {
      ok: true,
      status: "created",
      transaction_id: transactionId,
      category,
      expense_type,
      amount: payload.amount,
      currency: payload.currency,
      merchant: payload.merchant,
      date: payload.date,
      account,
      streak: streakInfo,
    },
    { status: 201 },
  );
}

async function logImport(
  userId: number,
  tokenId: number,
  transactionId: number | null,
  rawBody: unknown,
  externalId: string | null,
  status: "created" | "duplicate" | "rejected",
  reason: string | null,
): Promise<void> {
  try {
    await ensureApplePayTables();
    await sql(
      `INSERT INTO apple_pay_imports
         (user_id, token_id, transaction_id, external_id, raw_payload, status, reason)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        userId,
        tokenId,
        transactionId,
        externalId,
        JSON.stringify(rawBody ?? {}),
        status,
        reason,
      ],
    );
  } catch (e) {
    console.warn("[apple-pay-ingest] log failed:", e instanceof Error ? e.message : e);
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
