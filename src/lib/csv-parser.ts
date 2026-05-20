export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number;
  currency: string;
  direction: "income" | "expense";
  account?: string;
  is_internal?: boolean;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  format: string;
  errors: string[];
  finalBalances?: Record<string, number>; // product → final balance from bank statement
  /**
   * true when the parser's output should not be trusted as the final answer:
   * - generic/auto-detected path
   * - unknown bank where heuristics picked up garbage
   * - non-empty errors alongside few transactions
   *
   * The API layer uses this to force AI fallback even when transactions.length > 0.
   */
  weakDetection?: boolean;
  /**
   * true when the consistency check del vision parser sigue fallando tras un
   * segundo intento con prompt estricto. El UI debe avisar al usuario y
   * pedirle que revise manualmente antes de importar.
   */
  needsManualReview?: boolean;
}

// Simple CSV parser that handles quoted fields — comma-separated only
// For semicolon-separated files, use parseRow(row, ";")
function parseCSVRow(row: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < row.length) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
    i++;
  }
  fields.push(current.trim());
  return fields;
}

// Detect CSV separator
function detectSeparator(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  return semicolons > commas ? ";" : ",";
}

// Parse row using detected separator
function parseRow(row: string, sep: string): string[] {
  if (sep === ",") return parseCSVRow(row);

  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (char === sep && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

// Convert various date formats to YYYY-MM-DD
// European convention: DD/MM/YYYY (day first) — used by Revolut, ING, N26, MyInvestor
function normalizeDate(raw: string): string {
  raw = raw.trim();

  // YYYYMMDD (ING)
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  // YYYY-MM-DD already (ISO)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  // DD/MM/YYYY (European — all supported banks use this)
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(raw)) {
    const parts = raw.slice(0, 10).split("/");
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    return `${parts[2]}-${month}-${day}`;
  }

  // DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}/.test(raw)) {
    const [d, m, y] = raw.slice(0, 10).split("-");
    return `${y}-${m}-${d}`;
  }

  // DD.MM.YYYY (some German/Dutch banks)
  if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(raw)) {
    const parts = raw.split(".");
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    return `${parts[2].slice(0, 4)}-${month}-${day}`;
  }

  // MM/DD/YYYY — only if month <= 12 and day > 12 (disambiguation)
  // This is a risky format, so we only use it as last resort
  // Most European banks use DD/MM/YYYY which is handled above

  // "DD Mon YYYY" or "DD-Mon-YYYY" (e.g. "05 Jan 2026", "05-Jan-2026")
  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    ene: "01", abr: "04", ago: "08", dic: "12", // Spanish
    mrt: "03", mei: "05", okt: "10", // Dutch
  };
  const monthMatch = raw.match(/^(\d{1,2})[\s-]([a-zA-Z]{3})[\s-](\d{4})/);
  if (monthMatch) {
    const day = monthMatch[1].padStart(2, "0");
    const mon = monthNames[monthMatch[2].toLowerCase().slice(0, 3)];
    if (mon) return `${monthMatch[3]}-${mon}-${day}`;
  }

  // "YYYY-MM-DD HH:MM:SS" — Revolut and others with time component
  // (catches cases where the regex at line 94 missed due to extra chars)
  const isoWithTime = raw.match(/^(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}/);
  if (isoWithTime) {
    return isoWithTime[1];
  }

  // Try native Date parse as last resort
  // Use local date extraction to avoid UTC timezone shifts
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    if (y >= 2000 && y <= 2100) {
      return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }

  return raw;
}

// Validate that a date string is reasonable (not in the far future, not before 2000)
function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  if (year < 2000 || year > new Date().getFullYear() + 1) return false;
  return true;
}

// Parse amount string that may use comma as decimal separator
function parseAmount(raw: string): number {
  // Normalise Unicode dashes (U+2212 minus, en-dash, em-dash) to ASCII "-".
  // Some banks (Santander ES) use U+2212 for expense amounts.
  let cleaned = raw.trim().replace(/[\u2212\u2013\u2014\u2010\u2011\u2012\u2015]/g, "-").replace(/\s/g, "");
  // Remove currency symbols that might be in the value
  cleaned = cleaned.replace(/[€$£¥₹]/g, "").trim();

  // Handle parentheses as negative: (123.45) → -123.45
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    cleaned = "-" + cleaned.slice(1, -1);
  }

  // Preserve the sign
  const sign = cleaned.startsWith("-") ? -1 : 1;
  cleaned = cleaned.replace(/^[+-]/, "");

  // European format with thousands dots and comma decimal: 1.234,56 → 1234.56
  // Also handles: -1.234,56
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(cleaned)) {
    return sign * parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  }

  // European format comma decimal without thousands: 1234,56 or 0,50
  if (/^\d+(,\d{1,2})$/.test(cleaned)) {
    return sign * parseFloat(cleaned.replace(",", "."));
  }

  // US/UK format with thousands commas and dot decimal: 1,234.56
  if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(cleaned)) {
    return sign * parseFloat(cleaned.replace(/,/g, ""));
  }

  // Plain number (possibly with dot decimal): 1234.56
  return sign * parseFloat(cleaned);
}

// Detect format by examining header row
export function detectFormat(csvText: string): string {
  const firstLine = csvText.split("\n")[0].toLowerCase();

  // Revolut — English or Spanish headers
  if (
    (firstLine.includes("started date") && firstLine.includes("completed date")) ||
    (firstLine.includes("fecha de inicio") && firstLine.includes("fecha de finalizaci"))
  ) {
    return "revolut";
  }

  if (firstLine.includes("naam / omschrijving") || firstLine.includes("af bij")) {
    return "ing";
  }

  if (
    firstLine.includes("payee") &&
    firstLine.includes("payment reference")
  ) {
    return "n26";
  }

  // MyInvestor — "Fecha de operación;Fecha de valor;Concepto;Importe;Divisa"
  // Must have "fecha de operación" or semicolons (MyInvestor uses ;) to avoid BBVA collision
  if (
    (firstLine.includes("fecha de operaci") || firstLine.includes("fecha de valor")) &&
    (firstLine.includes("concepto") && firstLine.includes("importe")) &&
    !firstLine.includes("movimiento") && !firstLine.includes("disponible")
  ) {
    return "myinvestor";
  }

  // Wise — "TransferWise ID" or "Date,Amount,Currency,Description" pattern
  if (
    firstLine.includes("transferwise id") ||
    (firstLine.includes("source currency") && firstLine.includes("target currency")) ||
    (firstLine.includes("date") && firstLine.includes("amount") && firstLine.includes("merchant"))
  ) {
    return "wise";
  }

  // Bunq — "Date,Interest Date,Amount,Account,Counterparty,Name,Description"
  // or Dutch: "Datum,Rentedatum,Bedrag,Rekening,Tegenrekening,Naam,Omschrijving"
  if (
    (firstLine.includes("interest date") || firstLine.includes("rentedatum")) &&
    (firstLine.includes("counterparty") || firstLine.includes("tegenrekening"))
  ) {
    return "bunq";
  }
  // Bunq alternative format with "Amount" and "Name" and "Description"
  if (
    firstLine.includes("bunq") ||
    (firstLine.includes("interest date") && firstLine.includes("amount"))
  ) {
    return "bunq";
  }

  // ABN AMRO — "Rekeningnummer,Muntsoort,Transactiedatum,..."
  // or "accountNumber,mutationcode,..."
  if (
    firstLine.includes("rekeningnummer") ||
    firstLine.includes("transactiedatum") ||
    (firstLine.includes("mutationcode") && firstLine.includes("accountnumber"))
  ) {
    return "abn_amro";
  }

  // Rabobank — "IBAN,Muntsoort,BIC,Volgnr,Datum,..."
  if (
    firstLine.includes("volgnr") ||
    (firstLine.includes("iban") && firstLine.includes("muntsoort") && firstLine.includes("bic"))
  ) {
    return "rabobank";
  }

  // BBVA — "Fecha,F.Valor,Concepto,Movimiento,Importe,Divisa,Disponible"
  // Also: "Fecha,Fecha valor,Concepto,Movimiento,Importe,Divisa,Disponible,Observaciones"
  if (
    (firstLine.includes("movimiento") && firstLine.includes("disponible")) ||
    (firstLine.includes("f.valor") && firstLine.includes("importe")) ||
    (firstLine.includes("fecha valor") && firstLine.includes("importe") && firstLine.includes("movimiento"))
  ) {
    return "bbva";
  }

  // Santander — "FECHA,CONCEPTO,IMPORTE,SALDO"
  // or "Fecha,Concepto,Fecha valor,Importe,Saldo"
  if (
    (firstLine.includes("fecha") && firstLine.includes("concepto") && firstLine.includes("saldo")) &&
    !firstLine.includes("fecha de valor") // avoid collision with myinvestor
  ) {
    return "santander";
  }

  // CaixaBank — "Fecha,Concepto,Importe,Saldo" or "Data,Concepte,Import,Saldo"
  if (
    (firstLine.includes("data") && firstLine.includes("concepte") && firstLine.includes("import")) ||
    (firstLine.includes("movimiento") && firstLine.includes("oficina"))
  ) {
    return "caixabank";
  }

  return "generic";
}

// Revolut internal movement patterns (savings, pockets, crypto, currency conversion, interest)
const REVOLUT_INTERNAL_PATTERNS = [
  // Savings vault
  "savings vault topup",
  "desde eur ahorros",
  "a eur ahorros",
  "from ahorros",
  // Cuenta remunerada
  "desde eur cuenta remunerada",
  "a eur cuenta remunerada",
  // Pockets
  "al pocket",
  "retirada del pocket",
  // Interest (stays within Revolut)
  "interest earned",
  "interés neto pagado",
  // Revolut X / investments / crypto
  "eur revolut x",
  "from investment account",
  "transfer to revolut digital assets",
  "transfer from revolut digital assets",
  // Currency conversion
  "conversión a ",
  // Other
  "closing transaction",
];

export function isRevolutInternal(description: string): boolean {
  const lower = description.toLowerCase();
  return REVOLUT_INTERNAL_PATTERNS.some((pattern) => lower.includes(pattern));
}

// Find header index supporting multiple languages
function findHeader(headers: string[], ...variants: string[]): number {
  for (const v of variants) {
    const idx = headers.findIndex((h) => h.includes(v));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Parse Revolut CSV (English or Spanish headers)
export function parseRevolut(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "revolut", errors: ["Empty file"] };
  }

  // Auto-detect separator (Revolut may use comma or semicolon depending on locale)
  const sep = detectSeparator(lines[0]);
  const headers = parseRow(lines[0], sep).map((h) => h.toLowerCase().replace(/"/g, ""));
  const idx = {
    type: findHeader(headers, "type", "tipo"),
    product: findHeader(headers, "product", "producto"),
    startedDate: findHeader(headers, "started date", "fecha de inicio"),
    completedDate: findHeader(headers, "completed date", "fecha de finalizaci"),
    description: findHeader(headers, "description", "descripci"),
    amount: findHeader(headers, "amount", "importe"),
    fee: findHeader(headers, "fee", "comisi"),
    currency: findHeader(headers, "currency", "divisa", "moneda"),
    state: findHeader(headers, "state", "estado"),
    balance: findHeader(headers, "balance", "saldo"),
  };

  const COMPLETED_STATES = new Set(["COMPLETED", "COMPLETADO"]);

  if (process.env.DEBUG_IMPORT === "1") {
    console.log(`[revolut-parser] ${lines.length - 1} data lines, sep="${sep === "," ? "comma" : sep === ";" ? "semicolon" : "tab"}", headers=[${headers.join("|")}]`);
    console.log(`[revolut-parser] Column indices: startedDate=${idx.startedDate}, description=${idx.description}, amount=${idx.amount}, currency=${idx.currency}, state=${idx.state}, balance=${idx.balance}, product=${idx.product}`);
  }

  // Map Revolut product names to sub-account slugs
  const PRODUCT_MAP: Record<string, string> = {
    // Checking / Current account
    actual: "revolut",
    current: "revolut",
    "cuenta corriente": "revolut",
    // Savings account (multiple Spanish names used by Revolut)
    ahorros: "revolut-ahorros",
    savings: "revolut-ahorros",
    "depósito": "revolut-ahorros",
    "deposito": "revolut-ahorros",
    "cuenta remunerada": "revolut-ahorros",
    "flexible account": "revolut-ahorros",
    // Pockets
    pockets: "revolut-pockets",
    "pockets personales y grupales": "revolut-pockets",
    "bolsillos": "revolut-pockets",
  };

  // Track last balance per product for finalBalances
  const lastBalance: Record<string, number> = {};

  // Skip reason counters for diagnostics
  let skipShortRow = 0, skipState = 0, skipAmount = 0, skipDate = 0, skipError = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i], sep);
    if (row.length < 4) { skipShortRow++; continue; }

    try {
      const state = idx.state >= 0 ? row[idx.state]?.replace(/"/g, "").trim() : "";
      if (state && !COMPLETED_STATES.has(state.toUpperCase())) { skipState++; continue; }

      const rawProduct = idx.product >= 0 ? row[idx.product]?.replace(/"/g, "").trim().toLowerCase() : "";
      const account = PRODUCT_MAP[rawProduct] ?? "revolut";

      const rawDate = idx.startedDate >= 0 ? row[idx.startedDate] : row[2];
      const description =
        idx.description >= 0 ? row[idx.description].replace(/"/g, "").trim() : "";
      const rawAmount = idx.amount >= 0 ? row[idx.amount].replace(/"/g, "").trim() : "0";
      const currency =
        idx.currency >= 0 ? row[idx.currency].replace(/"/g, "").trim().toUpperCase() : "EUR";

      // Use parseAmount instead of parseFloat to handle European comma decimals
      const amount = parseAmount(rawAmount);
      if (isNaN(amount) || amount === 0) {
        skipAmount++;
        continue;
      }

      // Track last balance per account from the Saldo column
      if (idx.balance >= 0) {
        const rawBalance = row[idx.balance]?.replace(/"/g, "").trim();
        if (rawBalance) {
          const bal = parseAmount(rawBalance);
          if (!isNaN(bal)) {
            lastBalance[account] = bal;
          }
        }
      }

      const date = normalizeDate(rawDate.replace(/"/g, "").trim());
      if (!isValidDate(date)) {
        skipDate++;
        if (skipDate <= 3) errors.push(`Row ${i + 1}: fecha inválida "${rawDate}"`);
        continue;
      }

      transactions.push({
        date,
        description,
        amount: Math.abs(amount),
        currency,
        direction: amount < 0 ? "expense" : "income",
        account,
        is_internal: isRevolutInternal(description),
      });
    } catch (e) {
      skipError++;
      if (skipError <= 3) errors.push(`Row ${i + 1}: ${e}`);
    }
  }

  if (process.env.DEBUG_IMPORT === "1") {
    console.log(`[revolut-parser] Result: ${transactions.length} transactions, skipped: shortRow=${skipShortRow} state=${skipState} amount=${skipAmount} date=${skipDate} error=${skipError}`);
  }

  return { transactions, format: "revolut", errors, finalBalances: lastBalance };
}

// Parse ING NL CSV
export function parseING(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "ing", errors: ["Empty file"] };
  }

  const sep = detectSeparator(lines[0]);
  const headers = parseRow(lines[0], sep).map((h) =>
    h.toLowerCase().replace(/"/g, "").trim()
  );

  const idx = {
    datum: headers.indexOf("datum"),
    naam: headers.findIndex((h) => h.includes("naam")),
    bedrag: headers.findIndex((h) => h.includes("bedrag")),
    afBij: headers.findIndex((h) => h.includes("af bij") || h === "af bij"),
  };

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i], sep);
    if (row.length < 3) continue;

    try {
      const rawDate = row[idx.datum]?.replace(/"/g, "").trim() ?? "";
      const description = row[idx.naam]?.replace(/"/g, "").trim() ?? "";
      const rawAmount = row[idx.bedrag]?.replace(/"/g, "").trim() ?? "0";
      const afBij = row[idx.afBij]?.replace(/"/g, "").trim().toLowerCase() ?? "";

      const amount = parseAmount(rawAmount);
      if (isNaN(amount)) {
        errors.push(`Row ${i + 1}: invalid amount "${rawAmount}"`);
        continue;
      }

      const direction: "income" | "expense" = afBij === "bij" ? "income" : "expense";
      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) {
        errors.push(`Row ${i + 1}: fecha inválida "${rawDate}"`);
        continue;
      }

      transactions.push({
        date,
        description,
        amount: Math.abs(amount),
        currency: "EUR",
        direction,
        account: "ing",
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e}`);
    }
  }

  return { transactions, format: "ing", errors };
}

// Parse N26 CSV
export function parseN26(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "n26", errors: ["Empty file"] };
  }

  const sep = detectSeparator(lines[0]);
  const headers = parseRow(lines[0], sep).map((h) =>
    h.toLowerCase().replace(/"/g, "").trim()
  );

  const idx = {
    date: headers.indexOf("date"),
    payee: headers.indexOf("payee"),
    amount: headers.findIndex((h) => h.includes("amount (eur)")),
  };

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i], sep);
    if (row.length < 3) continue;

    try {
      const rawDate = row[idx.date]?.replace(/"/g, "").trim() ?? "";
      const description = row[idx.payee]?.replace(/"/g, "").trim() ?? "";
      const rawAmount = row[idx.amount]?.replace(/"/g, "").trim() ?? "0";

      const amount = parseAmount(rawAmount);
      if (isNaN(amount)) {
        errors.push(`Row ${i + 1}: invalid amount "${rawAmount}"`);
        continue;
      }

      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) {
        errors.push(`Row ${i + 1}: fecha inválida "${rawDate}"`);
        continue;
      }

      transactions.push({
        date,
        description,
        amount: Math.abs(amount),
        currency: "EUR",
        direction: amount < 0 ? "expense" : "income",
        account: "n26",
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e}`);
    }
  }

  return { transactions, format: "n26", errors };
}

// Generic parser: user maps columns (kept for backwards compatibility with manual mapping)
export function parseGeneric(
  csvText: string,
  mapping: {
    date: number;
    description: number;
    amount: number;
    currency?: number;
  }
): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "generic", errors: ["Empty file"] };
  }

  const sep = detectSeparator(lines[0]);

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i], sep);
    if (row.length < 2) continue;

    try {
      const rawDate = row[mapping.date]?.replace(/"/g, "").trim() ?? "";
      const description = row[mapping.description]?.replace(/"/g, "").trim() ?? "";
      const rawAmount = row[mapping.amount]?.replace(/"/g, "").trim() ?? "0";
      const currency =
        mapping.currency !== undefined
          ? row[mapping.currency]?.replace(/"/g, "").trim().toUpperCase() ?? "EUR"
          : "EUR";

      const amount = parseAmount(rawAmount);
      if (isNaN(amount)) {
        errors.push(`Row ${i + 1}: invalid amount "${rawAmount}"`);
        continue;
      }

      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) {
        errors.push(`Row ${i + 1}: fecha inválida "${rawDate}"`);
        continue;
      }

      transactions.push({
        date,
        description,
        amount: Math.abs(amount),
        currency,
        direction: amount < 0 ? "expense" : "income",
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e}`);
    }
  }

  return { transactions, format: "generic", errors };
}

// ─── Smart column auto-detection for unknown bank formats ───

// Known header patterns for date, description, amount, and currency columns
const DATE_HEADERS = [
  "date", "datum", "fecha", "data", "booking date", "value date",
  "transaction date", "boekingsdatum", "transactiedatum", "rentedatum",
  "interest date", "fecha valor", "fecha operacion", "fecha de operación",
  "booking", "fechaoperacion", "fechavalor",
];

const DESCRIPTION_HEADERS = [
  "description", "omschrijving", "descripcion", "descripción", "concepto",
  "concepte", "name", "naam", "payee", "merchant", "beneficiary",
  "tegenrekening", "counterparty", "detail", "details", "detalle",
  "narrative", "reference", "referencia", "texto", "movimiento",
  "mededelingen", "betalingsreferentie",
];

const AMOUNT_HEADERS = [
  "amount", "bedrag", "importe", "import", "monto", "valor", "value",
  "betrag", "sum", "total", "transacción", "transaccion",
];

const DEBIT_HEADERS = [
  "debit", "debe", "cargo", "af", "withdrawal", "ausgabe", "gasto",
  "debet",
];

const CREDIT_HEADERS = [
  "credit", "haber", "abono", "bij", "deposit", "einnahme", "ingreso",
  "tegoed",
];

const CURRENCY_HEADERS = [
  "currency", "divisa", "moneda", "muntsoort", "währung", "devise",
];

const BALANCE_HEADERS = [
  "balance", "saldo", "disponible", "running balance",
];

// Direction indicator headers (ING-style "Af Bij" = debit/credit indicator)
const DIRECTION_HEADERS = [
  "af bij", "d/c", "dc", "debit/credit", "tipo", "type", "credit/debit",
  "creditdebit",
];

function matchesAny(header: string, patterns: string[]): boolean {
  const h = header.toLowerCase().trim();
  return patterns.some((p) => h === p || h.includes(p));
}

// Score a column's data to determine if it contains dates
function scoreDateColumn(values: string[]): number {
  let score = 0;
  for (const v of values) {
    const trimmed = v.replace(/"/g, "").trim();
    if (!trimmed) continue;
    const normalized = normalizeDate(trimmed);
    if (isValidDate(normalized)) score++;
  }
  return values.length > 0 ? score / values.length : 0;
}

// Score a column's data to determine if it contains amounts
function scoreAmountColumn(values: string[]): number {
  let score = 0;
  for (const v of values) {
    const trimmed = v.replace(/"/g, "").trim();
    if (!trimmed) continue;
    const amount = parseAmount(trimmed);
    if (!isNaN(amount) && trimmed.match(/[\d.,]+/)) score++;
  }
  return values.length > 0 ? score / values.length : 0;
}

// Score a column's data to determine if it contains text descriptions
function scoreTextColumn(values: string[]): number {
  let score = 0;
  for (const v of values) {
    const trimmed = v.replace(/"/g, "").trim();
    if (!trimmed) continue;
    // Text should contain letters and be longer than just a number or date
    if (/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(trimmed) && trimmed.length > 3) score++;
  }
  return values.length > 0 ? score / values.length : 0;
}

interface SmartMapping {
  dateCol: number;
  descriptionCol: number;
  amountCol: number;       // single amount column (negative = expense)
  debitCol: number;        // separate debit column (-1 if not found)
  creditCol: number;       // separate credit column (-1 if not found)
  currencyCol: number;     // -1 if not found
  directionCol: number;    // -1 if not found (ING-style Af/Bij indicator)
  balanceCol: number;      // -1 if not found
  confidence: number;      // 0-1 how confident we are in the mapping
}

function autoDetectColumns(headers: string[], dataRows: string[][]): SmartMapping {
  const numCols = headers.length;
  const cleanHeaders = headers.map((h) => h.toLowerCase().replace(/"/g, "").trim());

  // Step 1: Score by header name matching
  const headerScores = {
    date: new Array(numCols).fill(0),
    description: new Array(numCols).fill(0),
    amount: new Array(numCols).fill(0),
    debit: new Array(numCols).fill(0),
    credit: new Array(numCols).fill(0),
    currency: new Array(numCols).fill(0),
    direction: new Array(numCols).fill(0),
    balance: new Array(numCols).fill(0),
  };

  for (let i = 0; i < numCols; i++) {
    if (matchesAny(cleanHeaders[i], DATE_HEADERS)) headerScores.date[i] = 1;
    if (matchesAny(cleanHeaders[i], DESCRIPTION_HEADERS)) headerScores.description[i] = 1;
    if (matchesAny(cleanHeaders[i], AMOUNT_HEADERS)) headerScores.amount[i] = 1;
    if (matchesAny(cleanHeaders[i], DEBIT_HEADERS)) headerScores.debit[i] = 1;
    if (matchesAny(cleanHeaders[i], CREDIT_HEADERS)) headerScores.credit[i] = 1;
    if (matchesAny(cleanHeaders[i], CURRENCY_HEADERS)) headerScores.currency[i] = 1;
    if (matchesAny(cleanHeaders[i], DIRECTION_HEADERS)) headerScores.direction[i] = 1;
    if (matchesAny(cleanHeaders[i], BALANCE_HEADERS)) headerScores.balance[i] = 1;
  }

  // Step 2: Score by data pattern analysis (sample up to 10 rows)
  const sampleSize = Math.min(dataRows.length, 10);
  const sampleRows = dataRows.slice(0, sampleSize);

  const colValues: string[][] = [];
  for (let c = 0; c < numCols; c++) {
    colValues[c] = sampleRows.map((row) => row[c] ?? "");
  }

  const dataScores = {
    date: colValues.map((vals) => scoreDateColumn(vals)),
    amount: colValues.map((vals) => scoreAmountColumn(vals)),
    text: colValues.map((vals) => scoreTextColumn(vals)),
  };

  // Step 3: Combine header + data scores and pick best columns
  // Combined score: header match is worth 0.6, data pattern is worth 0.4
  const combined = {
    date: new Array(numCols).fill(0),
    description: new Array(numCols).fill(0),
    amount: new Array(numCols).fill(0),
  };

  for (let i = 0; i < numCols; i++) {
    combined.date[i] = headerScores.date[i] * 0.6 + dataScores.date[i] * 0.4;
    combined.description[i] = headerScores.description[i] * 0.6 + dataScores.text[i] * 0.4;
    combined.amount[i] = headerScores.amount[i] * 0.6 + dataScores.amount[i] * 0.4;
  }

  // Pick best column for each role, avoiding collisions
  const used = new Set<number>();

  const pickBest = (scores: number[]): number => {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < scores.length; i++) {
      if (!used.has(i) && scores[i] > bestScore) {
        best = i;
        bestScore = scores[i];
      }
    }
    if (best >= 0) used.add(best);
    return best;
  };

  // Date first (most reliable pattern)
  let dateCol = pickBest(combined.date);

  // If no header/data match for date, try first column with date-like data
  if (dateCol < 0) {
    for (let i = 0; i < numCols; i++) {
      if (!used.has(i) && dataScores.date[i] > 0.5) {
        dateCol = i;
        used.add(i);
        break;
      }
    }
  }

  // Amount — check for single column or debit/credit pair
  let amountCol = pickBest(combined.amount);
  let debitCol = -1;
  let creditCol = -1;

  // Check if there are separate debit/credit columns
  const debitIdx = headerScores.debit.findIndex((s, i) => s > 0 && !used.has(i));
  const creditIdx = headerScores.credit.findIndex((s, i) => s > 0 && !used.has(i));

  if (debitIdx >= 0 && creditIdx >= 0) {
    debitCol = debitIdx;
    creditCol = creditIdx;
    used.add(debitIdx);
    used.add(creditIdx);
    // If we found debit/credit pair, amount col is less important
    if (amountCol >= 0 && amountCol !== debitIdx && amountCol !== creditIdx) {
      // Keep amount col too, but prefer debit/credit
    }
  } else if (amountCol < 0) {
    // No amount header match — find column with highest amount data score
    for (let i = 0; i < numCols; i++) {
      if (!used.has(i) && dataScores.amount[i] > 0.5) {
        amountCol = i;
        used.add(i);
        break;
      }
    }
  }

  // Description — best text column that isn't already used
  let descriptionCol = -1;
  {
    let bestScore = 0;
    for (let i = 0; i < numCols; i++) {
      if (!used.has(i) && combined.description[i] > bestScore) {
        descriptionCol = i;
        bestScore = combined.description[i];
      }
    }
    // Fallback: pick column with highest text score
    if (descriptionCol < 0) {
      for (let i = 0; i < numCols; i++) {
        if (!used.has(i) && dataScores.text[i] > bestScore) {
          descriptionCol = i;
          bestScore = dataScores.text[i];
        }
      }
    }
    if (descriptionCol >= 0) used.add(descriptionCol);
  }

  // Optional columns
  const currencyCol = headerScores.currency.findIndex((s, i) => s > 0 && !used.has(i));
  const directionCol = headerScores.direction.findIndex((s, i) => s > 0 && !used.has(i));
  const balanceCol = headerScores.balance.findIndex((s, i) => s > 0 && !used.has(i));

  // Calculate confidence
  let confidence = 0;
  if (dateCol >= 0) confidence += 0.35;
  if (descriptionCol >= 0) confidence += 0.25;
  if (amountCol >= 0 || (debitCol >= 0 && creditCol >= 0)) confidence += 0.3;
  if (currencyCol >= 0) confidence += 0.05;
  if (balanceCol >= 0) confidence += 0.05;

  return {
    dateCol,
    descriptionCol,
    amountCol,
    debitCol,
    creditCol,
    currencyCol: currencyCol >= 0 ? currencyCol : -1,
    directionCol: directionCol >= 0 ? directionCol : -1,
    balanceCol: balanceCol >= 0 ? balanceCol : -1,
    confidence,
  };
}

// Smart generic parser — auto-detects columns from headers + data patterns
export function parseSmartGeneric(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "generic", errors: ["Archivo vacío"] };
  }

  const sep = detectSeparator(lines[0]);

  // Some bank CSVs have metadata rows before the actual headers
  // Try to find the actual header row by looking for the row with the most columns
  let headerIndex = 0;
  let maxCols = 0;
  const parsedLines: string[][] = [];

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const parsed = parseRow(lines[i], sep);
    parsedLines.push(parsed);
    if (parsed.length > maxCols) {
      maxCols = parsed.length;
      // Only consider the first few rows as potential headers
      if (i < 5) headerIndex = i;
    }
  }

  // Re-check: header row should have text (not just numbers)
  for (let i = 0; i <= Math.min(4, parsedLines.length - 1); i++) {
    const row = parsedLines[i];
    const textCells = row.filter((c) => /[a-zA-ZáéíóúñÁÉÍÓÚÑ]{2,}/.test(c.replace(/"/g, "")));
    if (textCells.length >= 2 && row.length >= maxCols - 1) {
      headerIndex = i;
      break;
    }
  }

  const headers = parseRow(lines[headerIndex], sep).map((h) => h.replace(/"/g, "").trim());

  // Parse data rows
  const dataRows: string[][] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const row = parseRow(lines[i], sep);
    if (row.length >= 2) dataRows.push(row);
  }

  if (dataRows.length === 0) {
    return { transactions, format: "generic", errors: ["No se encontraron filas de datos"] };
  }

  const mapping = autoDetectColumns(headers, dataRows);

  if (mapping.dateCol < 0 || (mapping.amountCol < 0 && mapping.debitCol < 0)) {
    return {
      transactions,
      format: "generic",
      errors: [
        `No se pudieron detectar las columnas automáticamente. Columnas encontradas: ${headers.join(", ")}. ` +
        `Se necesita al menos una columna de fecha y una de importe.`
      ],
    };
  }

  // If no description column found, we'll concatenate available text fields
  const descCol = mapping.descriptionCol;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    try {
      // Date
      const rawDate = row[mapping.dateCol]?.replace(/"/g, "").trim() ?? "";
      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) {
        errors.push(`Fila ${headerIndex + i + 2}: fecha inválida "${rawDate}"`);
        continue;
      }

      // Description
      let description = "";
      if (descCol >= 0) {
        description = row[descCol]?.replace(/"/g, "").trim() ?? "";
      }
      // If description is empty or missing, try to build one from other text columns
      if (!description) {
        const textParts: string[] = [];
        for (let c = 0; c < row.length; c++) {
          if (c === mapping.dateCol || c === mapping.amountCol ||
              c === mapping.debitCol || c === mapping.creditCol ||
              c === mapping.currencyCol || c === mapping.balanceCol) continue;
          const val = row[c]?.replace(/"/g, "").trim();
          if (val && /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(val) && val.length > 2) {
            textParts.push(val);
          }
        }
        description = textParts.join(" — ") || "Transacción importada";
      }

      // Amount & direction
      let amount: number;
      let direction: "income" | "expense";

      if (mapping.debitCol >= 0 && mapping.creditCol >= 0) {
        // Separate debit/credit columns
        const debitRaw = row[mapping.debitCol]?.replace(/"/g, "").trim() ?? "";
        const creditRaw = row[mapping.creditCol]?.replace(/"/g, "").trim() ?? "";
        const debitAmount = debitRaw ? parseAmount(debitRaw) : 0;
        const creditAmount = creditRaw ? parseAmount(creditRaw) : 0;

        if (creditAmount > 0) {
          amount = creditAmount;
          direction = "income";
        } else if (debitAmount > 0) {
          amount = debitAmount;
          direction = "expense";
        } else if (debitAmount < 0) {
          // Some banks use negative in debit column for credits
          amount = Math.abs(debitAmount);
          direction = "income";
        } else {
          continue; // skip zero rows
        }
      } else if (mapping.amountCol >= 0) {
        // Single amount column
        const rawAmount = row[mapping.amountCol]?.replace(/"/g, "").trim() ?? "0";
        amount = parseAmount(rawAmount);
        if (isNaN(amount)) {
          errors.push(`Fila ${headerIndex + i + 2}: importe inválido "${rawAmount}"`);
          continue;
        }

        // Check if there's a direction indicator column (like ING's "Af Bij")
        if (mapping.directionCol >= 0) {
          const dir = row[mapping.directionCol]?.replace(/"/g, "").trim().toLowerCase() ?? "";
          // "Bij" / "credit" / "C" / "haber" / "abono" = income
          // "Af" / "debit" / "D" / "debe" / "cargo" = expense
          const isCredit = ["bij", "credit", "c", "haber", "abono", "cr", "+"].includes(dir);
          direction = isCredit ? "income" : "expense";
          amount = Math.abs(amount);
        } else {
          direction = amount < 0 ? "expense" : "income";
          amount = Math.abs(amount);
        }

        if (amount === 0) continue;
      } else {
        continue;
      }

      // Currency
      let currency = "EUR";
      if (mapping.currencyCol >= 0) {
        const cur = row[mapping.currencyCol]?.replace(/"/g, "").trim().toUpperCase() ?? "";
        if (cur && /^[A-Z]{3}$/.test(cur)) currency = cur;
      }

      transactions.push({
        date,
        description,
        amount,
        currency,
        direction,
      });
    } catch (e) {
      errors.push(`Fila ${headerIndex + i + 2}: ${e}`);
    }
  }

  if (transactions.length === 0 && errors.length === 0) {
    errors.push("No se pudieron extraer transacciones. Verifica que el archivo tiene el formato correcto.");
  }

  return { transactions, format: "generic (auto)", errors, weakDetection: true };
}

// ─── Bank-specific parsers for common European banks ───

// Parse Bunq CSV (English or Dutch headers)
export function parseBunq(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "bunq", errors: ["Empty file"] };
  }

  const sep = detectSeparator(lines[0]);
  const headers = parseRow(lines[0], sep).map((h) => h.toLowerCase().replace(/"/g, "").trim());

  const idx = {
    date: findHeader(headers, "date", "datum"),
    amount: findHeader(headers, "amount", "bedrag"),
    name: findHeader(headers, "name", "naam"),
    description: findHeader(headers, "description", "omschrijving"),
    currency: findHeader(headers, "currency", "muntsoort", "valuta"),
    balance: findHeader(headers, "balance", "saldo"),
  };

  // Fallback: if no header match, try positional for common Bunq format
  // Bunq typical: Date, Interest Date, Amount, Account, Counterparty, Name, Description
  if (idx.date < 0) idx.date = 0;
  if (idx.amount < 0) idx.amount = findHeader(headers, "interest") >= 0 ? 2 : 1;
  if (idx.name < 0 && headers.length > 5) idx.name = 5;
  if (idx.description < 0 && headers.length > 6) idx.description = 6;

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i], sep);
    if (row.length < 3) continue;

    try {
      const rawDate = row[idx.date]?.replace(/"/g, "").trim() ?? "";
      const rawAmount = row[idx.amount]?.replace(/"/g, "").trim() ?? "0";
      const name = idx.name >= 0 ? row[idx.name]?.replace(/"/g, "").trim() ?? "" : "";
      const desc = idx.description >= 0 ? row[idx.description]?.replace(/"/g, "").trim() ?? "" : "";
      const description = name || desc || "Bunq transaction";
      const currency = idx.currency >= 0
        ? row[idx.currency]?.replace(/"/g, "").trim().toUpperCase() ?? "EUR"
        : "EUR";

      const amount = parseAmount(rawAmount);
      if (isNaN(amount) || amount === 0) continue;

      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) {
        errors.push(`Row ${i + 1}: fecha inválida "${rawDate}"`);
        continue;
      }

      transactions.push({
        date,
        description,
        amount: Math.abs(amount),
        currency,
        direction: amount < 0 ? "expense" : "income",
        account: "bunq",
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e}`);
    }
  }

  return { transactions, format: "bunq", errors };
}

// Parse ABN AMRO CSV
export function parseAbnAmro(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "abn_amro", errors: ["Empty file"] };
  }

  const sep = detectSeparator(lines[0]);
  const headers = parseRow(lines[0], sep).map((h) => h.toLowerCase().replace(/"/g, "").trim());

  const idx = {
    date: findHeader(headers, "transactiedatum", "boekingsdatum", "booking date", "datum"),
    amount: findHeader(headers, "bedrag", "amount", "transactiebedrag"),
    description: findHeader(headers, "omschrijving", "description", "naam"),
    currency: findHeader(headers, "muntsoort", "currency"),
    balance: findHeader(headers, "saldo", "balance"),
  };

  // ABN AMRO sometimes has no header — tab-separated columns:
  // Account, Currency, Date, Balance before, Balance after, Interest date, Amount, Description
  if (idx.date < 0 && headers.length >= 8) {
    idx.date = 2;
    idx.currency = 1;
    idx.amount = 6;
    idx.description = 7;
  }

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i], sep);
    if (row.length < 3) continue;

    try {
      const rawDate = idx.date >= 0 ? row[idx.date]?.replace(/"/g, "").trim() ?? "" : "";
      const rawAmount = idx.amount >= 0 ? row[idx.amount]?.replace(/"/g, "").trim() ?? "0" : "0";
      const description = idx.description >= 0 ? row[idx.description]?.replace(/"/g, "").trim() ?? "" : "";
      const currency = idx.currency >= 0 ? row[idx.currency]?.replace(/"/g, "").trim().toUpperCase() ?? "EUR" : "EUR";

      const amount = parseAmount(rawAmount);
      if (isNaN(amount) || amount === 0) continue;

      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) {
        errors.push(`Row ${i + 1}: fecha inválida "${rawDate}"`);
        continue;
      }

      transactions.push({
        date,
        description: description || "ABN AMRO transaction",
        amount: Math.abs(amount),
        currency,
        direction: amount < 0 ? "expense" : "income",
        account: "abn-amro",
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e}`);
    }
  }

  return { transactions, format: "abn_amro", errors };
}

// Parse Rabobank CSV
export function parseRabobank(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "rabobank", errors: ["Empty file"] };
  }

  const sep = detectSeparator(lines[0]);
  const headers = parseRow(lines[0], sep).map((h) => h.toLowerCase().replace(/"/g, "").trim());

  const idx = {
    date: findHeader(headers, "datum", "date"),
    amount: findHeader(headers, "bedrag", "amount"),
    name: findHeader(headers, "naam tegenpartij", "naam", "name"),
    description: findHeader(headers, "omschrijving", "description"),
    currency: findHeader(headers, "muntsoort", "munt", "currency"),
  };

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i], sep);
    if (row.length < 3) continue;

    try {
      const rawDate = idx.date >= 0 ? row[idx.date]?.replace(/"/g, "").trim() ?? "" : "";
      const rawAmount = idx.amount >= 0 ? row[idx.amount]?.replace(/"/g, "").trim() ?? "0" : "0";
      const name = idx.name >= 0 ? row[idx.name]?.replace(/"/g, "").trim() ?? "" : "";
      const desc = idx.description >= 0 ? row[idx.description]?.replace(/"/g, "").trim() ?? "" : "";
      const description = name || desc || "Rabobank transaction";
      const currency = idx.currency >= 0 ? row[idx.currency]?.replace(/"/g, "").trim().toUpperCase() ?? "EUR" : "EUR";

      const amount = parseAmount(rawAmount);
      if (isNaN(amount) || amount === 0) continue;

      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) {
        errors.push(`Row ${i + 1}: fecha inválida "${rawDate}"`);
        continue;
      }

      transactions.push({
        date,
        description,
        amount: Math.abs(amount),
        currency,
        direction: amount < 0 ? "expense" : "income",
        account: "rabobank",
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e}`);
    }
  }

  return { transactions, format: "rabobank", errors };
}

// Parse BBVA CSV (Spanish headers)
// BBVA format: "Fecha,F.Valor,Concepto,Movimiento,Importe,Divisa,Disponible,Observaciones"
// or variations with semicolons, different header casing, etc.
export function parseBBVA(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "bbva", errors: ["Archivo vacio"] };
  }

  // BBVA files may have metadata rows before headers — scan up to 10 rows
  let headerLineIdx = 0;
  const sep = detectSeparator(lines[0]);

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const testHeaders = parseRow(lines[i], sep).map((h) => h.toLowerCase().replace(/"/g, "").trim());
    const hasDate = testHeaders.some((h) => h === "fecha" || h.includes("fecha"));
    const hasAmount = testHeaders.some((h) => h.includes("importe") || h.includes("amount") || h.includes("cantidad"));
    if (hasDate && hasAmount) {
      headerLineIdx = i;
      break;
    }
  }

  const headers = parseRow(lines[headerLineIdx], sep).map((h) => h.toLowerCase().replace(/"/g, "").trim());

  const idx = {
    date: findHeader(headers, "fecha"),
    concepto: findHeader(headers, "concepto"),
    movimiento: findHeader(headers, "movimiento"),
    observaciones: findHeader(headers, "observaciones"),
    amount: findHeader(headers, "importe", "cantidad", "amount"),
    currency: findHeader(headers, "divisa", "moneda"),
    disponible: findHeader(headers, "disponible"),
  };

  if (idx.date < 0) idx.date = 0;
  if (idx.amount < 0) {
    for (let c = headers.length - 1; c >= 0; c--) {
      if (headers[c].includes("importe") || headers[c].includes("amount")) {
        idx.amount = c;
        break;
      }
    }
    if (idx.amount < 0) idx.amount = 4;
  }

  let lastBalance: number | null = null;

  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const row = parseRow(lines[i], sep);
    if (row.length < 3) continue;

    try {
      const rawDate = row[idx.date]?.replace(/"/g, "").trim() ?? "";
      const rawAmount = row[idx.amount]?.replace(/"/g, "").trim() ?? "0";

      const amount = parseAmount(rawAmount);
      if (isNaN(amount) || amount === 0) continue;

      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) continue; // skip summary rows silently

      // Build description from Movimiento + Concepto + Observaciones
      const parts: string[] = [];
      if (idx.movimiento >= 0) {
        const mov = row[idx.movimiento]?.replace(/"/g, "").trim() ?? "";
        if (mov) parts.push(mov);
      }
      if (idx.concepto >= 0) {
        const con = row[idx.concepto]?.replace(/"/g, "").trim() ?? "";
        // Only add concepto if it adds info beyond movimiento
        if (con && !parts.some((p) => p.toLowerCase().includes(con.toLowerCase()))) {
          parts.push(con);
        }
      }
      if (idx.observaciones >= 0) {
        const obs = row[idx.observaciones]?.replace(/"/g, "").trim() ?? "";
        if (obs && obs.length > 1) parts.push(obs);
      }
      const description = parts.join(" — ").slice(0, 300) || "Transaccion BBVA";

      const currency = idx.currency >= 0
        ? row[idx.currency]?.replace(/"/g, "").trim().toUpperCase() ?? "EUR"
        : "EUR";

      // Track last available balance
      if (idx.disponible >= 0) {
        const bal = parseAmount(row[idx.disponible]?.replace(/"/g, "").trim() ?? "");
        if (!isNaN(bal) && bal !== 0) lastBalance = bal;
      }

      transactions.push({
        date,
        description,
        amount: Math.abs(amount),
        currency,
        direction: amount < 0 ? "expense" : "income",
        account: "bbva",
      });
    } catch (e) {
      errors.push(`Fila ${i + 1}: ${e}`);
    }
  }

  const finalBalances = lastBalance !== null ? { bbva: lastBalance } : undefined;

  return { transactions, format: "bbva", errors, finalBalances };
}

// Parse Santander CSV (Spanish headers)
export function parseSantander(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "santander", errors: ["Empty file"] };
  }

  const sep = detectSeparator(lines[0]);
  const headers = parseRow(lines[0], sep).map((h) => h.toLowerCase().replace(/"/g, "").trim());

  const idx = {
    date: findHeader(headers, "fecha"),
    description: findHeader(headers, "concepto", "descripción", "descripcion"),
    amount: findHeader(headers, "importe", "cantidad"),
  };

  if (idx.date < 0) idx.date = 0;
  if (idx.description < 0) idx.description = 1;
  if (idx.amount < 0) {
    // Try last numeric-looking column
    for (let c = headers.length - 1; c >= 0; c--) {
      if (headers[c].includes("importe") || headers[c].includes("saldo")) {
        idx.amount = c;
        break;
      }
    }
    if (idx.amount < 0) idx.amount = 2;
  }

  // Santander sometimes puts "saldo" as the last column, importe before it
  const saldoIdx = headers.findIndex((h) => h.includes("saldo"));
  if (saldoIdx >= 0 && idx.amount === saldoIdx) {
    // Amount is before saldo
    idx.amount = saldoIdx - 1;
  }

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i], sep);
    if (row.length < 3) continue;

    try {
      const rawDate = row[idx.date]?.replace(/"/g, "").trim() ?? "";
      const rawAmount = row[idx.amount]?.replace(/"/g, "").trim() ?? "0";
      const description = idx.description >= 0 ? row[idx.description]?.replace(/"/g, "").trim() ?? "" : "";

      const amount = parseAmount(rawAmount);
      if (isNaN(amount) || amount === 0) continue;

      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) {
        errors.push(`Row ${i + 1}: fecha inválida "${rawDate}"`);
        continue;
      }

      transactions.push({
        date,
        description: description || "Santander transaction",
        amount: Math.abs(amount),
        currency: "EUR",
        direction: amount < 0 ? "expense" : "income",
        account: "santander",
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e}`);
    }
  }

  return { transactions, format: "santander", errors };
}

// Parse CaixaBank CSV (Spanish/Catalan headers)
export function parseCaixaBank(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "caixabank", errors: ["Empty file"] };
  }

  const sep = detectSeparator(lines[0]);
  const headers = parseRow(lines[0], sep).map((h) => h.toLowerCase().replace(/"/g, "").trim());

  const idx = {
    date: findHeader(headers, "fecha", "data"),
    description: findHeader(headers, "concepto", "concepte", "descripción", "descripcion"),
    amount: findHeader(headers, "importe", "import", "cantidad"),
  };

  if (idx.date < 0) idx.date = 0;
  if (idx.description < 0) idx.description = 1;
  if (idx.amount < 0) idx.amount = 2;

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i], sep);
    if (row.length < 3) continue;

    try {
      const rawDate = row[idx.date]?.replace(/"/g, "").trim() ?? "";
      const rawAmount = row[idx.amount]?.replace(/"/g, "").trim() ?? "0";
      const description = idx.description >= 0 ? row[idx.description]?.replace(/"/g, "").trim() ?? "" : "";

      const amount = parseAmount(rawAmount);
      if (isNaN(amount) || amount === 0) continue;

      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) {
        errors.push(`Row ${i + 1}: fecha inválida "${rawDate}"`);
        continue;
      }

      transactions.push({
        date,
        description: description || "CaixaBank transaction",
        amount: Math.abs(amount),
        currency: "EUR",
        direction: amount < 0 ? "expense" : "income",
        account: "caixabank",
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e}`);
    }
  }

  return { transactions, format: "caixabank", errors };
}

// Parse MyInvestor CSV (semicolon-separated, Spanish dates DD/MM/YYYY, European amounts)
export function parseMyInvestor(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "myinvestor", errors: ["Empty file"] };
  }

  for (let i = 1; i < lines.length; i++) {
    const row = parseRow(lines[i], ";");
    if (row.length < 4) continue;

    try {
      const rawDate = row[0]?.trim() ?? "";
      const description = row[2]?.trim() ?? "";
      const rawAmount = row[3]?.trim() ?? "0";

      if (!description && rawAmount === "0") continue; // skip empty rows

      const amount = parseAmount(rawAmount);
      if (isNaN(amount)) {
        errors.push(`Row ${i + 1}: invalid amount "${rawAmount}"`);
        continue;
      }

      if (amount === 0) continue;

      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) {
        errors.push(`Row ${i + 1}: fecha inválida "${rawDate}"`);
        continue;
      }

      transactions.push({
        date,
        description,
        amount: Math.abs(amount),
        currency: "EUR",
        direction: amount < 0 ? "expense" : "income",
        account: "myinvestor",
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e}`);
    }
  }

  return { transactions, format: "myinvestor", errors };
}

// Parse Wise CSV
// Wise exports have headers like: "TransferWise ID,Date,Amount,Currency,Description,Payment Reference,Running Balance,Exchange From,..."
// Or the newer format: "Date,Amount,Currency,Description,..."
export function parseWise(csvText: string): ParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  const lines = csvText.trim().split("\n").filter((l) => l.trim());

  if (lines.length < 2) {
    return { transactions, format: "wise", errors: ["Empty file"] };
  }

  const headers = parseCSVRow(lines[0]).map((h) => h.toLowerCase().replace(/"/g, "").trim());

  const idx = {
    date: findHeader(headers, "date", "fecha"),
    amount: findHeader(headers, "amount", "importe"),
    currency: findHeader(headers, "currency", "divisa"),
    description: findHeader(headers, "description", "merchant", "descripci"),
    paymentRef: findHeader(headers, "payment reference", "referencia"),
    balance: findHeader(headers, "running balance", "saldo"),
  };

  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (row.length < 3) continue;

    try {
      const rawDate = idx.date >= 0 ? row[idx.date]?.replace(/"/g, "").trim() : "";
      const rawAmount = idx.amount >= 0 ? row[idx.amount]?.replace(/"/g, "").trim() : "0";
      const currency = idx.currency >= 0 ? row[idx.currency]?.replace(/"/g, "").trim().toUpperCase() : "EUR";
      const description = idx.description >= 0
        ? row[idx.description]?.replace(/"/g, "").trim()
        : (idx.paymentRef >= 0 ? row[idx.paymentRef]?.replace(/"/g, "").trim() : "");

      const amount = parseAmount(rawAmount);
      if (isNaN(amount) || amount === 0) continue;

      const date = normalizeDate(rawDate);
      if (!isValidDate(date)) {
        errors.push(`Row ${i + 1}: fecha inválida "${rawDate}"`);
        continue;
      }

      transactions.push({
        date,
        description: description || "Wise transaction",
        amount: Math.abs(amount),
        currency,
        direction: amount < 0 ? "expense" : "income",
        account: "wise",
      });
    } catch (e) {
      errors.push(`Row ${i + 1}: ${e}`);
    }
  }

  return { transactions, format: "wise", errors };
}

// Main parse function
export function parseCSV(csvText: string, format?: string): ParseResult {
  const detectedFormat = format || detectFormat(csvText);

  switch (detectedFormat) {
    case "revolut":
      return parseRevolut(csvText);
    case "ing":
      return parseING(csvText);
    case "n26":
      return parseN26(csvText);
    case "myinvestor":
      return parseMyInvestor(csvText);
    case "wise":
      return parseWise(csvText);
    case "bunq":
      return parseBunq(csvText);
    case "abn_amro":
      return parseAbnAmro(csvText);
    case "rabobank":
      return parseRabobank(csvText);
    case "bbva":
      return parseBBVA(csvText);
    case "santander":
      return parseSantander(csvText);
    case "caixabank":
      return parseCaixaBank(csvText);
    default:
      // Smart auto-detection instead of blind column mapping
      return parseSmartGeneric(csvText);
  }
}
