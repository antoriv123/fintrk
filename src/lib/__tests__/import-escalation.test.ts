import { describe, it, expect } from "vitest";
import { decideEscalation, pickBestResult } from "../import-escalation";
import type { ParseResult } from "../csv-parser";

function mkResult(count: number, extra: Partial<ParseResult> = {}): ParseResult {
  return {
    transactions: Array.from({ length: count }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      description: `tx ${i}`,
      amount: 10,
      currency: "EUR",
      direction: "expense" as const,
    })),
    format: "test",
    errors: [],
    ...extra,
  };
}

// ─── decideEscalation ───

describe("decideEscalation", () => {
  it("does not escalate when no AI key is available", () => {
    const d = decideEscalation({ parseResult: mkResult(0), hasAIKey: false });
    expect(d.escalate).toBe(false);
    expect(d.reason).toBe("no-ai-key");
  });

  it("escalates when parser crashed (null parseResult)", () => {
    const d = decideEscalation({ parseResult: null, hasAIKey: true });
    expect(d.escalate).toBe(true);
    expect(d.reason).toBe("parser-crashed");
  });

  it("escalates when 0 transactions returned", () => {
    const d = decideEscalation({ parseResult: mkResult(0), hasAIKey: true });
    expect(d.escalate).toBe(true);
    expect(d.reason).toBe("zero-transactions");
  });

  it("escalates when weakDetection=true even with transactions", () => {
    const d = decideEscalation({
      parseResult: mkResult(1, { weakDetection: true }),
      hasAIKey: true,
    });
    expect(d.escalate).toBe(true);
    expect(d.reason).toBe("weak-detection");
  });

  it("escalates when suspicious density: 1 tx from 5 page images", () => {
    const d = decideEscalation({
      parseResult: mkResult(1),
      hasAIKey: true,
      pageImageCount: 5,
    });
    expect(d.escalate).toBe(true);
    expect(d.reason).toBe("suspicious-density");
  });

  it("escalates when suspicious density: 2 tx from large PDF buffer", () => {
    const d = decideEscalation({
      parseResult: mkResult(2),
      hasAIKey: true,
      bufferSize: 200_000,
    });
    expect(d.escalate).toBe(true);
    expect(d.reason).toBe("suspicious-density");
  });

  it("escalates when suspicious density: 1 tx from large CSV text", () => {
    const d = decideEscalation({
      parseResult: mkResult(1),
      hasAIKey: true,
      textSize: 10_000,
    });
    expect(d.escalate).toBe(true);
    expect(d.reason).toBe("suspicious-density");
  });

  it("does not escalate when healthy: many transactions from normal input", () => {
    const d = decideEscalation({
      parseResult: mkResult(25),
      hasAIKey: true,
      bufferSize: 200_000,
      pageImageCount: 3,
    });
    expect(d.escalate).toBe(false);
    expect(d.reason).toBe("not-needed");
  });

  it("does not flag 1 tx as suspicious when input is tiny", () => {
    // A tiny CSV with a single row is legit — don't burn AI credits on it
    const d = decideEscalation({
      parseResult: mkResult(1),
      hasAIKey: true,
      textSize: 100,
    });
    expect(d.escalate).toBe(false);
  });

  it("cohelet's regression case: PDF + 1 tx + generic-pdf format + weakDetection=true", () => {
    // This is the exact bug pattern: Santander PDF fell into parseGenericPDF,
    // which returned 1 tx with weakDetection=true. Old code did NOT escalate
    // because length > 0. New code MUST escalate.
    const d = decideEscalation({
      parseResult: mkResult(1, { format: "generic-pdf", weakDetection: true }),
      hasAIKey: true,
      bufferSize: 500_000,
      pageImageCount: 3,
    });
    expect(d.escalate).toBe(true);
    expect(d.reason).toBe("weak-detection");
  });

  it("unknown bank PDF routed to AI via empty weakDetection=true result", () => {
    // After detectPDFBank matches e.g. Santander but no parser exists,
    // parseBankPDF returns {transactions: [], weakDetection: true}. That also
    // must escalate.
    const d = decideEscalation({
      parseResult: mkResult(0, { format: "santander-pdf", weakDetection: true }),
      hasAIKey: true,
      pageImageCount: 3,
    });
    expect(d.escalate).toBe(true);
    // 0 transactions takes precedence in the check ordering
    expect(d.reason).toBe("zero-transactions");
  });
});

// ─── pickBestResult ───

describe("pickBestResult", () => {
  it("returns null when both are null", () => {
    expect(pickBestResult(null, null)).toBeNull();
  });

  it("returns structured when AI is null", () => {
    const s = mkResult(5);
    expect(pickBestResult(s, null)).toBe(s);
  });

  it("returns AI (weakDetection=false) when structured is null", () => {
    const ai = mkResult(3, { weakDetection: true });
    const picked = pickBestResult(null, ai);
    expect(picked?.transactions).toHaveLength(3);
    expect(picked?.weakDetection).toBe(false);
  });

  it("picks AI when AI has more transactions than structured", () => {
    const s = mkResult(1, { format: "generic-pdf" });
    const ai = mkResult(42, { format: "vision" });
    const picked = pickBestResult(s, ai);
    expect(picked?.transactions).toHaveLength(42);
    expect(picked?.format).toBe("vision");
    expect(picked?.weakDetection).toBe(false);
  });

  it("keeps structured when it has more transactions than AI", () => {
    const s = mkResult(30);
    const ai = mkResult(5);
    const picked = pickBestResult(s, ai);
    expect(picked?.transactions).toHaveLength(30);
    expect(picked).toBe(s);
  });

  it("keeps structured when tie", () => {
    const s = mkResult(10);
    const ai = mkResult(10);
    const picked = pickBestResult(s, ai);
    expect(picked).toBe(s);
  });

  it("preserves finalBalances from structured when AI doesn't have any", () => {
    const s = mkResult(1, { finalBalances: { bbva: 1234.56 } });
    const ai = mkResult(20);
    const picked = pickBestResult(s, ai);
    expect(picked?.finalBalances).toEqual({ bbva: 1234.56 });
    expect(picked?.transactions).toHaveLength(20);
  });

  it("carries over detected account from structured to AI transactions", () => {
    const s: ParseResult = {
      transactions: [{
        date: "2026-04-01",
        description: "x",
        amount: 1,
        currency: "EUR",
        direction: "expense",
        account: "santander",
      }],
      format: "santander-pdf",
      errors: [],
    };
    const ai = mkResult(10, { format: "vision" });
    const picked = pickBestResult(s, ai);
    expect(picked?.transactions.every((t) => t.account === "santander")).toBe(true);
  });

  it("does not overwrite AI's own account when present", () => {
    const s = mkResult(1, {
      transactions: [{
        date: "2026-04-01", description: "x", amount: 1, currency: "EUR",
        direction: "expense", account: "bbva",
      }],
    });
    const ai: ParseResult = {
      transactions: [
        { date: "2026-04-01", description: "y", amount: 2, currency: "EUR", direction: "expense", account: "revolut" },
        { date: "2026-04-02", description: "z", amount: 3, currency: "EUR", direction: "expense" },
      ],
      format: "vision",
      errors: [],
    };
    const picked = pickBestResult(s, ai);
    expect(picked?.transactions[0].account).toBe("revolut"); // AI's own account preserved
    expect(picked?.transactions[1].account).toBe("bbva"); // Structured account filled in
  });
});
