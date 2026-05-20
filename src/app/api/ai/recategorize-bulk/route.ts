export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { categorizeTransactions } from "@/lib/ai";
import { suggestCategory } from "@/lib/auto-categorize";
import { logError } from "@/lib/log-error";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";

interface OthersRow {
  id: number;
  description: string;
  amount: number;
  eur_amount: number;
  currency: string;
  direction: "income" | "expense";
  date: string;
  account: string | null;
}

const MAX_ROWS_PER_REQUEST = 100;
const MAX_REQUESTS_PER_HOUR = 10;

/**
 * Reclassify transactions stuck in "otros" using the same GPT batch categorizer
 * that runs during import. Sequence:
 *   1. Try local rules first (no API cost, instant) — the keyword list in
 *      auto-categorize.ts catches common cases like MERCADONA, NETFLIX...
 *   2. For the rest, batch through GPT in groups of 30.
 *   3. Only write updates with confidence >= 0.6 to avoid replacing one
 *      useless "otros" with a confidently-wrong category.
 *
 * POST { dryRun?: boolean, limit?: number }
 * Returns { total, processed, updated, rulesMatched, aiMatched, kept }.
 */
export async function POST(req: NextRequest) {
  let userId: number;
  try {
    userId = await getUserId();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const rate = await checkAiRateLimit(userId, "recategorize-bulk", MAX_REQUESTS_PER_HOUR);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Has usado la IA mucho — vuelve en ${Math.ceil(rate.retryAfterSec / 60)} min` },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      error: "IA no configurada",
      detail: "OPENAI_API_KEY no está definida en el servidor. Contacta con soporte.",
    }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;
  // Por defecto un lote pequeño (20) y ventana de 30 días para que el usuario
  // no tenga que revisar cientos de sugerencias de golpe.
  const requestedLimit = Math.max(Number(body?.limit) || 20, 1);
  const limit = Math.min(requestedLimit, MAX_ROWS_PER_REQUEST);
  const requestedApplyList = Array.isArray(body?.apply) ? (body.apply as { id: number; category: string; expense_type?: string | null }[]) : null;
  const applyList = requestedApplyList?.slice(0, MAX_ROWS_PER_REQUEST) ?? null;
  const originalRowCount = requestedApplyList ? requestedApplyList.length : requestedLimit;
  const truncated = originalRowCount > MAX_ROWS_PER_REQUEST;
  const remaining = truncated ? originalRowCount - MAX_ROWS_PER_REQUEST : 0;
  const daysBack = Math.min(Math.max(Number(body?.daysBack) || 30, 1), 365);
  // Opcional: offset para traer el siguiente lote desde el modal.
  const offset = Math.max(Number(body?.offset) || 0, 0);
  // Opcional: lista de suggestions pre-aprobadas por el user (tras un dryRun).
  // Formato: [{ id, category, expense_type? }]

  try {
    return await handleRecategorize({ userId, dryRun, limit, daysBack, offset, applyList, truncated, remaining });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logError("recategorize-bulk failed", e, { userId });
    return NextResponse.json({
      error: "La IA no pudo procesar la petición",
      detail: message,
    }, { status: 500 });
  }
}

async function handleRecategorize({
  userId,
  dryRun,
  limit,
  daysBack,
  offset,
  applyList,
  truncated,
  remaining,
}: {
  userId: number;
  dryRun: boolean;
  limit: number;
  daysBack: number;
  offset: number;
  applyList: { id: number; category: string; expense_type?: string | null }[] | null;
  truncated: boolean;
  remaining: number;
}) {

  // Fast-path: el user ya aprobo un subset tras el dryRun.
  if (applyList && applyList.length > 0) {
    let updated = 0;
    for (const u of applyList) {
      const id = Number(u.id);
      if (!id || !u.category) continue;
      try {
        await sql(
          `UPDATE transactions SET category = $1, expense_type = COALESCE($2, expense_type)
           WHERE id = $3 AND user_id = $4`,
          [u.category, u.expense_type ?? null, id, userId],
        );
        updated++;
      } catch (e) {
        console.error("[recategorize-bulk] manual apply failed for tx", id, e);
      }
    }
    return NextResponse.json({ updated, mode: "manual", truncated, remaining });
  }

  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);

  // Cuenta total de "otros" en la ventana, para que el modal sepa si quedan
  // lotes pendientes sin tener que traer todos los registros.
  const [totalRow] = (await sql(
    `SELECT COUNT(*)::int as n FROM transactions
     WHERE user_id = $1 AND category IN ('otros', 'otros-ingreso') AND date >= $2`,
    [userId, since],
  )) as { n: number }[];
  const totalInWindow = Number(totalRow?.n ?? 0);

  const rows = (await sql(
    `SELECT id, description, amount, eur_amount, currency, direction, date, account
     FROM transactions
     WHERE user_id = $1 AND category IN ('otros', 'otros-ingreso') AND date >= $2
     ORDER BY date DESC
     OFFSET $3 LIMIT $4`,
    [userId, since, offset, limit],
  )) as OthersRow[];

  if (rows.length === 0) {
    return NextResponse.json({
      total: 0,
      totalInWindow,
      daysBack,
      offset,
      processed: 0,
      updated: 0,
      rulesMatched: 0,
      aiMatched: 0,
      kept: 0,
      hasMore: false,
      truncated,
      remaining,
    });
  }

  const updates: { id: number; category: string; expense_type: string | null; source: "rule" | "ai" }[] = [];
  const needsAI: OthersRow[] = [];

  // Pass 1: local keyword rules
  for (const tx of rows) {
    if (tx.direction === "expense") {
      const match = suggestCategory(tx.description ?? "");
      if (match) {
        updates.push({ id: tx.id, category: match.category, expense_type: match.expenseType, source: "rule" });
        continue;
      }
    }
    needsAI.push(tx);
  }

  const rulesMatched = updates.length;

  // Pass 2: GPT batch on the rest
  let aiMatched = 0;
  if (needsAI.length > 0) {
    const results = await categorizeTransactions(
      needsAI.map((tx) => ({
        description: tx.description ?? "",
        amount: Number(tx.amount),
        currency: tx.currency,
        date: tx.date,
        direction: tx.direction,
        account: tx.account ?? undefined,
      })),
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const tx = needsAI[i];
      const isBlank = r.category === "otros" || r.category === "otros-ingreso";
      if (!isBlank && r.confidence >= 0.6) {
        updates.push({ id: tx.id, category: r.category, expense_type: r.expense_type, source: "ai" });
        aiMatched++;
      }
    }
  }

  if (dryRun) {
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const preview = updates.map((u) => {
      const row = rowById.get(u.id);
      return {
        id: u.id,
        description: row?.description ?? "",
        amount: row ? Number(row.eur_amount ?? row.amount ?? 0) : 0,
        date: row?.date ?? "",
        direction: row?.direction ?? "expense",
        suggestedCategory: u.category,
        suggestedExpenseType: u.expense_type,
        source: u.source,
      };
    });
    return NextResponse.json({
      total: rows.length,
      totalInWindow,
      daysBack,
      offset,
      hasMore: offset + rows.length < totalInWindow,
      rulesMatched,
      aiMatched,
      kept: rows.length - updates.length,
      preview,
      truncated,
      remaining,
    });
  }

  // Apply updates
  let updated = 0;
  for (const u of updates) {
    try {
      await sql(
        `UPDATE transactions SET category = $1, expense_type = COALESCE($2, expense_type)
         WHERE id = $3 AND user_id = $4`,
        [u.category, u.expense_type, u.id, userId],
      );
      updated++;
    } catch (e) {
      console.error("[recategorize-bulk] update failed for tx", u.id, e);
    }
  }

  // Si la IA encontro varias veces la misma descripcion -> mismo resultado, crea una
  // rule "contains" para que futuras tx se auto-categoricen sin llamada a IA. Dedupe
  // por (normalized key) + solo si tenemos 2+ ocurrencias coincidentes.
  const aiUpdates = updates.filter((u) => u.source === "ai");
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const counter = new Map<string, { count: number; desc: string; category: string; expense_type: string | null }>();
  for (const u of aiUpdates) {
    const row = rowById.get(u.id);
    if (!row?.description) continue;
    const key = `${row.description.toLowerCase().trim().slice(0, 40)}|${u.category}`;
    const prev = counter.get(key);
    if (prev) prev.count++;
    else counter.set(key, { count: 1, desc: row.description.trim().slice(0, 40), category: u.category, expense_type: u.expense_type });
  }
  let rulesCreated = 0;
  for (const [, v] of counter) {
    if (v.count < 2) continue;
    try {
      await sql(
        `INSERT INTO categorization_rules (user_id, name, match_type, match_value, category, expense_type, priority)
         VALUES ($1, $2, 'contains', $3, $4, $5, 50)
         ON CONFLICT DO NOTHING`,
        [userId, `Auto: ${v.desc}`, v.desc.toLowerCase(), v.category, v.expense_type],
      );
      rulesCreated++;
    } catch (e) {
      console.warn("[recategorize-bulk] rule insert skipped", e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    total: rows.length,
    processed: rows.length,
    updated,
    rulesMatched,
    aiMatched,
    rulesCreated,
    kept: rows.length - updates.length,
    truncated,
    remaining,
  });
}

/** Quick count of "otros" transactions so the UI can decide when to show the CTA. */
export async function GET() {
  try {
    const userId = await getUserId();
    const [row] = (await sql(
      `SELECT
         COUNT(*)::int AS total,
         COALESCE(SUM(eur_amount), 0) AS eur_total
       FROM transactions
       WHERE user_id = $1 AND category IN ('otros', 'otros-ingreso')`,
      [userId],
    )) as { total: number; eur_total: number }[];
    return NextResponse.json({ total: row?.total ?? 0, eurTotal: Number(row?.eur_total ?? 0) });
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
