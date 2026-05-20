/**
 * Pure logic for the AI-first flow in /transactions/new.
 *
 * Design intent:
 *  - When the user gives us a photo, the AI fills everything and the user sees
 *    the summary directly. The user only sees the wizard if they tap "Edit"
 *    — the happy path never walks step by step.
 *  - When the AI is missing something, we use sensible defaults (default
 *    expense type, default account, fallback category) so the user always
 *    lands on summary and can adjust in place.
 *
 * Kept out of the page component so it can be unit-tested without rendering.
 */

export interface AiFirstInput {
  /** Number of transactions detected in the scan (most receipts = 1). */
  transactionCount: number;
  /** Model confidence 0..1. */
  confidence: number;
  description: string;
  amount: number | string;
  category: string;
  direction: "income" | "expense";
  /** Payment method hint (banco/tarjeta) detected by the model. */
  paymentMethod?: string | null;
  /** Expense type: only relevant for expenses. */
  expenseType?: string | null;
  /** Accounts the user has configured. */
  accounts: Array<{ slug: string; name: string }>;
}

/**
 * Returns true when we should skip to summary (AI has a minimal, trustworthy
 * read). Below this bar the UI falls back to the classic wizard to collect
 * the missing data.
 *
 * Minimal contract:
 *   - Exactly one transaction detected (multi-tx flows use the list summary).
 *   - Confidence at least 0.6 (calibrated down from 0.7 — we want AI-first
 *     to be the default path; users can still edit in place if anything's off).
 *   - Amount > 0.
 *   - Description non-empty.
 *
 * Category, account and expense type are NOT required — defaults fill in.
 */
export function shouldSkipToSummary(input: AiFirstInput): boolean {
  if (input.transactionCount !== 1) return false;
  if (input.confidence < 0.6) return false;
  if (!input.description) return false;
  const n = typeof input.amount === "number" ? input.amount : parseFloat(input.amount);
  if (!isFinite(n) || n <= 0) return false;
  return true;
}

export function matchesAccount(
  paymentMethod: string,
  accounts: Array<{ slug: string; name: string }>,
): boolean {
  const pm = paymentMethod.toLowerCase();
  return accounts.some(
    (a) => pm.includes(a.slug.toLowerCase()) || pm.includes(a.name.toLowerCase()),
  );
}

/**
 * Pick the best account for a scanned transaction:
 *  1. Match by payment method if available.
 *  2. Only-one-account fallback.
 *  3. Primary (first) account as last resort.
 */
export function resolveAccountDefault(
  paymentMethod: string | null | undefined,
  accounts: Array<{ slug: string; name: string }>,
): string {
  if (accounts.length === 0) return "";
  if (paymentMethod) {
    const pm = paymentMethod.toLowerCase();
    const hit = accounts.find(
      (a) => pm.includes(a.slug.toLowerCase()) || pm.includes(a.name.toLowerCase()),
    );
    if (hit) return hit.slug;
  }
  return accounts[0].slug;
}

/**
 * Default expense type for an expense when the AI didn't pick one.
 * Uses the category as a signal — necessities get "necesario", fun stuff
 * gets "discrecional", business tools get "negocio".
 */
export function defaultExpenseType(category: string): "necesario" | "negocio" | "discrecional" {
  const necessary = new Set(["supermercado", "alquiler", "facturas", "salud", "transporte", "universidad"]);
  const business = new Set(["herramientas-negocio", "software", "hosting", "dominios"]);
  if (necessary.has(category)) return "necesario";
  if (business.has(category)) return "negocio";
  return "discrecional";
}

/**
 * Streak flame intensity bucket, used by the UI to pick animation speed
 * and color palette.
 */
export type FlameIntensity = "off" | "normal" | "intense";

export function flameIntensityFor(streak: number, todayChecked: boolean): FlameIntensity {
  if (!todayChecked || streak <= 0) return "off";
  if (streak >= 30) return "intense";
  return "normal";
}
