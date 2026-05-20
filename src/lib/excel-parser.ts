import * as XLSX from "xlsx";

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  currency: string;
  direction: "income" | "expense";
  account?: string;
  is_internal?: boolean;
}

export interface ParseResult {
  format: string;
  transactions: ParsedTransaction[];
  errors: string[];
  finalBalances?: Record<string, number>;
  /**
   * true when the parser's output should not be trusted as the final answer
   * (e.g. bank was not recognised, broad search was used, fallback parser ran).
   * The API layer uses this to force AI fallback even with transactions.length > 0.
   */
  weakDetection?: boolean;
}

// --- Bank detection ---

interface BankProfile {
  name: string;
  account: string;
  /** Required headers (lowercased). ALL must be present for a match. */
  requiredHeaders: string[];
  /** Optional — if present, increases confidence */
  optionalHeaders?: string[];
  /** Column mapping */
  dateCol: string[];
  descriptionCols: string[]; // joined with " — " if multiple match
  amountCol: string[];
  currencyCol?: string[];
  /** Separate debit/credit columns (some banks use this instead of signed amount) */
  debitCol?: string[];
  creditCol?: string[];
  /** Direction indicator column — value like "Af"/"Bij" determines direction */
  directionCol?: string[];
  directionExpenseValues?: string[];
  directionIncomeValues?: string[];
}

const BANK_PROFILES: BankProfile[] = [
  {
    name: "BBVA",
    account: "bbva",
    requiredHeaders: ["fecha"],
    optionalHeaders: ["concepto", "movimiento", "importe", "f.valor", "disponible", "observaciones", "divisa", "fecha valor", "fecha contable", "cantidad", "saldo"],
    dateCol: ["fecha", "fecha contable", "fecha valor", "f.valor", "fecha operación", "fecha operacion"],
    descriptionCols: ["movimiento", "concepto", "observaciones", "descripcion", "descripción"],
    amountCol: ["importe", "cantidad", "monto"],
    currencyCol: ["divisa", "moneda"],
  },
  {
    name: "Santander",
    account: "santander",
    requiredHeaders: ["fecha", "concepto"],
    optionalHeaders: ["importe", "saldo", "fecha valor", "cantidad"],
    dateCol: ["fecha", "fecha operación", "fecha operacion"],
    descriptionCols: ["concepto", "descripción", "descripcion"],
    amountCol: ["importe", "cantidad"],
    currencyCol: ["moneda", "divisa"],
  },
  {
    name: "CaixaBank",
    account: "caixabank",
    requiredHeaders: ["data", "concepte"],
    optionalHeaders: ["import", "oficina", "movimiento"],
    dateCol: ["data", "fecha"],
    descriptionCols: ["concepte", "concepto", "descripció"],
    amountCol: ["import", "importe"],
    currencyCol: ["divisa", "moneda"],
  },
  {
    name: "ING",
    account: "ing",
    requiredHeaders: ["datum", "naam / omschrijving"],
    optionalHeaders: ["af bij", "bedrag", "rekening", "mededelingen"],
    dateCol: ["datum"],
    descriptionCols: ["naam / omschrijving", "mededelingen"],
    amountCol: ["bedrag (eur)", "bedrag"],
    directionCol: ["af bij"],
    directionExpenseValues: ["af"],
    directionIncomeValues: ["bij"],
  },
  {
    name: "ING ES",
    account: "ing",
    requiredHeaders: ["descripción"],
    optionalHeaders: ["f. valor", "f.valor", "categoría", "subcategoría", "comentario", "importe", "saldo"],
    dateCol: ["f. valor", "f.valor", "fecha valor", "fecha"],
    descriptionCols: ["descripción", "descripcion", "comentario"],
    amountCol: ["importe (€)", "importe", "importe(€)"],
  },
  {
    name: "Revolut",
    account: "revolut",
    requiredHeaders: ["started date", "description", "amount"],
    optionalHeaders: ["completed date", "currency", "state", "balance"],
    dateCol: ["started date", "completed date", "fecha de inicio"],
    descriptionCols: ["description", "descripción"],
    amountCol: ["amount", "importe"],
    currencyCol: ["currency", "moneda"],
  },
  {
    name: "Revolut ES",
    account: "revolut",
    requiredHeaders: ["fecha de inicio", "descripción"],
    optionalHeaders: ["fecha de finalización", "importe", "moneda", "estado"],
    dateCol: ["fecha de inicio", "fecha de finalización"],
    descriptionCols: ["descripción"],
    amountCol: ["importe", "amount"],
    currencyCol: ["moneda", "currency"],
  },
  {
    name: "N26",
    account: "n26",
    requiredHeaders: ["date", "payee", "amount (eur)"],
    optionalHeaders: ["payment reference", "account name", "transaction type"],
    dateCol: ["date", "booking date"],
    descriptionCols: ["payee", "payment reference"],
    amountCol: ["amount (eur)", "amount"],
  },
  {
    name: "Wise",
    account: "wise",
    requiredHeaders: ["date", "amount", "description"],
    optionalHeaders: ["merchant", "source currency", "target currency"],
    dateCol: ["date"],
    descriptionCols: ["description", "merchant"],
    amountCol: ["amount"],
    currencyCol: ["currency"],
  },
];

// Generic fallback patterns
const DATE_PATTERNS = [
  "date", "fecha", "datum", "data", "dia", "transaction date", "fecha de operacion",
  "fecha operacion", "booking date", "fecha valor", "fecha de valor", "f.valor", "f. valor",
  "started date", "fecha de inicio", "transactiedatum", "fecha contable",
];
const DESC_PATTERNS = [
  "description", "descripcion", "concepto", "omschrijving", "details",
  "payee", "merchant", "nombre", "referencia", "payment reference",
  "descripción", "detalle", "concepte", "movimiento", "observaciones",
  "naam / omschrijving", "operacion", "operación", "texto",
];
const AMOUNT_PATTERNS = [
  "amount", "importe", "cantidad", "bedrag", "monto", "valor", "suma",
  "amount (eur)", "amount eur", "import", "cargo", "abono",
  "importe (€)", "importe(€)", "importe (eur)",
];
const INCOME_PATTERNS = [
  "paid in", "credit", "ingreso", "abono", "haber", "bij",
];
const EXPENSE_PATTERNS = [
  "paid out", "debit", "gasto", "cargo", "debe", "af",
];
const CURRENCY_PATTERNS = [
  "currency", "moneda", "divisa", "muntsoort",
];

// --- Utility functions ---

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .toLowerCase()
    .trim()
    .replace(/[\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    // Normalize special unicode chars that Excel sometimes uses
    .replace(/\u00a0/g, " ")       // non-breaking space → regular space
    .replace(/[\u2018\u2019]/g, "'") // smart quotes
    .replace(/[\u201c\u201d]/g, '"') // smart double quotes
    .replace(/\u2013/g, "-")        // en-dash
    .replace(/\u2014/g, "-")        // em-dash
    .replace(/\u20ac/g, "€");       // euro sign (ensure consistent)
}

function parseAmountValue(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return val;
  if (typeof val !== "string") return null;

  // Normalise Unicode dashes (U+2212 minus, en-dash, em-dash) to ASCII "-"
  // before parsing. Some bank exports use these instead of ASCII.
  let clean = val.trim().replace(/[\u2212\u2013\u2014\u2010\u2011\u2012\u2015]/g, "-").replace(/[€$£¥₹\s]/g, "");
  if (!clean) return null;

  // Handle parentheses as negative: (123.45) → -123.45
  if (clean.startsWith("(") && clean.endsWith(")")) {
    clean = "-" + clean.slice(1, -1);
  }

  const sign = clean.startsWith("-") ? -1 : 1;
  clean = clean.replace(/^[+-]/, "");

  // European: 1.234,56 → 1234.56
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(clean)) {
    return sign * parseFloat(clean.replace(/\./g, "").replace(",", "."));
  }
  // European comma-only: 1234,56
  if (/^\d+(,\d{1,2})$/.test(clean)) {
    return sign * parseFloat(clean.replace(",", "."));
  }
  // US: 1,234.56
  if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(clean)) {
    return sign * parseFloat(clean.replace(/,/g, ""));
  }
  // Plain number
  const num = parseFloat(clean.replace(",", "."));
  return isNaN(num) ? null : sign * num;
}

function parseDateValue(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;

  // JS Date object (Excel serial dates parsed by xlsx with cellDates:true)
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    if (y < 2000 || y > 2100) return null;
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Excel serial number (if cellDates didn't catch it)
  if (typeof val === "number" && val > 30000 && val < 60000) {
    // Excel serial: days since 1900-01-01 (with the 1900 leap year bug)
    const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
    const msPerDay = 86400000;
    const date = new Date(excelEpoch.getTime() + val * msPerDay);
    if (!isNaN(date.getTime())) {
      const y = date.getFullYear();
      if (y >= 2000 && y <= 2100) {
        return `${y}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      }
    }
    return null;
  }

  const str = String(val).trim();
  if (!str) return null;

  // YYYYMMDD (ING)
  if (/^\d{8}$/.test(str)) {
    const y = str.slice(0, 4), m = str.slice(4, 6), d = str.slice(6, 8);
    if (parseInt(y) >= 2000) return `${y}-${m}-${d}`;
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (European — most banks)
  const euMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (euMatch) {
    const day = euMatch[1].padStart(2, "0");
    const month = euMatch[2].padStart(2, "0");
    const year = euMatch[3];
    if (parseInt(month) <= 12 && parseInt(day) <= 31) {
      return `${year}-${month}-${day}`;
    }
  }

  // "DD Mon YYYY" or "DD-Mon-YYYY"
  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    ene: "01", abr: "04", ago: "08", dic: "12", // Spanish
    mrt: "03", mei: "05", okt: "10", // Dutch
  };
  const monthMatch = str.match(/^(\d{1,2})[\s-]([a-zA-Z]{3})[\s-](\d{4})/);
  if (monthMatch) {
    const day = monthMatch[1].padStart(2, "0");
    const mon = monthNames[monthMatch[2].toLowerCase().slice(0, 3)];
    if (mon) return `${monthMatch[3]}-${mon}-${day}`;
  }

  // Try native Date parse (last resort)
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    if (y >= 2000 && y <= 2100) {
      return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }

  return null;
}

function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  return year >= 2000 && year <= new Date().getFullYear() + 1;
}

// --- Header scanning ---

/** Scan up to the first N rows looking for a row that looks like headers */
function findHeaderRow(
  sheet: XLSX.WorkSheet,
  maxScanRows = 15
): { headers: string[]; headerRowIndex: number; rawHeaders: string[] } | null {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const endRow = Math.min(range.e.r, maxScanRows - 1);
  const endCol = range.e.c;

  for (let r = range.s.r; r <= endRow; r++) {
    const row: string[] = [];
    const rawRow: string[] = [];
    let nonEmpty = 0;

    for (let c = range.s.c; c <= endCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      const val = cell ? String(cell.v ?? "").trim() : "";
      rawRow.push(val);
      const norm = normalizeHeader(val);
      row.push(norm);
      if (norm) nonEmpty++;
    }

    // A header row should have at least 3 non-empty cells
    if (nonEmpty < 3) continue;

    // Check if this looks like a header row:
    // - contains date-like keywords
    // - contains description-like keywords
    // - contains amount-like keywords
    const rowText = row.join(" ");
    const rowTextNoAccent = stripAccents(rowText);
    const hasDate = DATE_PATTERNS.some((p) => rowText.includes(p) || rowTextNoAccent.includes(stripAccents(p)));
    const hasDesc = DESC_PATTERNS.some((p) => rowText.includes(p) || rowTextNoAccent.includes(stripAccents(p)));
    const hasAmount = AMOUNT_PATTERNS.some((p) => rowText.includes(p) || rowTextNoAccent.includes(stripAccents(p))) ||
      INCOME_PATTERNS.some((p) => rowText.includes(p)) ||
      EXPENSE_PATTERNS.some((p) => rowText.includes(p));

    // Also check for common Spanish bank header words that might not be in patterns
    const hasBankKeyword = rowText.includes("disponible") || rowText.includes("saldo") ||
      rowText.includes("movimiento") || rowText.includes("operacion") || rowTextNoAccent.includes("operacion");

    if (hasDate || (hasDesc && hasAmount) || (hasDate && hasAmount) || (hasDate && hasBankKeyword) || (hasBankKeyword && hasAmount)) {
      return { headers: row, headerRowIndex: r, rawHeaders: rawRow };
    }
  }

  return null;
}

/** Strip accents for fuzzy matching */
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Check if header matches a pattern (exact, includes, or accent-stripped) */
function headerMatches(header: string, pattern: string): boolean {
  if (header === pattern) return true;
  if (header.includes(pattern)) return true;
  // Also try matching without accents
  const hStripped = stripAccents(header);
  const pStripped = stripAccents(pattern);
  if (hStripped === pStripped) return true;
  if (hStripped.includes(pStripped)) return true;
  return false;
}

/** Try to match headers against known bank profiles */
function detectBank(headers: string[]): BankProfile | null {
  let bestMatch: BankProfile | null = null;
  let bestScore = 0;

  for (const profile of BANK_PROFILES) {
    const requiredMatches = profile.requiredHeaders.filter((rh) =>
      headers.some((h) => headerMatches(h, rh))
    ).length;

    // All required headers must match
    if (requiredMatches < profile.requiredHeaders.length) continue;

    let score = requiredMatches * 3;

    // Bonus for optional headers — each match increases confidence
    if (profile.optionalHeaders) {
      const optionalMatches = profile.optionalHeaders.filter((oh) =>
        headers.some((h) => headerMatches(h, oh))
      ).length;
      score += optionalMatches * 2;
    }

    // Bonus if we can actually find date + amount columns
    const hasDate = profile.dateCol.some((dc) => headers.some((h) => headerMatches(h, dc)));
    const hasAmount = profile.amountCol.some((ac) => headers.some((h) => headerMatches(h, ac)));
    if (hasDate) score += 2;
    if (hasAmount) score += 2;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = profile;
    }
  }

  return bestMatch;
}

function findColIndex(headers: string[], candidates: string[]): number {
  // Exact match first
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h === c);
    if (idx >= 0) return idx;
  }
  // Partial match
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h.includes(c));
    if (idx >= 0) return idx;
  }
  // Accent-stripped match
  for (const c of candidates) {
    const cStripped = stripAccents(c);
    const idx = headers.findIndex((h) => stripAccents(h) === cStripped || stripAccents(h).includes(cStripped));
    if (idx >= 0) return idx;
  }
  return -1;
}

// --- Main parser ---

export function parseExcel(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { format: "excel", transactions: [], errors: ["El archivo Excel esta vacio"] };
  }

  const sheet = workbook.Sheets[sheetName];

  // Debug: log first few rows to understand the file structure
  const debugRange = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  console.log(`[excel-parser] Sheet "${sheetName}" range: ${sheet["!ref"]}, rows: ${debugRange.e.r + 1}, cols: ${debugRange.e.c + 1}`);
  for (let r = 0; r <= Math.min(debugRange.e.r, 5); r++) {
    const cells: string[] = [];
    for (let c = 0; c <= Math.min(debugRange.e.c, 10); c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      cells.push(cell ? `${String(cell.v).slice(0, 30)}` : "");
    }
    console.log(`[excel-parser] Row ${r}: [${cells.join(" | ")}]`);
  }

  // Step 1: Scan for header row (doesn't assume row 1)
  const headerInfo = findHeaderRow(sheet);
  if (!headerInfo) {
    console.log("[excel-parser] No header row found, trying fallback...");
    // Fallback: try sheet_to_json with row 0 as headers
    return parseExcelFallback(sheet);
  }

  const { headers, headerRowIndex } = headerInfo;
  console.log(`[excel-parser] Header row ${headerRowIndex}: [${headers.join(" | ")}]`);

  // Step 2: Detect if this is a known bank
  const bank = detectBank(headers);
  const format = bank ? bank.name : "excel";
  const account = bank?.account ?? undefined;
  // Track low-confidence paths so the API layer can escalate to AI fallback.
  let weakDetection = !bank; // no bank recognised → always weak
  console.log(`[excel-parser] Detected bank: ${bank?.name ?? "unknown"}, format: ${format}`);

  // Step 3: Map columns
  let dateIdx: number;
  const descIdxList: number[] = [];
  let amountIdx: number;
  let currencyIdx = -1;
  let debitIdx = -1;
  let creditIdx = -1;
  let directionIdx = -1;
  let directionExpenseVals: string[] = [];
  let directionIncomeVals: string[] = [];

  if (bank) {
    dateIdx = findColIndex(headers, bank.dateCol);
    amountIdx = findColIndex(headers, bank.amountCol);
    console.log(`[excel-parser] Bank ${bank.name}: dateIdx=${dateIdx}, amountIdx=${amountIdx}`);
    if (bank.currencyCol) currencyIdx = findColIndex(headers, bank.currencyCol);
    if (bank.debitCol) debitIdx = findColIndex(headers, bank.debitCol);
    if (bank.creditCol) creditIdx = findColIndex(headers, bank.creditCol);
    if (bank.directionCol) {
      directionIdx = findColIndex(headers, bank.directionCol);
      directionExpenseVals = bank.directionExpenseValues ?? [];
      directionIncomeVals = bank.directionIncomeValues ?? [];
    }

    // Description: try each column, collect all that exist
    for (const dc of bank.descriptionCols) {
      const idx = findColIndex(headers, [dc]);
      if (idx >= 0 && !descIdxList.includes(idx)) descIdxList.push(idx);
    }
  } else {
    dateIdx = findColIndex(headers, DATE_PATTERNS);
    amountIdx = findColIndex(headers, AMOUNT_PATTERNS);
    currencyIdx = findColIndex(headers, CURRENCY_PATTERNS);
    debitIdx = findColIndex(headers, EXPENSE_PATTERNS);
    creditIdx = findColIndex(headers, INCOME_PATTERNS);

    for (const dc of DESC_PATTERNS) {
      const idx = findColIndex(headers, [dc]);
      if (idx >= 0 && !descIdxList.includes(idx)) descIdxList.push(idx);
    }
  }

  // If we can't find critical columns, try broader search before giving up
  if (dateIdx < 0) {
    console.log(`[excel-parser] Date column not found via bank/patterns, trying broad search...`);
    console.log(`[excel-parser] Headers for broad search: ${JSON.stringify(headers)}`);
    // Try any column that contains "fecha" or "date" or "f." (for "f. valor")
    const broadDateIdx = headers.findIndex((h) => {
      const hs = stripAccents(h);
      return h.includes("fecha") || h.includes("date") || h.includes("datum") ||
        h.includes("data") || h.includes("f. valor") || h.includes("f.valor") ||
        h.includes("valor") || (h.startsWith("f.") && h.includes("val")) ||
        hs.includes("fecha") || hs.includes("f. valor");
    });
    if (broadDateIdx >= 0) {
      dateIdx = broadDateIdx;
      weakDetection = true; // broad search = low confidence, escalate
      console.log(`[excel-parser] Found date via broad search at index ${dateIdx}: "${headers[dateIdx]}"`);
    } else {
      console.log(`[excel-parser] FAILED to find date column. All headers: ${JSON.stringify(headers)}`);
      return {
        format,
        transactions: [],
        errors: [`No se encontro columna de fecha. Columnas detectadas: ${headers.filter((h) => h).join(", ")}`],
      };
    }
  }
  if (amountIdx < 0 && debitIdx < 0 && creditIdx < 0) {
    // Try any column that contains "importe" or "amount" or "cantidad"
    const broadAmountIdx = headers.findIndex((h) =>
      h.includes("importe") || h.includes("amount") || h.includes("cantidad") ||
      h.includes("monto") || h.includes("valor") || h.includes("bedrag") || h.includes("import")
    );
    if (broadAmountIdx >= 0) {
      amountIdx = broadAmountIdx;
      weakDetection = true; // broad search = low confidence, escalate
    } else {
      return {
        format,
        transactions: [],
        errors: [`No se encontro columna de importe. Columnas detectadas: ${headers.filter((h) => h).join(", ")}`],
      };
    }
  }

  // Step 4: Read data rows
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];
  let lastBalance: number | null = null;

  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    const getCell = (c: number): unknown => {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (!cell) return null;
      // For dates, prefer the parsed Date object
      if (cell.t === "d") return cell.v;
      // For numbers, return raw value
      if (cell.t === "n") return cell.v;
      // For strings, return the formatted or raw value
      return cell.w ?? String(cell.v ?? "");
    };

    // Skip entirely empty rows
    const dateRaw = getCell(dateIdx);
    if (dateRaw === null || dateRaw === undefined || String(dateRaw).trim() === "") continue;

    const date = parseDateValue(dateRaw);
    if (!date || !isValidDate(date)) {
      // Could be a summary row, skip silently
      continue;
    }

    // Build description from multiple columns
    const descParts: string[] = [];
    for (const di of descIdxList) {
      const val = String(getCell(di) ?? "").trim();
      if (val && val !== "undefined" && val !== "null") {
        descParts.push(val);
      }
    }
    // If no desc columns matched, try to grab any text from non-date/amount columns
    if (descParts.length === 0) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (c === dateIdx || c === amountIdx || c === currencyIdx || c === debitIdx || c === creditIdx) continue;
        const val = String(getCell(c) ?? "").trim();
        if (val && val.length > 2 && isNaN(Number(val))) {
          descParts.push(val);
        }
      }
    }
    const description = descParts.join(" — ").slice(0, 300) || "Sin descripcion";

    // Currency
    const currency = currencyIdx >= 0
      ? String(getCell(currencyIdx) ?? "EUR").trim().toUpperCase()
      : "EUR";

    // Amount & direction
    let amount: number | null = null;
    let direction: "income" | "expense" = "expense";
    const hasSplitCols = debitIdx >= 0 || creditIdx >= 0;

    if (hasSplitCols) {
      const debitVal = debitIdx >= 0 ? parseAmountValue(getCell(debitIdx)) : null;
      const creditVal = creditIdx >= 0 ? parseAmountValue(getCell(creditIdx)) : null;

      if (creditVal && creditVal > 0) {
        amount = creditVal;
        direction = "income";
      } else if (debitVal && debitVal > 0) {
        amount = debitVal;
        direction = "expense";
      } else if (creditVal && creditVal < 0) {
        amount = Math.abs(creditVal);
        direction = "expense";
      } else if (debitVal && debitVal < 0) {
        amount = Math.abs(debitVal);
        direction = "income";
      }
    }

    if (amount === null && amountIdx >= 0) {
      const rawAmount = parseAmountValue(getCell(amountIdx));
      if (rawAmount !== null && rawAmount !== 0) {
        amount = Math.abs(rawAmount);
        direction = rawAmount >= 0 ? "income" : "expense";

        // Override direction from direction column if available (e.g., ING "Af Bij")
        if (directionIdx >= 0) {
          const dirVal = String(getCell(directionIdx) ?? "").trim().toLowerCase();
          if (directionExpenseVals.some((v) => dirVal === v || dirVal.includes(v))) {
            direction = "expense";
          } else if (directionIncomeVals.some((v) => dirVal === v || dirVal.includes(v))) {
            direction = "income";
          }
        }
      }
    }

    if (amount === null || amount === 0) continue; // skip zero/empty rows

    // Track the last "Disponible" balance for BBVA
    if (bank?.name === "BBVA") {
      const balIdx = findColIndex(headers, ["disponible"]);
      if (balIdx >= 0) {
        const bal = parseAmountValue(getCell(balIdx));
        if (bal !== null) lastBalance = bal;
      }
    }

    transactions.push({
      date,
      description,
      amount: Math.round(amount * 100) / 100,
      currency: currency || "EUR",
      direction,
      account,
    });
  }

  // Final balance from statement
  const finalBalances: Record<string, number> | undefined =
    lastBalance !== null && account
      ? { [account]: lastBalance }
      : undefined;

  // If we found headers but 0 transactions, try the fallback parser
  if (transactions.length === 0) {
    console.log(`[excel-parser] 0 transactions with bank=${bank?.name ?? "generic"}, headers=[${headers.filter(h => h).join(", ")}], trying fallback...`);
    const fallback = parseExcelFallback(sheet);
    if (fallback.transactions.length > 0) {
      return { ...fallback, format: format || fallback.format, weakDetection: true };
    }
    if (errors.length === 0) {
      errors.push(`No se encontraron transacciones validas. Formato: ${format}. Columnas: ${headers.filter(h => h).join(", ")}`);
    }
  }

  return { format, transactions, errors, finalBalances, weakDetection };
}

/** Fallback parser when no header row is detected — uses sheet_to_json with multiple header attempts */
function parseExcelFallback(sheet: XLSX.WorkSheet): ParseResult {
  // Try with different header rows (0, 1, 2, ... up to 10)
  for (let headerRow = 0; headerRow <= 10; headerRow++) {
    const result = tryFallbackFromRow(sheet, headerRow);
    if (result.transactions.length > 0) return { ...result, weakDetection: true };
  }
  return { format: "excel", transactions: [], errors: ["No se encontraron transacciones en ninguna fila"], weakDetection: true };
}

function tryFallbackFromRow(sheet: XLSX.WorkSheet, startRow: number): ParseResult {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", range: startRow });
  if (rows.length === 0) {
    return { format: "excel", transactions: [], errors: [] };
  }

  const rawHeaders = Object.keys(rows[0]);
  const headers = rawHeaders.map(normalizeHeader);

  const dateIdx = findColIndex(headers, DATE_PATTERNS);
  const amountIdx = findColIndex(headers, AMOUNT_PATTERNS);
  const debitIdx = findColIndex(headers, EXPENSE_PATTERNS);
  const creditIdx = findColIndex(headers, INCOME_PATTERNS);
  const currencyIdx = findColIndex(headers, CURRENCY_PATTERNS);

  // Try to find any description column
  const descIdxList: number[] = [];
  for (const dc of DESC_PATTERNS) {
    const idx = findColIndex(headers, [dc]);
    if (idx >= 0 && !descIdxList.includes(idx)) descIdxList.push(idx);
  }

  if (dateIdx === -1 && amountIdx === -1 && debitIdx === -1) {
    return {
      format: "excel",
      transactions: [],
      errors: [`No se detectaron columnas. Columnas: ${rawHeaders.join(", ")}`],
    };
  }

  const transactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const values = rawHeaders.map((h) => row[h]);

    const date = dateIdx >= 0 ? parseDateValue(values[dateIdx]) : null;
    if (!date || !isValidDate(date)) continue;

    const descParts: string[] = [];
    for (const di of descIdxList) {
      const val = String(values[di] ?? "").trim();
      if (val) descParts.push(val);
    }
    const description = descParts.join(" — ").slice(0, 300) || "Sin descripcion";

    const currency = currencyIdx >= 0
      ? String(values[currencyIdx] ?? "EUR").trim().toUpperCase()
      : "EUR";

    let amount: number | null = null;
    let direction: "income" | "expense" = "expense";
    const hasSplitCols = debitIdx >= 0 || creditIdx >= 0;

    if (hasSplitCols) {
      const debitVal = debitIdx >= 0 ? parseAmountValue(values[debitIdx]) : null;
      const creditVal = creditIdx >= 0 ? parseAmountValue(values[creditIdx]) : null;

      if (creditVal && creditVal > 0) {
        amount = creditVal;
        direction = "income";
      } else if (debitVal && debitVal > 0) {
        amount = debitVal;
        direction = "expense";
      }
    }

    if (amount === null && amountIdx >= 0) {
      const rawAmount = parseAmountValue(values[amountIdx]);
      if (rawAmount !== null && rawAmount !== 0) {
        amount = Math.abs(rawAmount);
        direction = rawAmount >= 0 ? "income" : "expense";
      }
    }

    if (amount === null || amount === 0) continue;

    transactions.push({
      date,
      description,
      amount: Math.round(amount * 100) / 100,
      currency: currency || "EUR",
      direction,
    });
  }

  return { format: "excel", transactions, errors };
}

// Export utility functions for testing
export const _testing = {
  stripAccents,
  normalizeHeader,
  findColIndex,
  detectBank,
  headerMatches,
  parseAmountValue,
  parseDateValue,
  isValidDate,
};
