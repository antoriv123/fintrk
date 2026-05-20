import { describe, it, expect } from "vitest";
import { normalizeDesc, merchantKey, similarity, smartDeduplicate } from "../import-dedup";

describe("normalizeDesc", () => {
  it("lowercases + strips accents + collapses spaces", () => {
    expect(normalizeDesc("  CAFÉ  MARTÍN   ")).toBe("cafe martin");
    expect(normalizeDesc("MERCADONA - 1234")).toBe("mercadona 1234");
  });
});

describe("merchantKey", () => {
  it("takes first alpha-heavy token (merchant)", () => {
    expect(merchantKey("MERCADONA MADRID 1234")).toBe("mercadona");
    expect(merchantKey("UBER EATS BARCELONA")).toBe("uber");
    expect(merchantKey("1234 5678")).toBe(""); // descartamos números puros
  });
});

describe("similarity", () => {
  it("1 for identical, 0 for different, proportional in between", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("abc", "xyz")).toBeLessThan(0.3);
    // "mercadona mardird" es transposición de 3 chars — la similitud queda
    // en ~0.82 con Levenshtein clásico. Aceptamos >=0.80 para este nivel.
    expect(similarity("mercadona madrid", "mercadona mardird")).toBeGreaterThan(0.8);
  });
});

describe("smartDeduplicate", () => {
  const baseExisting = [
    { date: "2026-04-15", amount: 12.5, description: "MERCADONA MADRID 1234" },
    { date: "2026-04-16", amount: 30, description: "NETFLIX" },
  ];

  it("marks exact duplicate", () => {
    const incoming = [{ date: "2026-04-15", amount: 12.5, description: "MERCADONA MADRID 1234" }];
    const r = smartDeduplicate(incoming, baseExisting);
    expect(r[0].duplicate).toBe(true);
    expect(r[0].reason).toBe("exact");
  });

  it("marks counterparty-same-day duplicate", () => {
    const incoming = [{ date: "2026-04-15", amount: 12.5, description: "MERCADONA BARCELONA 9999" }];
    const r = smartDeduplicate(incoming, baseExisting);
    expect(r[0].duplicate).toBe(true);
    expect(r[0].reason).toBe("counterparty-same-day");
  });

  it("marks fuzzy possible duplicate (different amount ±0.50, similar desc)", () => {
    const incoming = [{ date: "2026-04-15", amount: 12.85, description: "MERCADONA MARDID 1234" }];
    const r = smartDeduplicate(incoming, baseExisting);
    expect(r[0].duplicate).toBe(false);
    expect(r[0].possibleDuplicate).toBe(true);
    expect(r[0].reason).toBe("fuzzy");
  });

  it("keeps legitimate new tx untouched", () => {
    const incoming = [{ date: "2026-04-17", amount: 45, description: "GASOLINERA REPSOL" }];
    const r = smartDeduplicate(incoming, baseExisting);
    expect(r[0].duplicate).toBe(false);
    expect(r[0].possibleDuplicate).toBe(false);
  });

  it("detects duplicate within the same batch", () => {
    const incoming = [
      { date: "2026-04-18", amount: 9.99, description: "SPOTIFY PREMIUM" },
      { date: "2026-04-18", amount: 9.99, description: "SPOTIFY PREMIUM" },
    ];
    const r = smartDeduplicate(incoming, []);
    expect(r[0].duplicate).toBe(false);
    expect(r[1].duplicate).toBe(true);
    expect(r[1].reason).toBe("exact");
  });
});
