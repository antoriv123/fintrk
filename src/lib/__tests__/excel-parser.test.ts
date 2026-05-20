import { describe, it, expect } from "vitest";
import { _testing } from "../excel-parser";

const {
  stripAccents,
  normalizeHeader,
  findColIndex,
  detectBank,
  headerMatches,
  parseAmountValue,
  parseDateValue,
  isValidDate,
} = _testing;

// ─── stripAccents ───

describe("stripAccents", () => {
  it("removes accent from a", () => {
    expect(stripAccents("á")).toBe("a");
    expect(stripAccents("à")).toBe("a");
    expect(stripAccents("â")).toBe("a");
    expect(stripAccents("ä")).toBe("a");
  });

  it("removes accent from e", () => {
    expect(stripAccents("é")).toBe("e");
    expect(stripAccents("è")).toBe("e");
    expect(stripAccents("ê")).toBe("e");
  });

  it("removes accent from i, o, u", () => {
    expect(stripAccents("í")).toBe("i");
    expect(stripAccents("ó")).toBe("o");
    expect(stripAccents("ú")).toBe("u");
    expect(stripAccents("ü")).toBe("u");
  });

  it("removes tilde from n", () => {
    expect(stripAccents("ñ")).toBe("n");
    expect(stripAccents("Ñ")).toBe("N");
  });

  it("preserves non-accented characters", () => {
    expect(stripAccents("hello world")).toBe("hello world");
    expect(stripAccents("123")).toBe("123");
  });

  it("handles full Spanish words", () => {
    expect(stripAccents("descripción")).toBe("descripcion");
    expect(stripAccents("operación")).toBe("operacion");
    expect(stripAccents("categoría")).toBe("categoria");
  });

  it("handles mixed strings", () => {
    expect(stripAccents("Fecha de operación")).toBe("Fecha de operacion");
    expect(stripAccents("año 2026")).toBe("ano 2026");
  });

  it("handles empty string", () => {
    expect(stripAccents("")).toBe("");
  });
});

// ─── normalizeHeader ───

describe("normalizeHeader", () => {
  it("lowercases and trims", () => {
    expect(normalizeHeader("  FECHA  ")).toBe("fecha");
    expect(normalizeHeader("Amount")).toBe("amount");
  });

  it("handles null/undefined", () => {
    expect(normalizeHeader(null)).toBe("");
    expect(normalizeHeader(undefined)).toBe("");
  });

  it("collapses whitespace", () => {
    expect(normalizeHeader("Naam /  Omschrijving")).toBe("naam / omschrijving");
  });

  it("replaces newlines with spaces", () => {
    expect(normalizeHeader("Column\nName")).toBe("column name");
    expect(normalizeHeader("Multi\r\nLine")).toBe("multi line");
  });

  it("replaces non-breaking spaces", () => {
    expect(normalizeHeader("fecha\u00a0valor")).toBe("fecha valor");
  });

  it("normalizes smart quotes", () => {
    expect(normalizeHeader("\u2018test\u2019")).toBe("'test'");
    expect(normalizeHeader("\u201ctest\u201d")).toBe('"test"');
  });

  it("normalizes dashes", () => {
    expect(normalizeHeader("en\u2013dash")).toBe("en-dash");
    expect(normalizeHeader("em\u2014dash")).toBe("em-dash");
  });

  it("normalizes euro sign", () => {
    expect(normalizeHeader("importe (\u20ac)")).toBe("importe (€)");
  });

  it("handles numbers", () => {
    expect(normalizeHeader(42)).toBe("42");
  });
});

// ─── headerMatches ───

describe("headerMatches", () => {
  it("matches exact", () => {
    expect(headerMatches("fecha", "fecha")).toBe(true);
  });

  it("matches includes", () => {
    expect(headerMatches("fecha de valor", "fecha")).toBe(true);
  });

  it("matches with accent stripping", () => {
    expect(headerMatches("descripción", "descripcion")).toBe(true);
    expect(headerMatches("descripcion", "descripción")).toBe(true);
  });

  it("returns false for no match", () => {
    expect(headerMatches("amount", "fecha")).toBe(false);
  });
});

// ─── findColIndex ───

describe("findColIndex", () => {
  const headers = ["fecha", "concepto", "importe", "divisa"];

  it("finds exact match", () => {
    expect(findColIndex(headers, ["importe"])).toBe(2);
  });

  it("finds first candidate that matches", () => {
    expect(findColIndex(headers, ["amount", "importe"])).toBe(2);
  });

  it("returns -1 when no match", () => {
    expect(findColIndex(headers, ["balance", "saldo"])).toBe(-1);
  });

  it("finds partial match", () => {
    const hdrs = ["fecha de operacion", "concepto", "importe total"];
    expect(findColIndex(hdrs, ["importe"])).toBe(2);
  });

  it("finds accent-stripped match", () => {
    const hdrs = ["fecha", "descripción", "importe"];
    expect(findColIndex(hdrs, ["descripcion"])).toBe(1);
  });

  it("prefers exact match over partial", () => {
    const hdrs = ["importe total", "importe", "importe neto"];
    expect(findColIndex(hdrs, ["importe"])).toBe(1);
  });

  it("handles empty candidates", () => {
    expect(findColIndex(headers, [])).toBe(-1);
  });

  it("handles empty headers", () => {
    expect(findColIndex([], ["fecha"])).toBe(-1);
  });
});

// ─── detectBank ───

describe("detectBank", () => {
  it("detects BBVA from headers", () => {
    const headers = ["fecha", "f.valor", "concepto", "movimiento", "importe", "divisa", "disponible"];
    const bank = detectBank(headers);
    expect(bank).not.toBeNull();
    expect(bank!.name).toBe("BBVA");
    expect(bank!.account).toBe("bbva");
  });

  it("detects Revolut from headers", () => {
    const headers = ["started date", "completed date", "description", "amount", "currency", "state", "balance"];
    const bank = detectBank(headers);
    expect(bank).not.toBeNull();
    expect(bank!.name).toBe("Revolut");
    expect(bank!.account).toBe("revolut");
  });

  it("detects Revolut ES from Spanish headers", () => {
    const headers = ["fecha de inicio", "fecha de finalización", "descripción", "importe", "moneda", "estado"];
    const bank = detectBank(headers);
    expect(bank).not.toBeNull();
    expect(bank!.account).toBe("revolut");
  });

  it("detects N26 from headers", () => {
    const headers = ["date", "payee", "account name", "transaction type", "payment reference", "amount (eur)"];
    const bank = detectBank(headers);
    expect(bank).not.toBeNull();
    expect(bank!.name).toBe("N26");
    expect(bank!.account).toBe("n26");
  });

  it("detects ING NL from Dutch headers", () => {
    const headers = ["datum", "naam / omschrijving", "rekening", "tegenrekening", "code", "af bij", "bedrag (eur)"];
    const bank = detectBank(headers);
    expect(bank).not.toBeNull();
    expect(bank!.name).toBe("ING");
    expect(bank!.account).toBe("ing");
  });

  it("detects Santander from headers", () => {
    const headers = ["fecha", "concepto", "fecha valor", "importe", "saldo"];
    const bank = detectBank(headers);
    expect(bank).not.toBeNull();
    expect(bank!.name).toBe("Santander");
  });

  it("detects CaixaBank from Catalan headers", () => {
    const headers = ["data", "concepte", "import", "saldo"];
    const bank = detectBank(headers);
    expect(bank).not.toBeNull();
    expect(bank!.name).toBe("CaixaBank");
  });

  it("detects ING ES from Spanish headers", () => {
    const headers = ["descripción", "f. valor", "categoría", "subcategoría", "importe", "saldo"];
    const bank = detectBank(headers);
    expect(bank).not.toBeNull();
    expect(bank!.name).toBe("ING ES");
  });

  it("detects Wise from headers", () => {
    const headers = ["date", "amount", "description", "merchant", "source currency", "target currency"];
    const bank = detectBank(headers);
    expect(bank).not.toBeNull();
    expect(bank!.name).toBe("Wise");
  });

  it("returns null for unrecognized headers", () => {
    const headers = ["col_a", "col_b", "col_c"];
    const bank = detectBank(headers);
    expect(bank).toBeNull();
  });
});

// ─── parseAmountValue ───

describe("parseAmountValue", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseAmountValue(null)).toBeNull();
    expect(parseAmountValue(undefined)).toBeNull();
    expect(parseAmountValue("")).toBeNull();
  });

  it("returns number directly", () => {
    expect(parseAmountValue(42.5)).toBe(42.5);
    expect(parseAmountValue(-10)).toBe(-10);
    expect(parseAmountValue(0)).toBe(0);
  });

  it("parses plain number string", () => {
    expect(parseAmountValue("100")).toBe(100);
    expect(parseAmountValue("-50.25")).toBe(-50.25);
  });

  it("parses European comma decimal", () => {
    expect(parseAmountValue("12,75")).toBe(12.75);
    expect(parseAmountValue("-12,75")).toBe(-12.75);
  });

  it("parses European thousands format", () => {
    expect(parseAmountValue("1.234,56")).toBe(1234.56);
    expect(parseAmountValue("-1.234,56")).toBe(-1234.56);
  });

  it("parses US thousands format", () => {
    expect(parseAmountValue("1,234.56")).toBe(1234.56);
  });

  it("strips currency symbols", () => {
    expect(parseAmountValue("€100")).toBe(100);
    expect(parseAmountValue("$50.00")).toBe(50);
    expect(parseAmountValue("£25")).toBe(25);
  });

  it("handles parentheses as negative", () => {
    expect(parseAmountValue("(123.45)")).toBe(-123.45);
  });

  it("handles whitespace", () => {
    expect(parseAmountValue("  42.50  ")).toBe(42.5);
  });

  it("returns null for non-numeric string", () => {
    expect(parseAmountValue("abc")).toBeNull();
  });
});

// ─── parseDateValue ───

describe("parseDateValue", () => {
  it("returns null for null/undefined/empty", () => {
    expect(parseDateValue(null)).toBeNull();
    expect(parseDateValue(undefined)).toBeNull();
    expect(parseDateValue("")).toBeNull();
  });

  it("parses Date objects", () => {
    const d = new Date(2026, 2, 15); // March 15, 2026
    expect(parseDateValue(d)).toBe("2026-03-15");
  });

  it("returns null for invalid Date objects", () => {
    expect(parseDateValue(new Date("invalid"))).toBeNull();
  });

  it("parses YYYYMMDD (ING format)", () => {
    expect(parseDateValue("20260315")).toBe("2026-03-15");
  });

  it("parses YYYY-MM-DD (ISO)", () => {
    expect(parseDateValue("2026-03-15")).toBe("2026-03-15");
    expect(parseDateValue("2026-03-15T10:00:00")).toBe("2026-03-15");
  });

  it("parses DD/MM/YYYY (European)", () => {
    expect(parseDateValue("15/03/2026")).toBe("2026-03-15");
    expect(parseDateValue("1/3/2026")).toBe("2026-03-01");
  });

  it("parses DD-MM-YYYY", () => {
    expect(parseDateValue("15-03-2026")).toBe("2026-03-15");
  });

  it("parses DD.MM.YYYY", () => {
    expect(parseDateValue("15.03.2026")).toBe("2026-03-15");
  });

  it("parses DD Mon YYYY with English months", () => {
    expect(parseDateValue("05 Jan 2026")).toBe("2026-01-05");
    expect(parseDateValue("15-Mar-2026")).toBe("2026-03-15");
  });

  it("parses DD Mon YYYY with Spanish months", () => {
    expect(parseDateValue("05 Ene 2026")).toBe("2026-01-05");
    expect(parseDateValue("10-Abr-2026")).toBe("2026-04-10");
    expect(parseDateValue("25-Dic-2026")).toBe("2026-12-25");
  });

  it("parses DD Mon YYYY with Dutch months", () => {
    expect(parseDateValue("05-Mrt-2026")).toBe("2026-03-05");
    expect(parseDateValue("10 Mei 2026")).toBe("2026-05-10");
    expect(parseDateValue("15-Okt-2026")).toBe("2026-10-15");
  });

  it("returns null for dates before 2000", () => {
    // YYYYMMDD with year < 2000 won't match since the check is parseInt(y) >= 2000
    expect(parseDateValue("19990101")).toBeNull();
  });
});

// ─── isValidDate ───

describe("isValidDate", () => {
  it("accepts valid recent dates", () => {
    expect(isValidDate("2026-03-15")).toBe(true);
    expect(isValidDate("2024-01-01")).toBe(true);
    expect(isValidDate("2000-06-30")).toBe(true);
  });

  it("rejects dates before 2000", () => {
    expect(isValidDate("1999-12-31")).toBe(false);
  });

  it("rejects malformed format", () => {
    expect(isValidDate("2026-3-15")).toBe(false);
    expect(isValidDate("2026/03/15")).toBe(false);
    expect(isValidDate("20260315")).toBe(false);
    expect(isValidDate("not-a-date")).toBe(false);
  });

  it("rejects dates far in the future", () => {
    expect(isValidDate("2099-01-01")).toBe(false);
  });
});
