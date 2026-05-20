import { describe, expect, it } from "vitest";
import {
  defaultExpenseType,
  flameIntensityFor,
  matchesAccount,
  resolveAccountDefault,
  shouldSkipToSummary,
} from "../ai-first";

const baseInput = {
  transactionCount: 1,
  confidence: 0.9,
  description: "Mercadona",
  amount: 42.5,
  category: "supermercado",
  direction: "expense" as const,
  paymentMethod: "revolut",
  expenseType: "necesario",
  accounts: [
    { slug: "revolut", name: "Revolut" },
    { slug: "bbva", name: "BBVA" },
  ],
};

describe("shouldSkipToSummary", () => {
  it("jumps to summary when everything is present", () => {
    expect(shouldSkipToSummary(baseInput)).toBe(true);
  });

  it("stays in wizard for low confidence", () => {
    expect(shouldSkipToSummary({ ...baseInput, confidence: 0.4 })).toBe(false);
  });

  it("jumps to summary at minimum confidence (0.6)", () => {
    expect(shouldSkipToSummary({ ...baseInput, confidence: 0.6 })).toBe(true);
  });

  it("stays in wizard for multi-transaction scans", () => {
    expect(shouldSkipToSummary({ ...baseInput, transactionCount: 3 })).toBe(false);
  });

  it("stays in wizard when amount missing", () => {
    expect(shouldSkipToSummary({ ...baseInput, amount: 0 })).toBe(false);
    expect(shouldSkipToSummary({ ...baseInput, amount: "" })).toBe(false);
  });

  it("jumps to summary even when category is missing (default fills in)", () => {
    expect(shouldSkipToSummary({ ...baseInput, category: "" })).toBe(true);
  });

  it("stays in wizard when description missing", () => {
    expect(shouldSkipToSummary({ ...baseInput, description: "" })).toBe(false);
  });

  it("jumps to summary on income without expenseType", () => {
    expect(
      shouldSkipToSummary({
        ...baseInput,
        direction: "income",
        expenseType: null,
        category: "nomina",
      }),
    ).toBe(true);
  });

  it("jumps to summary with no accounts (defaults are used downstream)", () => {
    expect(
      shouldSkipToSummary({
        ...baseInput,
        paymentMethod: null,
        accounts: [],
      }),
    ).toBe(true);
  });
});

describe("matchesAccount", () => {
  it("matches by slug", () => {
    expect(matchesAccount("revolut", [{ slug: "revolut", name: "Revolut" }])).toBe(true);
  });
  it("matches by name (case insensitive)", () => {
    expect(matchesAccount("MyInvestor", [{ slug: "myi", name: "MyInvestor" }])).toBe(true);
  });
  it("returns false when nothing matches", () => {
    expect(matchesAccount("n26", [{ slug: "revolut", name: "Revolut" }])).toBe(false);
  });
});

describe("resolveAccountDefault", () => {
  const accounts = [
    { slug: "revolut", name: "Revolut" },
    { slug: "bbva", name: "BBVA" },
  ];

  it("returns matched account when paymentMethod matches", () => {
    expect(resolveAccountDefault("revolut", accounts)).toBe("revolut");
  });

  it("returns first account when paymentMethod does not match", () => {
    expect(resolveAccountDefault("n26", accounts)).toBe("revolut");
  });

  it("returns first account when paymentMethod is null", () => {
    expect(resolveAccountDefault(null, accounts)).toBe("revolut");
  });

  it("returns empty string with no accounts", () => {
    expect(resolveAccountDefault(null, [])).toBe("");
  });
});

describe("defaultExpenseType", () => {
  it("returns necesario for necessities", () => {
    expect(defaultExpenseType("supermercado")).toBe("necesario");
    expect(defaultExpenseType("alquiler")).toBe("necesario");
    expect(defaultExpenseType("transporte")).toBe("necesario");
  });
  it("returns negocio for business tools", () => {
    expect(defaultExpenseType("herramientas-negocio")).toBe("negocio");
    expect(defaultExpenseType("software")).toBe("negocio");
  });
  it("returns discrecional for everything else", () => {
    expect(defaultExpenseType("ocio")).toBe("discrecional");
    expect(defaultExpenseType("otros")).toBe("discrecional");
  });
});

describe("flameIntensityFor", () => {
  it("is off when streak 0", () => {
    expect(flameIntensityFor(0, true)).toBe("off");
  });
  it("is off when today not checked", () => {
    expect(flameIntensityFor(10, false)).toBe("off");
  });
  it("is normal for 1-29 days with check-in", () => {
    expect(flameIntensityFor(1, true)).toBe("normal");
    expect(flameIntensityFor(29, true)).toBe("normal");
  });
  it("is intense for 30+ days with check-in", () => {
    expect(flameIntensityFor(30, true)).toBe("intense");
    expect(flameIntensityFor(365, true)).toBe("intense");
  });
});
