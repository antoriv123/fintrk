import type { ParseResult } from "./csv-parser";

/**
 * Pure decision function: should the API layer escalate to AI fallback?
 *
 * Called after the structured parser runs. The structured parser is fast but
 * brittle — for banks it doesn't recognise, it can silently drop transactions
 * or pick up a single garbage row. The AI fallback (vision or text) is slow
 * and costs money, so we only escalate when there's a reason.
 *
 * Escalate when ANY of the following is true:
 *   1. Parser crashed (no parseResult at all)
 *   2. Parser returned 0 transactions
 *   3. Parser marked the result as weakDetection=true (generic/auto path,
 *      unrecognised bank, or broad search was needed)
 *   4. Suspicious density: very few transactions (< 3) for a non-trivial input
 *      (≥ 40 KB PDF/Excel, ≥ 2 KB CSV, or ≥ 2 rendered PDF pages)
 */
export interface EscalationInput {
  parseResult: Pick<ParseResult, "transactions" | "weakDetection"> | null;
  hasAIKey: boolean;
  bufferSize?: number; // bytes, for PDF/Excel base64 payload
  textSize?: number; // chars, for CSV text
  pageImageCount?: number; // number of pre-rendered PDF page images
}

export interface EscalationDecision {
  escalate: boolean;
  reason: "no-ai-key" | "parser-crashed" | "zero-transactions" | "weak-detection" | "suspicious-density" | "not-needed";
}

export function decideEscalation(input: EscalationInput): EscalationDecision {
  const { parseResult, hasAIKey, bufferSize = 0, textSize = 0, pageImageCount = 0 } = input;

  if (!hasAIKey) return { escalate: false, reason: "no-ai-key" };
  if (!parseResult) return { escalate: true, reason: "parser-crashed" };

  const txCount = parseResult.transactions.length;
  if (txCount === 0) return { escalate: true, reason: "zero-transactions" };
  if (parseResult.weakDetection === true) return { escalate: true, reason: "weak-detection" };

  const hasSubstantialInput = bufferSize > 40_000 || textSize > 2_000 || pageImageCount >= 2;
  if (hasSubstantialInput && txCount < 3) {
    return { escalate: true, reason: "suspicious-density" };
  }

  return { escalate: false, reason: "not-needed" };
}

/**
 * Given structured parser result and AI result, pick the one with more
 * transactions (simple heuristic, usually correct). Preserves finalBalances
 * and detected account from the structured result when AI doesn't have them.
 */
export function pickBestResult(
  structured: ParseResult | null,
  ai: ParseResult | null,
): ParseResult | null {
  if (!structured && !ai) return null;
  if (!ai) return structured;
  if (!structured) return { ...ai, weakDetection: false };

  const structuredCount = structured.transactions.length;
  const aiCount = ai.transactions.length;

  if (aiCount > structuredCount) {
    const merged: ParseResult = {
      ...ai,
      finalBalances: ai.finalBalances ?? structured.finalBalances,
      weakDetection: false,
    };
    const detectedAccount = structured.transactions[0]?.account;
    if (detectedAccount) {
      for (const tx of merged.transactions) {
        if (!tx.account) tx.account = detectedAccount;
      }
    }
    return merged;
  }

  return structured;
}
