import { describe, it, expect } from "vitest";
import {
  detectFormat,
  isRevolutInternal,
  parseCSV,
  parseRevolut,
  parseING,
  parseN26,
  parseMyInvestor,
  parseBBVA,
  parseSantander,
  parseCaixaBank,
  parseSmartGeneric,
  parseBunq,
  parseAbnAmro,
  parseRabobank,
  parseWise,
} from "../csv-parser";

// ─── detectFormat ───

describe("detectFormat", () => {
  it("detects Revolut English headers", () => {
    const csv = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance\n";
    expect(detectFormat(csv)).toBe("revolut");
  });

  it("detects Revolut Spanish headers", () => {
    const csv = "Tipo,Producto,Fecha de inicio,Fecha de finalización,Descripción,Importe,Comisión,Moneda,Estado,Saldo\n";
    expect(detectFormat(csv)).toBe("revolut");
  });

  it("detects N26 headers", () => {
    const csv = '"Date","Payee","Account number","Transaction type","Payment reference","Amount (EUR)","Amount (Foreign Currency)","Type Foreign Currency","Exchange Rate"\n';
    expect(detectFormat(csv)).toBe("n26");
  });

  it("detects ING NL headers", () => {
    const csv = '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"\n';
    expect(detectFormat(csv)).toBe("ing");
  });

  it("detects MyInvestor headers", () => {
    const csv = "Fecha de operación;Fecha de valor;Concepto;Importe;Divisa\n";
    expect(detectFormat(csv)).toBe("myinvestor");
  });

  it("detects BBVA headers", () => {
    const csv = "Fecha,F.Valor,Concepto,Movimiento,Importe,Divisa,Disponible\n";
    expect(detectFormat(csv)).toBe("bbva");
  });

  it("detects Santander headers", () => {
    const csv = "Fecha,Concepto,Fecha valor,Importe,Saldo\n";
    expect(detectFormat(csv)).toBe("santander");
  });

  it("detects CaixaBank headers", () => {
    const csv = "Data,Concepte,Import,Saldo\n";
    expect(detectFormat(csv)).toBe("caixabank");
  });

  it("detects Wise headers", () => {
    const csv = "TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance\n";
    expect(detectFormat(csv)).toBe("wise");
  });

  it("detects Bunq headers", () => {
    const csv = "Date,Interest Date,Amount,Account,Counterparty,Name,Description\n";
    expect(detectFormat(csv)).toBe("bunq");
  });

  it("detects ABN AMRO headers", () => {
    const csv = "Rekeningnummer,Muntsoort,Transactiedatum,Rentedatum,Beginsaldo,Eindsaldo,Bedrag,Omschrijving\n";
    expect(detectFormat(csv)).toBe("abn_amro");
  });

  it("detects Rabobank headers (Volgnr keyword)", () => {
    // Rabobank detection relies on "volgnr" being present
    const csv = "IBAN,Muntsoort,BIC,Volgnr,Datum,Bedrag,Saldo na trn\n";
    expect(detectFormat(csv)).toBe("rabobank");
  });

  it("returns generic for unknown format", () => {
    const csv = "Column A,Column B,Column C\nval1,val2,val3\n";
    expect(detectFormat(csv)).toBe("generic");
  });
});

// ─── isRevolutInternal ───

describe("isRevolutInternal", () => {
  it("detects savings vault topup", () => {
    expect(isRevolutInternal("Savings vault topup")).toBe(true);
  });

  it("detects Spanish savings movement", () => {
    expect(isRevolutInternal("Desde EUR Ahorros")).toBe(true);
    expect(isRevolutInternal("A EUR Ahorros")).toBe(true);
  });

  it("detects interest earned", () => {
    expect(isRevolutInternal("Interest earned")).toBe(true);
  });

  it("detects pocket movements", () => {
    expect(isRevolutInternal("Al pocket vacaciones")).toBe(true);
    expect(isRevolutInternal("Retirada del pocket ahorro")).toBe(true);
  });

  it("detects currency conversion", () => {
    expect(isRevolutInternal("Conversión a USD")).toBe(true);
  });

  it("returns false for normal transactions", () => {
    expect(isRevolutInternal("Uber Eats")).toBe(false);
    expect(isRevolutInternal("Amazon.es")).toBe(false);
    expect(isRevolutInternal("Transfer to John")).toBe(false);
  });
});

// ─── parseCSV (main router) ───

describe("parseCSV", () => {
  it("routes to Revolut parser based on headers", () => {
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "CARD_PAYMENT,Current,2026-01-15 10:30:00,2026-01-15 10:30:00,Uber Eats,-12.50,0.00,EUR,COMPLETED,500.00",
    ].join("\n");
    const result = parseCSV(csv);
    expect(result.format).toBe("revolut");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe("Uber Eats");
    expect(result.transactions[0].amount).toBe(12.5);
    expect(result.transactions[0].direction).toBe("expense");
  });

  it("routes to N26 parser based on headers", () => {
    const csv = [
      '"Date","Payee","Account number","Transaction type","Payment reference","Amount (EUR)","Amount (Foreign Currency)","Type Foreign Currency","Exchange Rate"',
      '"2026-01-20","Supermarket","","MasterCard Payment","Grocery shopping","-45.99","","",""',
    ].join("\n");
    const result = parseCSV(csv);
    expect(result.format).toBe("n26");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(45.99);
    expect(result.transactions[0].direction).toBe("expense");
  });

  it("accepts explicit format override", () => {
    const csv = [
      "Started Date,Completed Date,Description,Amount,Currency,State,Balance",
      "2026-01-15,2026-01-15,Test,-10.00,EUR,COMPLETED,100.00",
    ].join("\n");
    const result = parseCSV(csv, "revolut");
    expect(result.format).toBe("revolut");
  });
});

// ─── parseRevolut ───

describe("parseRevolut", () => {
  const makeCSV = (rows: string[]) =>
    [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      ...rows,
    ].join("\n");

  it("parses expense (negative amount)", () => {
    const csv = makeCSV([
      "CARD_PAYMENT,Current,2026-03-10 14:00:00,2026-03-10 14:00:00,Netflix,-15.99,0.00,EUR,COMPLETED,484.01",
    ]);
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      date: "2026-03-10",
      description: "Netflix",
      amount: 15.99,
      currency: "EUR",
      direction: "expense",
      account: "revolut",
    });
  });

  it("parses income (positive amount)", () => {
    const csv = makeCSV([
      "TRANSFER,Current,2026-02-01 09:00:00,2026-02-01 09:00:00,Salary from Company,2500.00,0.00,EUR,COMPLETED,3000.00",
    ]);
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].direction).toBe("income");
    expect(result.transactions[0].amount).toBe(2500);
  });

  it("skips non-COMPLETED transactions", () => {
    const csv = makeCSV([
      "CARD_PAYMENT,Current,2026-03-10 14:00:00,2026-03-10 14:00:00,Pending,-10.00,0.00,EUR,PENDING,490.00",
      "CARD_PAYMENT,Current,2026-03-11 14:00:00,2026-03-11 14:00:00,Done,-5.00,0.00,EUR,COMPLETED,485.00",
    ]);
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe("Done");
  });

  it("marks internal movements as is_internal", () => {
    const csv = makeCSV([
      "TRANSFER,Current,2026-03-10 14:00:00,2026-03-10 14:00:00,Savings vault topup,-100.00,0.00,EUR,COMPLETED,400.00",
    ]);
    const result = parseRevolut(csv);
    expect(result.transactions[0].is_internal).toBe(true);
  });

  it("maps savings product to revolut-ahorros account", () => {
    const csv = makeCSV([
      "TRANSFER,Savings,2026-03-10 14:00:00,2026-03-10 14:00:00,Interest earned,0.50,0.00,EUR,COMPLETED,100.50",
    ]);
    const result = parseRevolut(csv);
    // "Savings" maps to "revolut-ahorros" (lowercased to "savings")
    // Actually the product mapping uses lowercase, let me check
    expect(result.transactions[0].account).toBe("revolut-ahorros");
  });

  it("tracks final balances per account", () => {
    const csv = makeCSV([
      "CARD_PAYMENT,Current,2026-03-10 14:00:00,2026-03-10 14:00:00,Coffee,-3.50,0.00,EUR,COMPLETED,496.50",
      "CARD_PAYMENT,Current,2026-03-11 14:00:00,2026-03-11 14:00:00,Lunch,-12.00,0.00,EUR,COMPLETED,484.50",
    ]);
    const result = parseRevolut(csv);
    expect(result.finalBalances).toBeDefined();
    expect(result.finalBalances!["revolut"]).toBe(484.5);
  });

  it("handles empty file", () => {
    const csv = "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance";
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(0);
  });

  it("parses Spanish headers", () => {
    const csv = [
      "Tipo,Producto,Fecha de inicio,Fecha de finalización,Descripción,Importe,Comisión,Moneda,Estado,Saldo",
      "CARD_PAYMENT,Actual,2026-03-10 14:00:00,2026-03-10 14:00:00,Carrefour,-22.50,0.00,EUR,COMPLETED,477.50",
    ].join("\n");
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe("Carrefour");
    expect(result.transactions[0].amount).toBe(22.5);
  });

  it("handles European comma-decimal amounts (-12,50)", () => {
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      'CARD_PAYMENT,Current,2026-03-10 14:00:00,2026-03-10 14:00:00,Uber Eats,"-12,50","0,00",EUR,COMPLETED,"487,50"',
    ].join("\n");
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(12.5);
    expect(result.transactions[0].direction).toBe("expense");
  });

  it("handles amounts with thousands separator (1.234,56)", () => {
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      'TRANSFER,Current,2026-03-01 09:00:00,2026-03-01 09:00:00,Salary,"2.500,00","0,00",EUR,COMPLETED,"3.000,00"',
    ].join("\n");
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(2500);
    expect(result.transactions[0].direction).toBe("income");
    expect(result.finalBalances!["revolut"]).toBe(3000);
  });

  it("handles date format DD/MM/YYYY from Revolut ES", () => {
    const csv = [
      "Tipo,Producto,Fecha de inicio,Fecha de finalización,Descripción,Importe,Comisión,Moneda,Estado,Saldo",
      "CARD_PAYMENT,Actual,10/03/2026,10/03/2026,Mercadona,-45.20,0.00,EUR,COMPLETADO,454.80",
    ].join("\n");
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].date).toBe("2026-03-10");
    expect(result.transactions[0].amount).toBe(45.2);
  });

  it("skips REVERTED and DECLINED transactions", () => {
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "CARD_PAYMENT,Current,2026-03-10 14:00:00,,Failed Payment,-10.00,0.00,EUR,DECLINED,500.00",
      "CARD_PAYMENT,Current,2026-03-10 15:00:00,,Reverted,-5.00,0.00,EUR,REVERTED,500.00",
      "CARD_PAYMENT,Current,2026-03-11 14:00:00,2026-03-11 14:00:00,Valid,-8.00,0.00,EUR,COMPLETED,492.00",
    ].join("\n");
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe("Valid");
  });

  it("handles semicolon-separated Revolut CSV (European locale)", () => {
    const csv = [
      "Tipo;Producto;Fecha de inicio;Fecha de finalización;Descripción;Importe;Comisión;Moneda;Estado;Saldo",
      'CARD_PAYMENT;Actual;2026-03-10 14:00:00;2026-03-10 14:00:00;Mercadona;"-22,50";"0,00";EUR;COMPLETADO;"477,50"',
    ].join("\n");
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe("Mercadona");
    expect(result.transactions[0].amount).toBe(22.5);
    expect(result.transactions[0].direction).toBe("expense");
    expect(result.transactions[0].account).toBe("revolut");
  });

  it("handles multiple products in same file", () => {
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "CARD_PAYMENT,Current,2026-03-10 14:00:00,2026-03-10 14:00:00,Coffee,-3.50,0.00,EUR,COMPLETED,496.50",
      "TRANSFER,Savings,2026-03-10 15:00:00,2026-03-10 15:00:00,Interest earned,0.50,0.00,EUR,COMPLETED,100.50",
      "TRANSFER,Pockets,2026-03-10 16:00:00,2026-03-10 16:00:00,Al pocket vacaciones,-50.00,0.00,EUR,COMPLETED,50.00",
    ].join("\n");
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0].account).toBe("revolut");
    expect(result.transactions[1].account).toBe("revolut-ahorros");
    expect(result.transactions[2].account).toBe("revolut-pockets");
    expect(result.finalBalances!["revolut"]).toBe(496.5);
    expect(result.finalBalances!["revolut-ahorros"]).toBe(100.5);
    expect(result.finalBalances!["revolut-pockets"]).toBe(50);
  });
});

// ─── parseING ───

describe("parseING", () => {
  it("parses ING NL with Af/Bij direction", () => {
    const csv = [
      '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"',
      '"20260315";"Albert Heijn";"NL12INGB0001234567";"NL98ABNA0001234567";"GT";"Af";"25,50";"Betaalautomaat";"Boodschappen"',
    ].join("\n");
    const result = parseING(csv);
    expect(result.format).toBe("ing");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      date: "2026-03-15",
      description: "Albert Heijn",
      amount: 25.5,
      direction: "expense",
      account: "ing",
    });
  });

  it("parses Bij as income", () => {
    const csv = [
      '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen"',
      '"20260301";"Werkgever BV";"NL12INGB0001234567";"NL98ABNA0009876543";"OV";"Bij";"1.850,00";"Overboeking";"Salaris maart"',
    ].join("\n");
    const result = parseING(csv);
    expect(result.transactions[0].direction).toBe("income");
    expect(result.transactions[0].amount).toBe(1850);
  });

  it("handles YYYYMMDD date format", () => {
    const csv = [
      '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)"',
      '"20260101";"Test";"NL12";"NL34";"GT";"Af";"10,00"',
    ].join("\n");
    const result = parseING(csv);
    expect(result.transactions[0].date).toBe("2026-01-01");
  });
});

// ─── parseN26 ───

describe("parseN26", () => {
  it("parses N26 with Amount (EUR) column", () => {
    const csv = [
      '"Date","Payee","Account number","Transaction type","Payment reference","Amount (EUR)","Amount (Foreign Currency)","Type Foreign Currency","Exchange Rate"',
      '"2026-03-20","Lidl","","MasterCard Payment","","-32.15","","",""',
    ].join("\n");
    const result = parseN26(csv);
    expect(result.format).toBe("n26");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      date: "2026-03-20",
      description: "Lidl",
      amount: 32.15,
      direction: "expense",
      account: "n26",
    });
  });

  it("parses income as positive amount", () => {
    const csv = [
      '"Date","Payee","Account number","Transaction type","Payment reference","Amount (EUR)"',
      '"2026-03-01","Freelance Client","","Income","Invoice 123","750.00"',
    ].join("\n");
    const result = parseN26(csv);
    expect(result.transactions[0].direction).toBe("income");
    expect(result.transactions[0].amount).toBe(750);
  });
});

// ─── parseMyInvestor ───

describe("parseMyInvestor", () => {
  it("parses semicolon-separated MyInvestor format", () => {
    const csv = [
      "Fecha de operación;Fecha de valor;Concepto;Importe;Divisa",
      "15/03/2026;17/03/2026;Compra ETF Nasdaq;-500,00;EUR",
    ].join("\n");
    const result = parseMyInvestor(csv);
    expect(result.format).toBe("myinvestor");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      date: "2026-03-15",
      description: "Compra ETF Nasdaq",
      amount: 500,
      direction: "expense",
      currency: "EUR",
      account: "myinvestor",
    });
  });

  it("parses European comma-decimal amounts", () => {
    const csv = [
      "Fecha de operación;Fecha de valor;Concepto;Importe;Divisa",
      "01/02/2026;01/02/2026;Dividendo;12,75;EUR",
    ].join("\n");
    const result = parseMyInvestor(csv);
    expect(result.transactions[0].amount).toBe(12.75);
    expect(result.transactions[0].direction).toBe("income");
  });

  it("handles European thousands format 1.234,56", () => {
    const csv = [
      "Fecha de operación;Fecha de valor;Concepto;Importe;Divisa",
      "10/01/2026;10/01/2026;Transferencia;1.234,56;EUR",
    ].join("\n");
    const result = parseMyInvestor(csv);
    expect(result.transactions[0].amount).toBe(1234.56);
  });

  it("skips zero-amount rows", () => {
    const csv = [
      "Fecha de operación;Fecha de valor;Concepto;Importe;Divisa",
      "10/01/2026;10/01/2026;Nothing;0,00;EUR",
      "11/01/2026;11/01/2026;Something;-5,00;EUR",
    ].join("\n");
    const result = parseMyInvestor(csv);
    expect(result.transactions).toHaveLength(1);
  });
});

// ─── parseBBVA ───

describe("parseBBVA", () => {
  it("parses BBVA format with movimiento and concepto", () => {
    const csv = [
      "Fecha,F.Valor,Concepto,Movimiento,Importe,Divisa,Disponible",
      "10/03/2026,10/03/2026,Compra,Supermercado DIA,-15.30,EUR,2500.00",
    ].join("\n");
    const result = parseBBVA(csv);
    expect(result.format).toBe("bbva");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(15.3);
    expect(result.transactions[0].direction).toBe("expense");
    expect(result.transactions[0].account).toBe("bbva");
  });

  it("tracks final balance from Disponible column", () => {
    const csv = [
      "Fecha,F.Valor,Concepto,Movimiento,Importe,Divisa,Disponible",
      "10/03/2026,10/03/2026,Compra,Supermercado,-10.00,EUR,2490.00",
      "11/03/2026,11/03/2026,Nomina,Ingreso salario,1500.00,EUR,3990.00",
    ].join("\n");
    const result = parseBBVA(csv);
    expect(result.finalBalances).toEqual({ bbva: 3990 });
  });
});

// ─── parseSantander ───

describe("parseSantander", () => {
  it("parses Santander format", () => {
    const csv = [
      "Fecha,Concepto,Fecha valor,Importe,Saldo",
      "15/03/2026,Recibo Telefonica,15/03/2026,-45.00,1955.00",
    ].join("\n");
    const result = parseSantander(csv);
    expect(result.format).toBe("santander");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      description: "Recibo Telefonica",
      amount: 45,
      direction: "expense",
      account: "santander",
    });
  });
});

// ─── parseCaixaBank ───

describe("parseCaixaBank", () => {
  it("parses Catalan headers", () => {
    const csv = [
      "Data,Concepte,Import,Saldo",
      "20/03/2026,Compra supermercat,-35.50,1464.50",
    ].join("\n");
    const result = parseCaixaBank(csv);
    expect(result.format).toBe("caixabank");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe("Compra supermercat");
    expect(result.transactions[0].account).toBe("caixabank");
  });
});

// ─── parseBunq ───

describe("parseBunq", () => {
  it("parses Bunq format", () => {
    const csv = [
      "Date,Interest Date,Amount,Account,Counterparty,Name,Description",
      "2026-03-15,2026-03-15,-8.50,NL12BUNQ123,NL34ABNA456,Coffee Shop,Morning coffee",
    ].join("\n");
    const result = parseBunq(csv);
    expect(result.format).toBe("bunq");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].direction).toBe("expense");
    expect(result.transactions[0].account).toBe("bunq");
  });
});

// ─── parseAbnAmro ───

describe("parseAbnAmro", () => {
  it("parses ABN AMRO format", () => {
    const csv = [
      "Rekeningnummer,Muntsoort,Transactiedatum,Rentedatum,Beginsaldo,Eindsaldo,Bedrag,Omschrijving",
      "NL12ABNA0001234567,EUR,20260320,20260320,1000.00,975.00,-25.00,Betaling aan winkel",
    ].join("\n");
    const result = parseAbnAmro(csv);
    expect(result.format).toBe("abn_amro");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(25);
    expect(result.transactions[0].direction).toBe("expense");
  });
});

// ─── parseRabobank ───

describe("parseRabobank", () => {
  it("parses Rabobank format", () => {
    const csv = [
      '"IBAN","Muntsoort","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN","Naam tegenpartij","Omschrijving"',
      '"NL12RABO0001234567","EUR","RABONL2U","001","2026-03-18","2026-03-18","-42.00","958.00","NL34INGB0009876543","Restaurant","Diner"',
    ].join("\n");
    const result = parseRabobank(csv);
    expect(result.format).toBe("rabobank");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(42);
    expect(result.transactions[0].account).toBe("rabobank");
  });
});

// ─── parseWise ───

describe("parseWise", () => {
  it("parses Wise format", () => {
    const csv = [
      "TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance,Exchange From",
      "123456,2026-03-10,-50.00,EUR,Transfer to Spain,REF001,450.00,",
    ].join("\n");
    const result = parseWise(csv);
    expect(result.format).toBe("wise");
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(50);
    expect(result.transactions[0].direction).toBe("expense");
    expect(result.transactions[0].account).toBe("wise");
  });
});

// ─── parseSmartGeneric ───

describe("parseSmartGeneric", () => {
  it("auto-detects columns from common headers", () => {
    const csv = [
      "Date,Description,Amount,Currency",
      "2026-03-15,Grocery store,-45.00,EUR",
      "2026-03-16,Salary,2500.00,EUR",
    ].join("\n");
    const result = parseSmartGeneric(csv);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].direction).toBe("expense");
    expect(result.transactions[1].direction).toBe("income");
  });

  it("handles empty file", () => {
    const csv = "Date,Description,Amount";
    const result = parseSmartGeneric(csv);
    expect(result.transactions).toHaveLength(0);
  });

  it("handles Spanish headers with signed amounts", () => {
    const csv = [
      "Fecha,Descripcion,Importe,Moneda",
      "2026-03-15,Cafe,-3.50,EUR",
      "2026-03-16,Devolucion,10.00,EUR",
    ].join("\n");
    const result = parseSmartGeneric(csv);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].direction).toBe("expense");
    expect(result.transactions[0].amount).toBe(3.5);
    expect(result.transactions[1].direction).toBe("income");
    expect(result.transactions[1].amount).toBe(10);
  });
});

// ─── Date parsing edge cases ───

describe("date parsing", () => {
  it("parses DD/MM/YYYY (European)", () => {
    const csv = [
      "Fecha,Concepto,Fecha valor,Importe,Saldo",
      "25/12/2025,Christmas,-100.00,1900.00",
    ].join("\n");
    const result = parseSantander(csv);
    expect(result.transactions[0].date).toBe("2025-12-25");
  });

  it("parses YYYY-MM-DD (ISO)", () => {
    const csv = [
      "Date,Payee,Amount (EUR)",
      "2026-01-15,Test,-10.00",
    ].join("\n");
    const result = parseN26(csv);
    expect(result.transactions[0].date).toBe("2026-01-15");
  });

  it("parses YYYYMMDD (ING)", () => {
    const csv = [
      '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)"',
      '"20260228";"Test";"NL12";"NL34";"GT";"Af";"5,00"',
    ].join("\n");
    const result = parseING(csv);
    expect(result.transactions[0].date).toBe("2026-02-28");
  });

  it("rejects dates before 2000", () => {
    const csv = [
      "Date,Payee,Amount (EUR)",
      "1999-01-01,Old,-10.00",
    ].join("\n");
    const result = parseN26(csv);
    expect(result.transactions).toHaveLength(0);
  });
});

// ─── Amount parsing edge cases ───

describe("amount parsing", () => {
  it("handles European comma decimal (12,75)", () => {
    const csv = [
      "Fecha de operación;Fecha de valor;Concepto;Importe;Divisa",
      "01/03/2026;01/03/2026;Test;-12,75;EUR",
    ].join("\n");
    const result = parseMyInvestor(csv);
    expect(result.transactions[0].amount).toBe(12.75);
  });

  it("handles European thousands with comma decimal (1.234,56)", () => {
    const csv = [
      "Fecha de operación;Fecha de valor;Concepto;Importe;Divisa",
      "01/03/2026;01/03/2026;Big purchase;-1.234,56;EUR",
    ].join("\n");
    const result = parseMyInvestor(csv);
    expect(result.transactions[0].amount).toBe(1234.56);
  });

  it("handles parentheses as negative (123.45)", () => {
    // Test via smart generic which uses parseAmount
    const csv = [
      "Date,Description,Amount",
      "2026-03-15,Refund,(50.00)",
    ].join("\n");
    const result = parseSmartGeneric(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].direction).toBe("expense");
    expect(result.transactions[0].amount).toBe(50);
  });

  it("strips currency symbols from amounts", () => {
    const csv = [
      "Date,Description,Amount",
      "2026-03-15,Purchase,€-25.00",
    ].join("\n");
    const result = parseSmartGeneric(csv);
    expect(result.transactions[0].amount).toBe(25);
  });
});

// ─── Duplicate/multiple transactions ───

describe("multiple transactions", () => {
  it("parses multiple rows correctly", () => {
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "CARD_PAYMENT,Current,2026-03-10 14:00:00,2026-03-10 14:00:00,Coffee,-3.50,0.00,EUR,COMPLETED,496.50",
      "CARD_PAYMENT,Current,2026-03-11 10:00:00,2026-03-11 10:00:00,Lunch,-12.00,0.00,EUR,COMPLETED,484.50",
      "TRANSFER,Current,2026-03-12 09:00:00,2026-03-12 09:00:00,Salary,2500.00,0.00,EUR,COMPLETED,2984.50",
    ].join("\n");
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions.filter((t) => t.direction === "expense")).toHaveLength(2);
    expect(result.transactions.filter((t) => t.direction === "income")).toHaveLength(1);
  });

  it("handles quoted fields with commas in CSV", () => {
    const csv = [
      "Date,Payee,Account number,Transaction type,Payment reference,Amount (EUR)",
      '"2026-03-20","Smith, John","","Transfer","Payment for March, April","-100.00"',
    ].join("\n");
    const result = parseN26(csv);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].description).toBe("Smith, John");
  });
});

// ─── Error handling ───

describe("error handling", () => {
  it("skips rows with invalid amounts", () => {
    const csv = [
      "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
      "CARD_PAYMENT,Current,2026-03-10,2026-03-10,Test,abc,0.00,EUR,COMPLETED,500.00",
    ].join("\n");
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(0);
  });

  it("returns empty for single-line file", () => {
    const csv = "Type,Product,Started Date";
    const result = parseRevolut(csv);
    expect(result.transactions).toHaveLength(0);
  });
});
