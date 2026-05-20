import { describe, it, expect } from "vitest";
import { parseSmartGeneric } from "../csv-parser";
import { parseBankPDF } from "../pdf-parser";

// ─── Generic CSV path marks weakDetection ───

describe("parseSmartGeneric weakDetection", () => {
  it("marks output as weakDetection when auto-detecting columns", () => {
    const csv = [
      "Fecha,Descripcion,Importe,Moneda",
      "2026-03-15,Cafe,-3.50,EUR",
    ].join("\n");
    const result = parseSmartGeneric(csv);
    expect(result.weakDetection).toBe(true);
  });
});

// ─── PDF dispatcher routes unknown Spanish banks to AI ───
// We can't run the full parseBankPDF without a real PDF buffer, but we can
// verify the exported behaviour: when loadPDF fails with a corrupted buffer,
// we get a graceful error result (not a crash), and when given an empty
// buffer, the error path is triggered without leaking exceptions.

describe("parseBankPDF error handling", () => {
  it("returns a structured error for invalid PDF input rather than throwing", async () => {
    // Buffer that isn't a PDF — pdf-parse should reject it. parseBankPDF must
    // wrap this into a {transactions: [], format: 'pdf-error', errors: [...]}
    // so the API layer can decide what to do.
    const notAPdf = Buffer.from("definitely not a pdf");
    const result = await parseBankPDF(notAPdf);
    expect(result.transactions).toEqual([]);
    expect(result.format).toBe("pdf-error");
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
