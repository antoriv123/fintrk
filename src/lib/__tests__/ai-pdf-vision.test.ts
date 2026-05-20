import { describe, it, expect } from "vitest";
import { _testing } from "../ai-pdf-vision";
import type { ParsedTransaction } from "../csv-parser";

const { checkConsistency } = _testing;

function tx(amount: number, direction: "income" | "expense"): ParsedTransaction {
  return { date: "2026-04-01", description: "x", amount, currency: "EUR", direction };
}

describe("checkConsistency", () => {
  it("passes when balances are missing (nothing to check)", () => {
    expect(checkConsistency([tx(100, "expense")], {})).toEqual({ ok: true });
    expect(checkConsistency([tx(100, "expense")], { opening: 1000 })).toEqual({ ok: true });
    expect(checkConsistency([tx(100, "expense")], { closing: 900 })).toEqual({ ok: true });
  });

  it("passes when transactions sum matches balance delta exactly", () => {
    const txs = [tx(50, "expense"), tx(30, "expense"), tx(20, "income")];
    const result = checkConsistency(txs, { opening: 1000, closing: 940 });
    // delta = -60, sum = -60
    expect(result).toEqual({ ok: true });
  });

  it("passes when difference is within €1 tolerance", () => {
    const txs = [tx(100, "expense")];
    const result = checkConsistency(txs, { opening: 1000, closing: 900.5 });
    // delta = -99.5, sum = -100, diff = 0.5 → within tolerance
    expect(result).toEqual({ ok: true });
  });

  it("fails when difference exceeds €1 tolerance", () => {
    const txs = [tx(100, "expense")];
    const result = checkConsistency(txs, { opening: 1000, closing: 800 });
    // delta = -200, sum = -100, diff = 100 → fail
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/no cuadra/i);
      expect(result.reason).toMatch(/100/); // the diff value appears in message
    }
  });

  it("skips check with 0 transactions (that path is handled separately)", () => {
    expect(checkConsistency([], { opening: 1000, closing: 500 })).toEqual({ ok: true });
  });

  it("correctly handles pure-income statement (salary deposit)", () => {
    const txs = [tx(2500, "income")];
    const result = checkConsistency(txs, { opening: 1000, closing: 3500 });
    expect(result).toEqual({ ok: true });
  });

  it("detects the cohelet scenario: lots of tx missing from extraction", () => {
    // Parser extracted only 1 transaction from a statement with many movements
    // and balance indicates there should be far more activity.
    const txs = [tx(45, "expense")];
    const result = checkConsistency(txs, { opening: 3000, closing: 1234.56 });
    // delta = -1765.44, sum = -45, diff = 1720.44 → clearly fails
    expect(result.ok).toBe(false);
  });
});
