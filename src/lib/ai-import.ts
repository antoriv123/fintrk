import OpenAI from "openai";
import type { ParsedTransaction, ParseResult } from "./csv-parser";
import { AI_PARSE_MODEL, isGPT5Family } from "./ai-models";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _client;
}

/** Max lines per AI batch — keeps each call under token limits */
const BATCH_SIZE = 150;
/** Max concurrent AI calls */
const MAX_CONCURRENT = 3;

/**
 * AI fallback parser — when structured parsers fail, send the raw text
 * to the configured LLM (default gpt-5.4-mini, see ai-models.ts) to extract
 * transactions.
 *
 * Processes the file in batches of ~150 lines to handle files of any size.
 */
export async function parseWithAI(rawText: string, detectedFormat?: string): Promise<ParseResult> {
  const allLines = rawText.split("\n");
  if (allLines.length < 2 || rawText.trim().length < 10) {
    return { transactions: [], format: "ai-fallback", errors: ["Contenido vacío"] };
  }

  // The first line is likely headers — include it in every batch for context
  const headerLine = allLines[0];
  const dataLines = allLines.slice(1).filter((l) => l.trim());

  if (dataLines.length === 0) {
    return { transactions: [], format: "ai-fallback", errors: ["No hay datos después de la cabecera"] };
  }

  // Split data lines into batches
  const batches: string[][] = [];
  for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
    batches.push(dataLines.slice(i, i + BATCH_SIZE));
  }

  console.log(`[ai-import] Processing ${dataLines.length} data lines in ${batches.length} batch(es), format hint: ${detectedFormat ?? "none"}`);

  // Process batches with controlled concurrency
  const allTransactions: ParsedTransaction[] = [];
  const errors: string[] = [];

  for (let batchStart = 0; batchStart < batches.length; batchStart += MAX_CONCURRENT) {
    const batchSlice = batches.slice(batchStart, batchStart + MAX_CONCURRENT);
    const results = await Promise.all(
      batchSlice.map((batch, idx) =>
        processBatch(headerLine, batch, detectedFormat, batchStart + idx + 1, batches.length)
      )
    );
    for (const result of results) {
      allTransactions.push(...result.transactions);
      errors.push(...result.errors);
    }
  }

  console.log(`[ai-import] Total extracted: ${allTransactions.length} transactions from ${batches.length} batch(es)`);

  return {
    transactions: allTransactions,
    format: "ai-fallback",
    errors: allTransactions.length === 0
      ? ["La IA no pudo extraer transacciones del archivo."]
      : errors,
  };
}

async function processBatch(
  headerLine: string,
  dataLines: string[],
  detectedFormat: string | undefined,
  batchNum: number,
  totalBatches: number,
): Promise<{ transactions: ParsedTransaction[]; errors: string[] }> {
  // Attempt 1: standard prompt
  let result = await callOnce(headerLine, dataLines, detectedFormat, batchNum, totalBatches, false);

  // Retry once with stricter prompt if we got 0 transactions but didn't throw.
  if (result.transactions.length === 0 && !result.errorThrown && dataLines.length > 1) {
    console.warn(`[ai-import] Batch ${batchNum}: 0 transactions on first attempt — retrying with stricter prompt`);
    result = await callOnce(headerLine, dataLines, detectedFormat, batchNum, totalBatches, true);
  }

  return { transactions: result.transactions, errors: result.errors };
}

interface TextCallResult {
  transactions: ParsedTransaction[];
  errors: string[];
  errorThrown: boolean;
}

async function callOnce(
  headerLine: string,
  dataLines: string[],
  detectedFormat: string | undefined,
  batchNum: number,
  totalBatches: number,
  strict: boolean,
): Promise<TextCallResult> {
  const client = getClient();
  const today = new Date().toISOString().slice(0, 10);

  const bankHint = detectedFormat && detectedFormat !== "generic" && detectedFormat !== "excel"
    ? `\nEl formato detectado es "${detectedFormat}". Usa esto como pista para identificar las columnas correctas.`
    : "";

  const strictNote = strict
    ? `\n\nATENCIÓN: El intento anterior devolvió 0 transacciones pero el texto contiene datos. Mira CADA LÍNEA. Devuelve TODAS las filas. NO DEVUELVAS UN ARRAY VACÍO.`
    : "";

  const batchText = [headerLine, ...dataLines].join("\n");

  const model = AI_PARSE_MODEL();
  const extraParams: Record<string, unknown> = isGPT5Family(model)
    ? { reasoning_effort: "high" }
    : {};

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 16384,
      response_format: { type: "json_object" },
      ...extraParams,
      messages: [
        {
          role: "system",
          content: `Eres un experto parser de extractos bancarios. Extraes TODAS las transacciones del texto que recibes con máxima precisión. Respondes SOLO en JSON válido.

Eres extremadamente bueno identificando columnas incluso cuando:
- Los headers tienen caracteres corruptos por encoding
- Las columnas tienen nombres no estándar
- El separador es coma, punto y coma, o tabulador
- Hay filas de metadatos mezcladas con los datos

IMPORTANTE: Debes extraer TODAS las filas de datos, sin omitir ninguna. Este es el lote ${batchNum} de ${totalBatches}.${strictNote}`,
        },
        {
          role: "user",
          content: `Extrae TODAS las transacciones de este extracto bancario (${dataLines.length} filas).${bankHint}

Para cada transacción:
- date: YYYY-MM-DD
- description: descripción/concepto
- amount: número positivo (sin signo, sin símbolo de moneda)
- currency: "EUR" (o la moneda si se indica)
- direction: "expense" si negativo/gasto, "income" si positivo/ingreso

Reglas:
- Fechas europeas: DD/MM/YYYY (día primero)
- Revolut: "YYYY-MM-DD HH:MM:SS" → extraer solo YYYY-MM-DD
- Importes negativos = expense, positivos = income
- Formato europeo: 1.234,56 (punto miles, coma decimal)
- Ignora cabeceras, totales, saldos, filas vacías
- Ignora filas con estado PENDING/REVERTED/DECLINED/FAILED/ANULADO
- Hoy es ${today}

Texto:
${batchText}

JSON: {"transactions": [{"date":"YYYY-MM-DD","description":"...","amount":123.45,"currency":"EUR","direction":"expense"|"income"}, ...]}`,
        },
      ],
    }, { timeout: 45_000 });

    const text = response.choices[0]?.message?.content ?? "";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error(`[ai-import] Batch ${batchNum}${strict ? " (retry)" : ""}: invalid JSON response`);
      return {
        transactions: [],
        errors: [`Lote ${batchNum}: respuesta IA no válida`],
        errorThrown: false,
      };
    }
    const items = (parsed.transactions ?? []) as Array<{
      date: string;
      description: string;
      amount: number;
      currency: string;
      direction: "income" | "expense";
    }>;

    const transactions: ParsedTransaction[] = [];
    for (const item of items) {
      if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) continue;
      const d = new Date(item.date + "T00:00:00");
      if (isNaN(d.getTime()) || d.getFullYear() < 2000) continue;

      const amount = Math.abs(Number(item.amount));
      if (!amount || amount === 0) continue;

      transactions.push({
        date: item.date,
        description: String(item.description || "Transacción importada").slice(0, 300),
        amount: Math.round(amount * 100) / 100,
        currency: item.currency || "EUR",
        direction: item.direction === "income" ? "income" : "expense",
      });
    }

    console.log(`[ai-import] Batch ${batchNum}/${totalBatches}${strict ? " (retry)" : ""}: ${transactions.length} transactions from ${dataLines.length} lines`);
    return { transactions, errors: [], errorThrown: false };
  } catch (err) {
    console.error(`[ai-import] Batch ${batchNum}/${totalBatches}${strict ? " (retry)" : ""} failed:`, err);
    return {
      transactions: [],
      errors: [`Error en lote ${batchNum}: ${err instanceof Error ? err.message : "desconocido"}`],
      errorThrown: true,
    };
  }
}
