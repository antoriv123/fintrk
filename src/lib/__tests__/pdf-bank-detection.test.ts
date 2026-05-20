import { describe, it, expect } from "vitest";
import { detectPDFBank, BANKS_WITHOUT_PDF_PARSER } from "../pdf-parser";

/**
 * Regression tests for the bug that made a real Santander PDF extract only 1
 * garbage transaction instead of ~40 real ones.
 *
 * The fixtures here are ANONYMISED: stripped of account numbers, names, card
 * tails and actual transaction amounts. They preserve the structural patterns
 * of each bank's pdf-parse output so the detector tests are meaningful without
 * touching a real customer's statement.
 */

// ─── Santander ES (the cohelet regression case) ───

describe("detectPDFBank — Santander ES", () => {
  it("detects Santander from the cuenta line (IBAN ES00 0049…)", () => {
    const text = [
      "TitularNombre Apellido Apellido",
      "CuentaES00 0049 0000 0000 0000 0000",
      "Saldo disponible1.234,56€",
      "(a fecha 15 abr 2026)",
      "Movimientos de tu cuenta",
      "Fecha operaciónOperaciónImporteSaldo",
      "10 abr 2026",
      "F. valor: 10 abr 2026",
      "Compra Internet En Comercio, Ciudad Es, Tarj.",
      "−10,00€1.234,56€",
      "Documento a fecha: 15 abr 2026 Página 1 de 1",
    ].join("\n");
    expect(detectPDFBank(text)).toBe("santander");
    expect(BANKS_WITHOUT_PDF_PARSER.has("santander")).toBe(true);
  });

  it("detects Santander from banking footer mention", () => {
    const text = "Banco Santander SA\nNIF A39000013\nExtracto de cuenta\n…";
    expect(detectPDFBank(text)).toBe("santander");
  });

  it("detects Santander from BIC code BSCHESMM", () => {
    const text = "IBAN ES0000490000000000000000\nBIC BSCHESMM\n…";
    expect(detectPDFBank(text)).toBe("santander");
  });

  it("detects Santander solely from the IBAN bank code 0049 (no 'Santander' keyword)", () => {
    const text = "Titular Usuario\nIBAN ES55 0049 1234 5678 9012 3456\nSaldo 1.000,00€";
    expect(detectPDFBank(text)).toBe("santander");
  });
});

// ─── Detection by Spanish IBAN bank code ───

describe("detectPDFBank — Spanish IBAN bank codes", () => {
  const cases: Array<[string, string, string]> = [
    ["0049 → Santander", "ES00 0049 0000 0000 0000 0000", "santander"],
    ["0081 → Sabadell", "ES00 0081 0000 0000 0000 0000", "sabadell"],
    ["2100 → CaixaBank", "ES00 2100 0000 0000 0000 0000", "caixabank"],
    ["0128 → Bankinter", "ES00 0128 0000 0000 0000 0000", "bankinter"],
    ["2095 → KutxaBank", "ES00 2095 0000 0000 0000 0000", "kutxabank"],
    ["2085 → Ibercaja", "ES00 2085 0000 0000 0000 0000", "ibercaja"],
    ["0019 → Deutsche Bank", "ES00 0019 0000 0000 0000 0000", "deutsche-bank"],
  ];
  for (const [label, iban, expected] of cases) {
    it(label, () => {
      expect(detectPDFBank(`Extracto de cuenta\nIBAN ${iban}`)).toBe(expected);
    });
  }

  it("handles compact IBAN without spaces", () => {
    const text = "IBAN: ES5500491234567890123456";
    expect(detectPDFBank(text)).toBe("santander");
  });
});

// ─── Other unknown banks that must route to AI ───

describe("detectPDFBank — Spanish banks without dedicated parsers", () => {
  const cases: Array<[string, string, string]> = [
    ["Sabadell by BIC", "BIC BSABESBB\nExtracto mensual", "sabadell"],
    ["CaixaBank by name", "CaixaBank, S.A.\nExtracto", "caixabank"],
    ["Bankinter by BIC", "Bankinter BKBKESMM\nExtracto", "bankinter"],
    ["Openbank by name", "Openbank Santander\nExtracto", "openbank"],
    ["KutxaBank by BIC", "Kutxabank S.A. CGLAES2A\nExtracto", "kutxabank"],
    ["Unicaja by name", "UNICAJA BANCO\nExtracto", "unicaja"],
    ["Abanca by name", "ABANCA Corporación Bancaria\nExtracto", "abanca"],
    ["Ibercaja by name", "Ibercaja Banco\nExtracto", "ibercaja"],
    ["Deutsche Bank by name", "Deutsche Bank SAE\nExtracto", "deutsche-bank"],
    ["EvoBanco by name", "Evo Banco SAU\nExtracto", "evobanco"],
  ];

  for (const [label, text, expected] of cases) {
    it(`detects ${label} and flags as without-parser`, () => {
      expect(detectPDFBank(text)).toBe(expected);
      expect(BANKS_WITHOUT_PDF_PARSER.has(expected as never)).toBe(true);
    });
  }
});

// ─── Banks with dedicated parsers — must NOT be routed to AI ───

describe("detectPDFBank — banks with dedicated parsers stay native", () => {
  it("BBVA is detected and NOT in the without-parser set", () => {
    const text = "BBVA SA\nBBVAESMM\nExtracto mensual de cuenta personal";
    expect(detectPDFBank(text)).toBe("bbva");
    expect(BANKS_WITHOUT_PDF_PARSER.has("bbva")).toBe(false);
  });

  it("ING is detected and NOT in the without-parser set", () => {
    const text = "ING Bank\nCertificado de movimientos\nINGDESMM";
    expect(detectPDFBank(text)).toBe("ing");
    expect(BANKS_WITHOUT_PDF_PARSER.has("ing")).toBe(false);
  });

  it("Revolut is detected and NOT in the without-parser set", () => {
    const text = "Revolut\nStarted Date\nAmount\nState";
    expect(detectPDFBank(text)).toBe("revolut");
    expect(BANKS_WITHOUT_PDF_PARSER.has("revolut")).toBe(false);
  });

  it("Bunq is detected and NOT in the without-parser set", () => {
    const text = "bunq B.V.\nIBAN NL00BUNQ0000000000";
    expect(detectPDFBank(text)).toBe("bunq");
    expect(BANKS_WITHOUT_PDF_PARSER.has("bunq")).toBe(false);
  });
});

// ─── Completely unknown → unknown (falls to generic parser, which is weak) ───

describe("detectPDFBank — unknown bank", () => {
  it("returns 'unknown' for a generic bank statement", () => {
    const text = "Generic Bank\nAccount statement\nSome random text";
    expect(detectPDFBank(text)).toBe("unknown");
    // 'unknown' is not in the without-parser set (it falls through to the
    // generic regex parser, which marks its own output weakDetection=true).
    expect(BANKS_WITHOUT_PDF_PARSER.has("unknown")).toBe(false);
  });

  it("returns 'unknown' for completely empty text", () => {
    expect(detectPDFBank("")).toBe("unknown");
  });
});
