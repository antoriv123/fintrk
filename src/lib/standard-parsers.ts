/**
 * Parsers for universal banking file formats.
 *
 * These are NOT bank-specific — they're open standards that many banks export
 * directly from online banking. Supporting them solves the "one parser per
 * bank" problem for a large % of users without any AI or OCR.
 *
 * Supported formats:
 * - OFX (Open Financial Exchange) — common in US/CA, some EU banks
 * - QIF (Quicken Interchange Format) — legacy but still widely exported
 * - CAMT.053 (ISO 20022) — SEPA default since 2025
 * - MT940 (SWIFT) — still used by corporate banking + some retail banks
 *
 * All return the shared ParseResult type so the import API layer is format-agnostic.
 */

import type { ParseResult, ParsedTransaction } from "./csv-parser";

export type StandardFormat = "ofx" | "qif" | "camt053" | "mt940" | null;

/**
 * Detect standard banking formats by content sniffing (magic numbers / root tags).
 * Returns null if the text doesn't look like any known standard.
 */
export function detectStandardFormat(text: string): StandardFormat {
  const sample = text.slice(0, 2000);
  const trimmed = sample.trimStart();

  // OFX: SGML header or XML-wrapped variant
  if (/^OFXHEADER[:\s]/i.test(trimmed) || /<OFX[\s>]/i.test(trimmed)) {
    return "ofx";
  }

  // CAMT.053: ISO 20022 SEPA bank statement
  if (/camt\.053/i.test(sample) || /<(?:\w+:)?BkToCstmrStmt[\s>]/i.test(sample)) {
    return "camt053";
  }

  // QIF: starts with "!Type:" header
  if (/^!Type[:\s]/im.test(sample.slice(0, 200))) {
    return "qif";
  }

  // MT940: SWIFT message with :20: (transaction reference) + :61: (statement line)
  // Must contain both — :20: alone is too permissive.
  if (/^:20:/m.test(sample) && /:61:/m.test(sample)) {
    return "mt940";
  }

  return null;
}

/** Dispatch to the right parser. Call detectStandardFormat() first. */
export function parseStandardFormat(text: string, format: StandardFormat): ParseResult {
  switch (format) {
    case "ofx": return parseOFX(text);
    case "qif": return parseQIF(text);
    case "camt053": return parseCAMT053(text);
    case "mt940": return parseMT940(text);
    default: return { transactions: [], format: "unknown", errors: ["Formato no reconocido"] };
  }
}

// ─── OFX ───────────────────────────────────────────────────

/** Parse OFX date string "YYYYMMDDHHMMSS[tz:TZ]" → "YYYY-MM-DD" */
function parseOFXDate(raw: string): string {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/** Extract a tag value from an OFX/SGML fragment. OFX tags don't need closing, so:
 *  <TAG>value
 *  <TAG>value</TAG>
 *  are both valid. */
function ofxTag(block: string, tag: string): string {
  // Try closing-tag form first (XML variant)
  const closed = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  if (closed) return closed[1].trim();
  // SGML form: value is everything up to next tag or newline
  const open = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return open ? open[1].trim() : "";
}

export function parseOFX(text: string): ParseResult {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Extract each STMTTRN block — transactions in OFX
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];

  // Statement currency (usually one per file)
  const currency = ofxTag(text, "CURDEF") || "EUR";

  for (const block of blocks) {
    const rawDate = ofxTag(block, "DTPOSTED");
    const rawAmount = ofxTag(block, "TRNAMT");
    const name = ofxTag(block, "NAME") || ofxTag(block, "PAYEE");
    const memo = ofxTag(block, "MEMO");

    if (!rawDate || !rawAmount) continue;
    const date = parseOFXDate(rawDate);
    const amount = parseFloat(rawAmount);
    if (!date || isNaN(amount) || amount === 0) continue;

    const description = [name, memo].filter(Boolean).join(" — ").slice(0, 300) || "OFX transaction";

    transactions.push({
      date,
      description,
      amount: Math.abs(amount),
      currency,
      direction: amount < 0 ? "expense" : "income",
    });
  }

  // Final balance (LEDGERBAL BALAMT)
  const balAmt = text.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i);
  const finalBalance = balAmt ? parseFloat(balAmt[1].trim()) : NaN;

  if (transactions.length === 0) {
    errors.push("No se encontraron transacciones en el OFX.");
  }

  return {
    transactions,
    format: "ofx",
    errors,
    finalBalances: !isNaN(finalBalance) ? { ofx: finalBalance } : undefined,
  };
}

// ─── QIF ───────────────────────────────────────────────────

/** Parse a numeric amount that could be in US (1,234.56) or EU (1.234,56) format. */
function parseNumericAmount(raw: string): number {
  // Normalise Unicode dashes to ASCII "-" so the sign is detected correctly.
  const s = raw.trim().replace(/[\u2212\u2013\u2014\u2010\u2011\u2012\u2015]/g, "-").replace(/[\s€$£¥]/g, "");
  if (!s) return NaN;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastComma > lastDot) {
    // EU: comma is decimal separator, dots are thousands
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  // US / plain: dot is decimal, commas are thousands
  return parseFloat(s.replace(/,/g, ""));
}

/** QIF dates: "MM/DD/YYYY" (US), "DD/MM/YYYY" (EU), "DD/MM'YY" (Quicken shorthand), etc.
 *  We assume European DD/MM/YYYY by default because US-locale QIFs are rare in Spain/LatAm. */
function parseQIFDate(raw: string): string {
  const s = raw.trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY
  const eu = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (eu) return `${eu[3]}-${eu[2].padStart(2, "0")}-${eu[1].padStart(2, "0")}`;
  // DD/MM'YY (Quicken shorthand)
  const quick = s.match(/^(\d{1,2})[\/-](\d{1,2})['](\d{2})/);
  if (quick) {
    const yr = parseInt(quick[3], 10);
    const fullYear = yr >= 50 ? 1900 + yr : 2000 + yr;
    return `${fullYear}-${quick[2].padStart(2, "0")}-${quick[1].padStart(2, "0")}`;
  }
  return "";
}

export function parseQIF(text: string): ParseResult {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Walk line by line, accumulating a current transaction until we hit "^".
  // This handles both the header (!Type:Bank) and trailing whitespace cleanly.
  let current: Record<string, string> = {};
  let inTransaction = false;

  const flush = () => {
    if (!inTransaction) return;
    const date = current.D ? parseQIFDate(current.D) : "";
    const amountStr = current.T ?? current.U ?? "";
    const amount = parseNumericAmount(amountStr);
    if (date && !isNaN(amount) && amount !== 0) {
      const description = [current.P, current.M, current.L]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 300) || "QIF transaction";
      transactions.push({
        date,
        description,
        amount: Math.abs(amount),
        currency: "EUR",
        direction: amount < 0 ? "expense" : "income",
      });
    }
    current = {};
    inTransaction = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("!")) continue; // !Type:Bank, !Account, etc.
    if (line === "^") {
      flush();
      continue;
    }
    const code = line[0];
    const value = line.slice(1);
    if ("DTUPMLCN".includes(code)) {
      // Append to support multi-line M memos (rare but valid)
      current[code] = current[code] ? current[code] + " " + value : value;
      inTransaction = true;
    }
  }
  // Flush any unterminated record
  flush();

  if (transactions.length === 0) {
    errors.push("No se encontraron transacciones en el QIF.");
  }

  return { transactions, format: "qif", errors };
}

// ─── CAMT.053 ──────────────────────────────────────────────

/**
 * Parse ISO 20022 CAMT.053 (bank statement).
 * We use regex-only XML parsing because:
 *   a) the structure is well-defined and stable
 *   b) we don't need full DOM — just <Ntry> entries + their amounts/dates
 *   c) avoids adding a dependency
 */
export function parseCAMT053(xml: string): ParseResult {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Strip namespace prefixes to simplify matching: <ns:Ntry> → <Ntry>
  const clean = xml.replace(/<\/?(?:\w+):/g, (m) => m.replace(/\w+:/, ""));

  // Statement-level account currency (fallback)
  const acctCcy = clean.match(/<Acct>[\s\S]*?<Ccy>([A-Z]{3})<\/Ccy>/i)?.[1] ?? "EUR";
  // Statement-level closing balance
  const closingBal = clean.match(/<Bal>[\s\S]*?<Cd>CLBD[\s\S]*?<Amt[^>]*>([\d.]+)<\/Amt>/i);
  const finalBalance = closingBal ? parseFloat(closingBal[1]) : NaN;

  // Each <Ntry> is a transaction (booked entry)
  const entries = clean.match(/<Ntry>[\s\S]*?<\/Ntry>/gi) ?? [];

  for (const entry of entries) {
    // Amount
    const amtMatch = entry.match(/<Amt\s+Ccy="([A-Z]{3})"[^>]*>([\d.]+)<\/Amt>/i)
      ?? entry.match(/<Amt[^>]*>([\d.]+)<\/Amt>/i);
    if (!amtMatch) continue;
    const currency = amtMatch.length === 3 ? amtMatch[1] : acctCcy;
    const amount = parseFloat(amtMatch[amtMatch.length - 1]);
    if (isNaN(amount) || amount === 0) continue;

    // Direction: <CdtDbtInd>CRDT|DBIT</CdtDbtInd>
    const indMatch = entry.match(/<CdtDbtInd>(CRDT|DBIT)<\/CdtDbtInd>/i);
    const direction: "income" | "expense" = indMatch?.[1].toUpperCase() === "CRDT" ? "income" : "expense";

    // Date: prefer booking date, fall back to value date
    const bookDt = entry.match(/<BookgDt>[\s\S]*?<Dt>(\d{4}-\d{2}-\d{2})/i);
    const valDt = entry.match(/<ValDt>[\s\S]*?<Dt>(\d{4}-\d{2}-\d{2})/i);
    const date = bookDt?.[1] ?? valDt?.[1] ?? "";
    if (!date) continue;

    // Description: prefer <AddtlNtryInf>, then <RmtInf>/<Ustrd>, then counterparty name
    const addtl = entry.match(/<AddtlNtryInf>([\s\S]*?)<\/AddtlNtryInf>/i)?.[1];
    const ustrd = entry.match(/<RmtInf>[\s\S]*?<Ustrd>([\s\S]*?)<\/Ustrd>/i)?.[1];
    const cdtrNm = entry.match(/<Cdtr>[\s\S]*?<Nm>([\s\S]*?)<\/Nm>/i)?.[1];
    const dbtrNm = entry.match(/<Dbtr>[\s\S]*?<Nm>([\s\S]*?)<\/Nm>/i)?.[1];
    const description = [addtl, ustrd, cdtrNm ?? dbtrNm]
      .map((s) => s?.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" — ")
      .slice(0, 300) || "CAMT.053 transaction";

    transactions.push({
      date,
      description,
      amount: Math.abs(amount),
      currency,
      direction,
    });
  }

  if (transactions.length === 0) {
    errors.push("No se encontraron <Ntry> válidas en el CAMT.053.");
  }

  return {
    transactions,
    format: "camt053",
    errors,
    finalBalances: !isNaN(finalBalance) ? { camt053: finalBalance } : undefined,
  };
}

// ─── MT940 ─────────────────────────────────────────────────

/**
 * Parse SWIFT MT940 statement messages.
 *
 * MT940 is line-based with field tags of the form ":NN:" or ":NNx:":
 *   :20: transaction reference
 *   :25: account id
 *   :60F: opening balance
 *   :61: statement line — YYMMDD[MMDD] [C|D|RC|RD] amount[,cc] type reference
 *   :86: extra info about preceding :61: (free text, can be multi-line)
 *   :62F: closing balance
 *
 * We extract each :61: / :86: pair as one transaction.
 */
export function parseMT940(text: string): ParseResult {
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  // Currency from :60F: opening balance field (format: DCYYMMDDCURAMT)
  const openingBal = text.match(/:60F:[CD]\d{6}([A-Z]{3})([\d,]+)/);
  const currency = openingBal?.[1] ?? "EUR";

  // Closing balance
  const closingBal = text.match(/:62F:([CD])\d{6}[A-Z]{3}([\d,]+)/);
  const finalBalance = closingBal
    ? parseFloat(closingBal[2].replace(",", ".")) * (closingBal[1] === "D" ? -1 : 1)
    : NaN;

  // Walk line by line, collecting :61:/:86: pairs
  const lines = text.split(/\r?\n/);
  let current: { rawLine: string; extra: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const parsed = parseMT940Line61(current.rawLine);
    if (parsed) {
      const extra = current.extra.join(" ").replace(/\s+/g, " ").trim();
      const description = extra || parsed.fallbackDesc || "MT940 transaction";
      transactions.push({
        date: parsed.date,
        description: description.slice(0, 300),
        amount: parsed.amount,
        currency,
        direction: parsed.direction,
      });
    }
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith(":61:")) {
      flush();
      current = { rawLine: line.slice(4), extra: [] };
    } else if (line.startsWith(":86:")) {
      if (current) current.extra.push(line.slice(4));
    } else if (line.startsWith(":") && current) {
      // Any other tag means end of :86: block for the previous :61:
      flush();
    } else if (current && current.extra.length > 0) {
      // Continuation line of a :86: field
      current.extra[current.extra.length - 1] += " " + line;
    }
  }
  flush();

  if (transactions.length === 0) {
    errors.push("No se encontraron lineas :61: válidas en el MT940.");
  }

  return {
    transactions,
    format: "mt940",
    errors,
    finalBalances: !isNaN(finalBalance) ? { mt940: finalBalance } : undefined,
  };
}

/** Parse the payload of a :61: line after the ":61:" prefix. */
function parseMT940Line61(payload: string): {
  date: string;
  amount: number;
  direction: "income" | "expense";
  fallbackDesc: string;
} | null {
  // Format: YYMMDD[MMDD][RC|RD|C|D][funds-code]amount[N type][//ref]...
  // Value date YYMMDD + optional booking date MMDD
  const m = payload.match(/^(\d{2})(\d{2})(\d{2})(?:\d{4})?(R?[CD])([A-Z]?)([\d,]+)(.*)$/);
  if (!m) return null;
  const [, yy, mm, dd, dbcd, , amt, rest] = m;
  const year = parseInt(yy, 10);
  const fullYear = year >= 70 ? 1900 + year : 2000 + year;
  const date = `${fullYear}-${mm}-${dd}`;

  const amount = parseFloat(amt.replace(",", "."));
  if (isNaN(amount)) return null;

  // R* = reversal, treat as opposite direction
  const isReversal = dbcd.startsWith("R");
  const isDebit = dbcd.endsWith("D");
  const direction: "income" | "expense" = (isDebit !== isReversal) ? "expense" : "income";

  const fallbackDesc = rest.trim();

  return { date, amount, direction, fallbackDesc };
}
