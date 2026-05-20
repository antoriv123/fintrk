import { describe, it, expect } from "vitest";
import { parseSmartGeneric, parseSantander } from "../csv-parser";
import { parseExcel } from "../excel-parser";
import { parseQIF } from "../standard-parsers";
import * as XLSX from "xlsx";

/**
 * Cross-bank fix: some bank exports use Unicode dashes (U+2212 minus sign,
 * U+2013 en-dash, U+2014 em-dash) instead of ASCII "-" for expense amounts.
 * The old amount parsers missed the sign, marking expenses as incomes.
 *
 * Discovered while validating a real Santander PDF — it uses U+2212 for every
 * expense amount.
 */
describe("Unicode dash normalisation in amount parsing", () => {
  const MINUS = "\u2212"; // U+2212 (Santander, many Spanish/EU bank PDFs)
  const EN_DASH = "\u2013"; // U+2013
  const EM_DASH = "\u2014"; // U+2014

  it("parseSantander CSV: U+2212 expense parses as negative", () => {
    const csv = [
      "Fecha,Concepto,Fecha valor,Importe,Saldo",
      `15/03/2026,Recibo Telefonica,15/03/2026,${MINUS}45.00,1955.00`,
    ].join("\n");
    const result = parseSantander(csv);
    expect(result.transactions[0]).toMatchObject({
      amount: 45,
      direction: "expense",
    });
  });

  it("parseSmartGeneric CSV: en-dash on expense row", () => {
    const csv = [
      "Fecha,Descripcion,Importe,Moneda",
      `2026-03-15,Cafe,${EN_DASH}3.50,EUR`,
    ].join("\n");
    const result = parseSmartGeneric(csv);
    expect(result.transactions[0].direction).toBe("expense");
    expect(result.transactions[0].amount).toBe(3.5);
  });

  it("parseSmartGeneric CSV: em-dash on expense row", () => {
    const csv = [
      "Fecha,Descripcion,Importe,Moneda",
      `2026-03-15,Cafe,${EM_DASH}10.00,EUR`,
    ].join("\n");
    const result = parseSmartGeneric(csv);
    expect(result.transactions[0].direction).toBe("expense");
  });

  it("parseExcel: U+2212 amount parses as negative", () => {
    // Build a minimal Excel file in memory
    const data = [
      ["Fecha", "Descripcion", "Importe"],
      ["2026-03-15", "Cafe", `${MINUS}3.50`],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;

    const result = parseExcel(buffer);
    expect(result.transactions[0]).toMatchObject({
      direction: "expense",
      amount: 3.5,
    });
  });

  it("parseQIF: U+2212 amount parses as negative", () => {
    const qif = `!Type:Bank
D15/03/2026
T${MINUS}45.50
PSupermercado
^
`;
    const result = parseQIF(qif);
    expect(result.transactions[0]).toMatchObject({
      direction: "expense",
      amount: 45.5,
    });
  });
});
