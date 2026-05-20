/**
 * Apple Pay ingest helpers — logica pura extraida para tests.
 */

import { sanitizeText } from "./sanitize";
import { normalizeDesc, merchantKey } from "./import-dedup";

export interface IngestPayload {
  amount: number;
  currency: string;
  merchant: string;
  date: string; // YYYY-MM-DD
  card_last4: string | null;
  external_id: string | null;
}

export type NormalizeResult =
  | { ok: true; value: IngestPayload }
  | { ok: false; error: string };

const ALLOWED_CURRENCIES = new Set(["EUR", "USD", "GBP"]);

function parseAmount(input: unknown): number | null {
  if (typeof input === "number") {
    return isFinite(input) && input > 0 ? input : null;
  }
  if (typeof input === "string") {
    // Apple Shortcuts may deliver "4,50" (comma locale) or "€4.50"
    const cleaned = input.trim().replace(/[^\d.,-]/g, "").replace(/\./g, ".").replace(/,/g, ".");
    const n = parseFloat(cleaned);
    return isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function parseDate(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  // Accept YYYY-MM-DD directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    return trimmed;
  }
  // Accept ISO8601 (what iOS Shortcut "Current Date" emits when formatted as ISO)
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 2000 || y > new Date().getUTCFullYear() + 1) return null;
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function parseCurrency(input: unknown): string {
  if (typeof input !== "string") return "EUR";
  const upper = input.trim().toUpperCase().slice(0, 3);
  return ALLOWED_CURRENCIES.has(upper) ? upper : "EUR";
}

function parseLast4(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : null;
}

function parseExternalId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, 100);
  return trimmed ? trimmed : null;
}

export function normalizeIngestPayload(body: unknown): NormalizeResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Payload invalido" };
  }
  const b = body as Record<string, unknown>;

  const amount = parseAmount(b.amount);
  if (amount === null) return { ok: false, error: "amount requerido y positivo" };

  const merchantRaw = typeof b.merchant === "string" ? b.merchant : "";
  const merchant = sanitizeText(merchantRaw, 300);
  if (!merchant) return { ok: false, error: "merchant requerido" };

  const date = parseDate(b.date);
  if (!date) return { ok: false, error: "date requerido (YYYY-MM-DD o ISO8601)" };

  return {
    ok: true,
    value: {
      amount,
      currency: parseCurrency(b.currency),
      merchant,
      date,
      card_last4: parseLast4(b.card_last4),
      external_id: parseExternalId(b.external_id),
    },
  };
}

// ─── Account selection ──────────────────────────────────────────────────

export interface AccountCandidate {
  slug: string;
  name: string;
}

export function pickDefaultAccount(
  accounts: AccountCandidate[],
  cardLast4: string | null,
): string | null {
  if (accounts.length === 0) return null;
  if (cardLast4) {
    const match = accounts.find((a) => a.name.includes(cardLast4));
    if (match) return match.slug;
  }
  return accounts[0].slug;
}

// ─── Duplicate detection ────────────────────────────────────────────────

export interface PriorImport {
  external_id: string | null;
  transaction_id: number | null;
}

export function isExternalDuplicate(
  priorImports: PriorImport[],
  externalId: string | null,
): PriorImport | null {
  if (!externalId) return null;
  for (const p of priorImports) {
    if (p.external_id === externalId && p.transaction_id !== null) return p;
  }
  return null;
}

export interface ExistingTx {
  date: string;
  amount: number;
  description: string;
}

export function isContentDuplicate(
  existing: ExistingTx[],
  candidate: ExistingTx,
  tolerance = 0.01,
): boolean {
  const candKey = merchantKey(candidate.description);
  const candNorm = normalizeDesc(candidate.description);
  for (const ex of existing) {
    if (ex.date !== candidate.date) continue;
    if (Math.abs(ex.amount - candidate.amount) > tolerance) continue;
    if (normalizeDesc(ex.description) === candNorm) return true;
    if (candKey && candKey.length >= 3 && merchantKey(ex.description) === candKey) return true;
  }
  return false;
}
