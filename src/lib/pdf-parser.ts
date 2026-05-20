import type { ParsedTransaction, ParseResult } from "./csv-parser";
import { isRevolutInternal } from "./csv-parser";

// Spanish month abbreviations → month number (0-indexed)
const MONTHS: Record<string, number> = {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
  jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
};

// Parse "8 oct 2024" → "2024-10-08"
function parseSpanishDate(raw: string): string {
  const m = raw.match(/(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+(\d{4})/);
  if (!m) return "";
  const day = m[1].padStart(2, "0");
  const month = String(MONTHS[m[2]] + 1).padStart(2, "0");
  return `${m[3]}-${month}-${day}`;
}

// Parse "02-04-2026" (DD-MM-YYYY) → "2026-04-02"
function parseDDMMYYYY(raw: string): string {
  const m = raw.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Normalise Unicode dashes that bank PDFs use in place of ASCII "-".
 * U+2212 minus sign, U+2013 en-dash, U+2014 em-dash, U+2010 hyphen all get
 * replaced by ASCII "-" so downstream regex / parseFloat work correctly.
 * Santander España in particular uses U+2212 for expense amounts.
 */
function normaliseDashes(s: string): string {
  return s.replace(/[\u2212\u2013\u2014\u2010\u2011\u2012\u2015]/g, "-");
}

// Parse European amount: "1.518,00" or "-2.100,00" → number
function parseEurAmount(raw: string): number {
  const normalised = normaliseDashes(raw);
  const cleaned = normalised.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned);
}

// Match amounts like "1.518,00 €" or "-2.100,00 €" (post-normalisation of dashes).
const EUR_AMOUNT_RE = /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*€?/;

// Bank identifier returned by detectPDFBank. Values in `KNOWN_BANKS` have a
// dedicated parser below. Values in `BANKS_WITHOUT_PARSER` are recognised so we
// can route them straight to the AI fallback instead of the risky generic regex
// parser (which often picks up a single garbage row and hides the real data).
type DetectedBank =
  | "revolut"
  | "ing"
  | "bunq"
  | "bbva"
  // Recognised but no dedicated parser yet — must go via AI:
  | "santander"
  | "sabadell"
  | "caixabank"
  | "bankinter"
  | "openbank"
  | "kutxabank"
  | "unicaja"
  | "abanca"
  | "ibercaja"
  | "deutsche-bank"
  | "evobanco"
  | "imaginbank"
  | "n26"
  | "wise"
  | "myinvestor"
  | "unknown";

export const BANKS_WITHOUT_PDF_PARSER = new Set<DetectedBank>([
  "santander",
  "sabadell",
  "caixabank",
  "bankinter",
  "openbank",
  "kutxabank",
  "unicaja",
  "abanca",
  "ibercaja",
  "deutsche-bank",
  "evobanco",
  "imaginbank",
  "n26",
  "wise",
  "myinvestor",
]);

// Detect PDF bank from extracted text. Order matters: more specific matches first.
export function detectPDFBank(text: string): DetectedBank {
  const lower = text.toLowerCase();

  // ── Banks with dedicated parsers (tried first) ──
  if (lower.includes("bbva") || lower.includes("bbvaesmm") || lower.includes("extractomensualdecuentaspersonales")) {
    return "bbva";
  }
  if (lower.includes("ing bank") || lower.includes("certificado de movimientos") || lower.includes("ingdesm")) {
    return "ing";
  }
  if (lower.includes("bunq b.v.") || lower.includes("bunq2") || (lower.includes("bunq") && lower.includes("iban"))) {
    return "bunq";
  }
  if (lower.includes("revolut") || lower.includes("started date") || lower.includes("fecha de inicio")) {
    return "revolut";
  }

  // ── Specific Spanish subsidiaries checked BEFORE parent banks ──
  // Openbank (Santander group) + ImaginBank (CaixaBank group) must match
  // before their parents to avoid false attribution.
  if (lower.includes("openbank") || lower.includes("opensesmmxxx")) {
    return "openbank";
  }
  if (lower.includes("imaginbank") || lower.includes("imagin bank") || lower.includes("imagin.app")) {
    return "imaginbank";
  }

  // ── Banks recognised but without a dedicated PDF parser (route to AI) ──
  // Detection by (a) name/BIC/URL mentions, OR (b) Spanish IBAN bank code.
  // IBAN in Spain: ES<2 check>-BANKCODE(4)-BRANCH(4)-CHECK(2)-ACCOUNT(10).
  // Matching the 4-digit bank code anywhere in the text ("ES** 0049 ..." or
  // stripped "ES000049..." ) is a very strong signal.
  const ibanCode = extractSpanishIbanBankCode(text);

  if (
    ibanCode === "0049" ||
    lower.includes("banco santander") ||
    lower.includes("santander.es") ||
    lower.includes("bschesmm") ||
    /\bsantander\b/.test(lower)
  ) {
    return "santander";
  }
  if (ibanCode === "0081" || lower.includes("banco sabadell") || lower.includes("bsabesbb") || lower.includes("sabadell.es")) {
    return "sabadell";
  }
  if (ibanCode === "2100" || lower.includes("caixabank") || lower.includes("caixesbb") || lower.includes("\"la caixa\"")) {
    return "caixabank";
  }
  if (ibanCode === "0128" || lower.includes("bankinter") || lower.includes("bkbkesmm")) {
    return "bankinter";
  }
  if (ibanCode === "2095" || lower.includes("kutxabank") || lower.includes("cglaes2a")) {
    return "kutxabank";
  }
  if (ibanCode === "2103" || lower.includes("unicaja") || lower.includes("unicaesmm")) {
    return "unicaja";
  }
  if (ibanCode === "2080" || ibanCode === "0238" || lower.includes("abanca") || lower.includes("caglesmm")) {
    return "abanca";
  }
  if (ibanCode === "2085" || lower.includes("ibercaja") || lower.includes("cazresmm")) {
    return "ibercaja";
  }
  if (ibanCode === "0019" || lower.includes("deutsche bank") || lower.includes("deutesbb")) {
    return "deutsche-bank";
  }
  if (ibanCode === "0239" || lower.includes("evo banco") || lower.includes("bdepesm1")) {
    return "evobanco";
  }
  if (lower.includes("n26") || lower.includes("ntsbdeb1xxx")) {
    return "n26";
  }
  if (lower.includes("transferwise") || lower.includes("wise payments")) {
    return "wise";
  }
  if (lower.includes("myinvestor")) {
    return "myinvestor";
  }

  return "unknown";
}

/**
 * Extract the 4-digit bank code from the first Spanish IBAN-like pattern in
 * the text, if any. Tolerates spaces and compact formats.
 *   "ES55 0049 4992 5928 1645 7535" → "0049"
 *   "IBAN: ES5500494992592816457535"  → "0049"
 */
function extractSpanishIbanBankCode(text: string): string | null {
  const match = text.match(/ES\s*\d{2}\s*(\d{4})[\s\d]/i);
  return match ? match[1] : null;
}

async function loadPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const data = await pdfParse(pdfBuffer);
    if (!data?.text || data.text.trim().length === 0) {
      throw new Error("El PDF no contiene texto extraíble. Puede ser un PDF escaneado (imagen). Intenta exportar como CSV desde tu banco.");
    }
    // Normalise Unicode dashes immediately so every downstream parser (BBVA,
    // ING, Bunq, Revolut, generic) benefits. Santander uses U+2212 minus sign
    // for expense amounts; pdf-parse preserves it verbatim and the ASCII "-?"
    // in every amount regex misses it.
    return normaliseDashes(data.text);
  } catch (e) {
    if (e instanceof Error && e.message.includes("PDF no contiene")) throw e;
    console.error("[pdf-parser] loadPDF error:", e);
    throw new Error(
      `No se pudo leer el PDF: ${e instanceof Error ? e.message : "error desconocido"}. Intenta exportar como CSV desde tu banco.`
    );
  }
}

// ─── ING PDF Parser ───────────────────────────────────────

export async function parseINGPDF(pdfBuffer: Buffer): Promise<ParseResult> {
  const text = await loadPDF(pdfBuffer);
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];

  // Extract final balance
  const finalBalanceMatch = text.match(/Saldo final de periodo:\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*€/);
  const finalBalance = finalBalanceMatch ? parseEurAmount(finalBalanceMatch[1]) : undefined;

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // ING PDF structure: each transaction is 3 lines:
  // Line 1: "DD-MM-YYYYConceptoDD-MM-YYYY" (fecha operación + concepto + fecha valor)
  // Line 2: "1.722,41 €" (saldo after transaction)
  // Line 3: "1.518,00 €" or "-2.100,00 €" (importe)
  const DATE_LINE_RE = /^(\d{2}-\d{2}-\d{4})(.+?)(\d{2}-\d{2}-\d{4})$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(DATE_LINE_RE);
    if (!dateMatch) continue;

    const dateStr = parseDDMMYYYY(dateMatch[1]);
    const description = dateMatch[2].trim();

    if (!dateStr || !description) continue;

    // Next two lines: balance (skipped) and amount
    const amountLine = lines[i + 2] ?? "";

    const amountMatch = amountLine.match(EUR_AMOUNT_RE);

    if (!amountMatch) {
      errors.push(`Line ${i + 1}: no amount found after "${description}"`);
      continue;
    }

    const amount = parseEurAmount(amountMatch[1]);
    i += 2; // Skip the balance and amount lines

    if (amount === 0) continue;

    transactions.push({
      date: dateStr,
      description,
      amount: Math.abs(amount),
      currency: "EUR",
      direction: amount < 0 ? "expense" : "income",
      account: "ing",
    });
  }

  const result: ParseResult = {
    transactions,
    format: "ing-pdf",
    errors,
  };

  if (finalBalance !== undefined) {
    result.finalBalances = { ing: finalBalance };
  }

  return result;
}

// ─── Revolut PDF Parser ───────────────────────────────────

const REVOLUT_DATE_RE = /\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+\d{4}/g;
const REVOLUT_AMOUNT_RE = /(\d{1,3}(?:\.\d{3})*,\d{2})€?/g;

export async function parseRevolutPDF(pdfBuffer: Buffer): Promise<ParseResult> {
  const text = await loadPDF(pdfBuffer);
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = text.split("\n");

  let prevBalance: number | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const dateMatch = line.match(
      /^(\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+\d{4})/
    );
    if (!dateMatch) continue;

    const allDates: { match: string; index: number; end: number }[] = [];
    let dm: RegExpExecArray | null;
    const dateRe = new RegExp(REVOLUT_DATE_RE.source, "g");
    while ((dm = dateRe.exec(line)) !== null) {
      allDates.push({ match: dm[0], index: dm.index, end: dm.index + dm[0].length });
    }

    if (allDates.length === 0) continue;

    const txDate = parseSpanishDate(allDates[0].match);
    if (!txDate) continue;

    const descStart = allDates[allDates.length - 1].end;

    const amounts: { value: number; index: number }[] = [];
    const amtRe = new RegExp(REVOLUT_AMOUNT_RE.source, "g");
    let am: RegExpExecArray | null;
    while ((am = amtRe.exec(line)) !== null) {
      if (am.index >= descStart) {
        amounts.push({ value: parseEurAmount(am[1]), index: am.index });
      }
    }

    if (amounts.length < 2) continue;

    const balance = amounts[amounts.length - 1].value;
    const amount = amounts[amounts.length - 2].value;

    const firstAmtIdx = amounts[0].index;
    const description = line.slice(descStart, firstAmtIdx).trim();

    if (amount === 0) {
      prevBalance = balance;
      continue;
    }

    let direction: "income" | "expense";
    if (prevBalance !== null) {
      direction = balance > prevBalance ? "income" : "expense";
    } else {
      direction = balance >= amount ? "income" : "expense";
    }

    prevBalance = balance;

    transactions.push({
      date: txDate,
      description,
      amount,
      currency: "EUR",
      direction,
      account: "revolut",
      is_internal: isRevolutInternal(description),
    });
  }

  return { transactions, format: "revolut-pdf", errors };
}

// ─── Bunq PDF Parser ─────────────────────────────────────

export async function parseBunqPDF(pdfBuffer: Buffer): Promise<ParseResult> {
  const text = await loadPDF(pdfBuffer);
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];

  // Extract balances from header
  const balanceEndMatch = text.match(/Saldo a [\d-]+:\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*€[\s\S]*?Saldo a [\d-]+:\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*€/);

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Bunq PDF structure:
  // Transaction lines start with two dates: YYYY-MM-DDYYYY-MM-DD
  // Followed by counterparty name, then description on next line(s)
  // Amount on a separate line: "+ 50,00 €" or "- 50,00 €"
  // Some transactions have IBAN on the next line
  // Some have currency conversion info

  const DATE_PAIR_RE = /^(\d{4}-\d{2}-\d{2})(\d{4}-\d{2}-\d{2})(.*)$/;
  // Amount at start of line: "+ 50,00 €" or "- 50,00 €"
  const AMOUNT_LINE_RE = /^([+-])\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*€$/;
  // Amount at end of a line (inline): "...text- 50,00 €" or "...text+ 50,00 €"
  const AMOUNT_INLINE_RE = /([+-])\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*€\s*$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const dateMatch = line.match(DATE_PAIR_RE);

    if (!dateMatch) {
      i++;
      continue;
    }

    const txDate = dateMatch[1]; // YYYY-MM-DD (already ISO)
    let counterparty = dateMatch[3].trim();

    // Check if the amount is inline on the same line as the dates
    let amount: number | null = null;
    let direction: "income" | "expense" = "expense";
    let foreignCurrency: string | null = null;

    const inlineAmount = counterparty.match(AMOUNT_INLINE_RE);
    if (inlineAmount) {
      direction = inlineAmount[1] === "+" ? "income" : "expense";
      amount = parseEurAmount(inlineAmount[2]);
      counterparty = counterparty.slice(0, counterparty.indexOf(inlineAmount[0])).trim();
    }

    // Collect description lines until we find an amount line
    const descParts: string[] = [];
    if (counterparty) descParts.push(counterparty);
    i++;

    // If we already have the amount from inline, still collect description lines
    // but stop at the next transaction
    if (amount !== null) {
      // Just skip to next transaction, no need to find amount
    } else {
      while (i < lines.length) {
        const current = lines[i].trim();

        // Check if this is a standalone amount line
        const amountMatch = current.match(AMOUNT_LINE_RE);
        if (amountMatch) {
          direction = amountMatch[1] === "+" ? "income" : "expense";
          amount = parseEurAmount(amountMatch[2]);
          i++;
          break;
        }

        // Check if amount is inline at end of this line
        const inlineMatch = current.match(AMOUNT_INLINE_RE);
        if (inlineMatch) {
          direction = inlineMatch[1] === "+" ? "income" : "expense";
          amount = parseEurAmount(inlineMatch[2]);
          const textBefore = current.slice(0, current.indexOf(inlineMatch[0])).trim();
          if (textBefore) descParts.push(textBefore);
          i++;
          break;
        }

        // Skip page headers/footers
        if (current.includes("Resumen de movimientos") ||
            current.includes("Este resumen no otorga") ||
            current.includes("garantía de depósitos") ||
            current.match(/^\d+\/\d+$/) ||
            current === "FechaFecha de" ||
            current === "intereses" ||
            current === "ContraparteDescripciónImporte") {
          i++;
          continue;
        }

        // Check for next transaction (new date pair)
        if (current.match(DATE_PAIR_RE)) {
          break; // Don't increment - let outer loop handle it
        }

        // Check for currency conversion info
        const fxMatch = current.match(/(\d+[.,]\d+)\s+([A-Z]{3}),\s*1\s+[A-Z]{3}\s*=\s*[\d.,]+\s*[A-Z]{3}/);
        if (fxMatch) {
          foreignCurrency = fxMatch[2];
        }

        // Skip IBAN lines
        if (current.match(/^[A-Z]{2}\d{2}[A-Z0-9]{4}\d+$/)) {
          i++;
          continue;
        }

        // Skip transaction ID lines
        if (current.startsWith("Transaction ID:") || current.match(/^[a-f0-9]{32}/)) {
          i++;
          continue;
        }

        // This is part of the description
        descParts.push(current);
        i++;
      }
    }

    if (amount === null || amount === 0) continue;

    // Build description from collected parts
    let description = descParts.join(" ").trim();

    // Clean up duplicated counterparty names (Bunq often doubles them)
    // e.g., "ANTHROPICANTHROPIC SAN FRANCISCO, US" → "ANTHROPIC SAN FRANCISCO, US"
    if (description.length > 6) {
      const half = Math.floor(description.length / 2);
      for (let len = Math.min(half, 30); len >= 3; len--) {
        const prefix = description.slice(0, len);
        if (description.slice(len, len + prefix.length) === prefix) {
          description = description.slice(len);
          break;
        }
      }
    }

    if (!description) description = "Bunq transaction";

    transactions.push({
      date: txDate,
      description,
      amount,
      currency: foreignCurrency ?? "EUR",
      direction,
      account: "bunq",
    });
  }

  const result: ParseResult = {
    transactions,
    format: "bunq-pdf",
    errors,
  };

  // Extract final balance if available
  if (balanceEndMatch) {
    result.finalBalances = { bunq: parseEurAmount(balanceEndMatch[2]) };
  }

  return result;
}

// ─── BBVA PDF Parser ─────────────────────────────────────

// BBVA PDFs have words joined without spaces (pdf-parse quirk).
// Re-insert spaces into common BBVA concepts for readability.
function fixBBVASpaces(raw: string): string {
  return raw
    // Main transaction types
    .replace(/PAGOCONTARJETAEN/g, "PAGO CON TARJETA EN ")
    .replace(/CARGOPORCOMPRACONTARJETAEN/g, "CARGO POR COMPRA CON TARJETA EN ")
    .replace(/COMPRAENCOMERCIOEXTRANJERO/g, "COMPRA EN COMERCIO EXTRANJERO")
    .replace(/COMISIÓN(\d+)%INCLUÍDA/g, "COMISIÓN $1% INCLUÍDA")
    .replace(/ABONOBONIFICACIÓN/g, "ABONO BONIFICACIÓN ")
    .replace(/BONIFICACION/g, "BONIFICACIÓN ")
    .replace(/TRANSFERENCIAS/g, "TRANSFERENCIAS")
    .replace(/SUPERMERCADOS/g, "SUPERMERCADOS")
    .replace(/RESTAURANTESYCAFETERIAS/g, "RESTAURANTES Y CAFETERIAS")
    .replace(/TRANSPORTEYALQUILERDEVEHICULOS/g, "TRANSPORTE Y ALQUILER DE VEHICULOS")
    .replace(/COMERCIOS/g, "COMERCIOS")
    .replace(/PACKVIAJES/g, "PACK VIAJES")
    // Detail lines
    .replace(/RECIBIDO:/g, "RECIBIDO: ")
    .replace(/ENVIADO:/g, "ENVIADO: ")
    .replace(/Sinconcepto/g, "Sin concepto")
    .replace(/Bizumde/g, "Bizum de ")
    .replace(/agradecidos/g, "agradecidos ")
    // Clean up double spaces
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Extract year from BBVA header like "EXTRACTODEMARZO2026" or "EXTRACTO DE MARZO 2026"
function extractBBVAYear(text: string): number {
  // Try "EXTRACTODE<MES><AÑO>" (joined)
  const joinedMatch = text.match(/EXTRACTODE(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)(\d{4})/i);
  if (joinedMatch) return parseInt(joinedMatch[1]);

  // Try "EXTRACTO DE <MES> <AÑO>" (with spaces)
  const spacedMatch = text.match(/EXTRACTO\s+DE\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(\d{4})/i);
  if (spacedMatch) return parseInt(spacedMatch[1]);

  // Try "Fecha de emisión: DD/MM/YYYY"
  const dateMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dateMatch) return parseInt(dateMatch[3]);

  return new Date().getFullYear();
}

export async function parseBBVAPDF(pdfBuffer: Buffer): Promise<ParseResult> {
  const text = await loadPDF(pdfBuffer);
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];

  const year = extractBBVAYear(text);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // BBVA PDF structure from pdf-parse (words often joined without spaces):
  // Transaction = date line + concept lines + amount line
  //
  // Date line patterns:
  //   "02/0302/03TRANSFERENCIAS"  → dates + concept on same line
  //   "10/0304/03"                → dates only, concept on next line
  //
  // Amount lines: importe + saldo joined, e.g.:
  //   "-15,009,98"   → importe=-15.00, saldo=9.98
  //   "400,00409,98"  → importe=400.00, saldo=409.98
  //   "-5,00570,87"   → importe=-5.00, saldo=570.87
  //
  // Detail lines between concept and amount:
  //   "4188202128727250Lourens"     → card number + merchant
  //   "RECIBIDO:pozza"              → Bizum detail
  //   "Alimentacion"                → transfer concept

  const BBVA_DATE_RE = /^(\d{2}\/\d{2})(\d{2}\/\d{2})(.*)$/;
  // Amount+balance pattern: one or two European amounts joined
  // e.g., "-15,009,98" or "400,00409,98" or "-1.518,0024,98"
  const AMOUNTS_LINE_RE = /^(-?\d{1,3}(?:\.\d{3})*,\d{2})(\d{1,3}(?:\.\d{3})*,\d{2})$/;

  // Helper: check if a line is a header/footer to skip
  const isSkipLine = (l: string) =>
    l.includes("SALDOANTERIOR") || l.includes("SALDO ANTERIOR") ||
    l.includes("EXTRACTO") || l.includes("HOJA") ||
    l.includes("Todoslosimportes") || l.includes("F.Oper") ||
    l.includes("Titulares") || l.includes("IBAN") ||
    l.includes("BIC:") || l.includes("EURO") ||
    l.includes("SALDOASUFAVOR") || l.includes("SALDOANUESTROFAVOR") ||
    /^R\d{5,}/.test(l) || /^F\d{5}/.test(l) ||
    /^Producto/.test(l) || /^Fecha/.test(l);

  // First pass: find all transaction blocks
  // A block starts with a date line and ends when the next date line or an amounts line appears
  interface TxBlock {
    operDate: string;
    conceptParts: string[];
    detailParts: string[];
    importe: number;
    saldo: number;
  }

  const blocks: TxBlock[] = [];
  let currentBlock: { operDate: string; textLines: string[] } | null = null;
  const SINGLE_AMOUNT_RE = /^(-?\d{1,3}(?:\.\d{3})*,\d{2})$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (isSkipLine(line)) { i++; continue; }

    // Check if this is a date line
    const dateMatch = line.match(BBVA_DATE_RE);
    if (dateMatch) {
      currentBlock = {
        operDate: dateMatch[1],
        textLines: [],
      };
      const afterDates = dateMatch[3].trim();
      if (afterDates) currentBlock.textLines.push(afterDates);
      i++;
      continue;
    }

    // Check if this is an amount+balance line joined (e.g., "-15,009,98")
    const amountsMatch = line.match(AMOUNTS_LINE_RE);
    if (amountsMatch && currentBlock) {
      blocks.push({
        operDate: currentBlock.operDate,
        conceptParts: currentBlock.textLines.filter((t) => !t.match(/^4\d{15,}/)),
        detailParts: currentBlock.textLines.filter((t) => t.match(/^4\d{15,}/)),
        importe: parseEurAmount(amountsMatch[1]),
        saldo: parseEurAmount(amountsMatch[2]),
      });
      currentBlock = null;
      i++;
      continue;
    }

    // Check for split amounts: importe on one line, saldo on next
    // e.g., "400,00" then "409,98" on separate lines
    const singleMatch = line.match(SINGLE_AMOUNT_RE);
    if (singleMatch && currentBlock) {
      const nextLine = lines[i + 1]?.trim();
      const nextMatch = nextLine?.match(SINGLE_AMOUNT_RE);
      if (nextMatch) {
        blocks.push({
          operDate: currentBlock.operDate,
          conceptParts: currentBlock.textLines.filter((t) => !t.match(/^4\d{15,}/)),
          detailParts: currentBlock.textLines.filter((t) => t.match(/^4\d{15,}/)),
          importe: parseEurAmount(singleMatch[1]),
          saldo: parseEurAmount(nextMatch[1]),
        });
        currentBlock = null;
        i += 2; // Skip both importe and saldo lines
        continue;
      }
    }

    // Standalone amount without a current block (e.g., initial saldo "24,98")
    if (/^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(line) && !currentBlock) { i++; continue; }

    // Otherwise it's a continuation line for the current block
    if (currentBlock) {
      currentBlock.textLines.push(line);
    }
    i++;
  }

  // Extract final balance from the last transaction's saldo
  let finalBalance: number | undefined;
  if (blocks.length > 0) {
    finalBalance = blocks[blocks.length - 1].saldo;
  }

  // Convert blocks to transactions
  for (const block of blocks) {
    const [dayStr, monthStr] = block.operDate.split("/");
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    // Validate date
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) continue;

    if (block.importe === 0) continue;

    // Build description from concept parts
    let description = "";
    for (const part of block.conceptParts) {
      description += (description ? " " : "") + fixBBVASpaces(part);
    }

    // Add merchant from card detail lines (e.g., "4188202128727250Lourens")
    for (const detail of block.detailParts) {
      const merchantMatch = detail.match(/^4\d{15,16}\s*(.+)/);
      if (merchantMatch) {
        const merchant = merchantMatch[1].trim();
        // Skip BBVA transaction reference IDs (start with NLOV or look like random hex)
        const isRefId = /^NLOV/.test(merchant) ||
          (/^[A-Z0-9]{16,}$/.test(merchant) && !/[aeiou]/i.test(merchant));
        if (merchant && !isRefId) {
          description += ` - ${merchant}`;
        }
      }
    }

    // Clean up
    description = description.replace(/^[\s\-]+/, "").replace(/\s{2,}/g, " ").trim();
    if (!description) description = "Transacción BBVA";

    transactions.push({
      date: dateStr,
      description,
      amount: Math.abs(block.importe),
      currency: "EUR",
      direction: block.importe < 0 ? "expense" : "income",
      account: "bbva",
    });
  }

  const result: ParseResult = {
    transactions,
    format: "bbva-pdf",
    errors,
  };

  if (finalBalance !== undefined) {
    result.finalBalances = { bbva: finalBalance };
  }

  if (transactions.length === 0) {
    errors.push("No se pudieron extraer transacciones del PDF de BBVA.");
  }

  return result;
}

// ─── Generic PDF fallback — try to extract tabular data ──

async function parseGenericPDF(pdfBuffer: Buffer): Promise<ParseResult> {
  const text = await loadPDF(pdfBuffer);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];

  // Metadata heuristic: un extracto bancario legitimo tiene al menos una
  // palabra tipica de cabecera ("saldo"/"movimiento"/"fecha valor"/"importe")
  // y al menos 3 lineas con patron de fecha. Si score < 50% no tiene sentido
  // seguir — devolvemos weak inmediatamente para que el caller escale a vision.
  const headerHints = ["saldo", "movimiento", "movimientos", "fecha valor", "f.valor", "importe", "concepto", "descripcion", "descripción"];
  const headersFound = headerHints.some((h) => text.toLowerCase().includes(h));
  const linesWithDate = lines.filter((l) => /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/.test(l)).length;
  const metadataScore = (headersFound ? 0.5 : 0) + Math.min(0.5, linesWithDate / 10);

  if (metadataScore < 0.5) {
    return {
      transactions: [],
      format: "generic-pdf",
      errors: ["El PDF no parece un extracto bancario estándar (no se detectaron cabeceras ni suficientes fechas). Escalando a análisis con IA."],
      weakDetection: true,
    };
  }

  // Try to find lines that contain a date + amount pattern
  const DATE_RE = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/;
  const AMOUNT_INLINE_RE = /([+-]?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*€?/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dateMatch = line.match(DATE_RE);
    if (!dateMatch) continue;

    // Skip header/footer lines
    const lower = line.toLowerCase();
    if (lower.includes("saldo") || lower.includes("balance") || lower.includes("total") ||
        lower.includes("fecha valor") || lower.includes("f.valor") || lower.includes("extracto") ||
        lower.includes("página") || lower.includes("page")) {
      continue;
    }

    // Find all amounts in this line
    const amounts: { value: number; index: number }[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(AMOUNT_INLINE_RE.source, "g");
    while ((m = re.exec(line)) !== null) {
      const val = parseEurAmount(m[1].replace(/\s/g, ""));
      if (!isNaN(val) && val !== 0) amounts.push({ value: val, index: m.index });
    }

    if (amounts.length === 0) continue;

    // If there are 2+ amounts, the last is usually the balance — use the second-to-last
    // If there's only 1 amount, use it
    const amount = amounts.length >= 2
      ? amounts[amounts.length - 2].value
      : amounts[0].value;

    // Extract description: text between date and first amount
    const dateEnd = (dateMatch.index ?? 0) + dateMatch[0].length;
    const amtStart = amounts[0].index;
    let description = line.slice(dateEnd, amtStart).trim();

    // Remove leading/trailing punctuation
    description = description.replace(/^[\s\-:]+|[\s\-:]+$/g, "").trim();
    if (!description) description = "Transacción importada";

    // Skip if description looks like a page number or reference
    if (/^\d+$/.test(description) || description.length < 2) continue;

    // Normalize date (DD/MM/YYYY European convention)
    let dateStr = dateMatch[1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // Already ISO
    } else if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}$/.test(dateStr)) {
      const parts = dateStr.split(/[\/\-.]/);
      dateStr = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    } else if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2}$/.test(dateStr)) {
      const parts = dateStr.split(/[\/\-.]/);
      const year = parseInt(parts[2]) + 2000;
      dateStr = `${year}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
    }

    // Validate date
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > new Date().getFullYear() + 1) {
      continue;
    }

    transactions.push({
      date: dateStr,
      description,
      amount: Math.abs(amount),
      currency: "EUR",
      direction: amount < 0 ? "expense" : "income",
    });
  }

  if (transactions.length === 0) {
    errors.push("No se pudieron extraer transacciones del PDF. Intenta exportar como CSV desde tu banco — es más fiable.");
  }

  // Generic PDF parser is high-risk: it frequently catches a single header/balance
  // line and drops the rest. Always mark as weak so the API layer escalates to
  // AI vision/text fallback, even when one stray transaction was parsed.
  return { transactions, format: "generic-pdf", errors, weakDetection: true };
}

// ─── Main PDF parser (auto-detects bank) ──────────────────

export async function parseBankPDF(pdfBuffer: Buffer): Promise<ParseResult> {
  let text: string;
  try {
    text = await loadPDF(pdfBuffer);
  } catch (e) {
    console.error("[pdf-parser] loadPDF failed:", e);
    return {
      transactions: [],
      format: "pdf-error",
      errors: [`Error leyendo PDF: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
  const bank = detectPDFBank(text);

  switch (bank) {
    case "bbva":
      return parseBBVAPDF(pdfBuffer);
    case "ing":
      return parseINGPDF(pdfBuffer);
    case "revolut":
      return parseRevolutPDF(pdfBuffer);
    case "bunq":
      return parseBunqPDF(pdfBuffer);
    default:
      // Recognised banks without a dedicated PDF parser must go through AI —
      // skip the generic regex parser entirely (it picks up garbage for these
      // bank layouts, e.g. a single balance row from Santander).
      if (BANKS_WITHOUT_PDF_PARSER.has(bank)) {
        console.log(`[pdf-parser] Detected ${bank} but no dedicated parser — routing to AI fallback`);
        return {
          transactions: [],
          format: `${bank}-pdf`,
          errors: [],
          weakDetection: true,
        };
      }
      // Unknown bank — try generic extraction as last resort, but the result
      // will be marked weakDetection so the API escalates to AI if needed.
      return parseGenericPDF(pdfBuffer);
  }
}
