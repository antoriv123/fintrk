import OpenAI from "openai";
import type { ParsedTransaction, ParseResult } from "./csv-parser";
import { AI_VISION_MODEL, isGPT5Family } from "./ai-models";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _client;
}

/** Max pages per vision API call — balances cost vs context */
const MAX_PAGES_PER_CALL = 5;
/** Max concurrent vision API calls */
const MAX_CONCURRENT = 2;

/**
 * Reported opening/closing balances from the statement header/footer.
 * Used for a post-extraction consistency check: sum(income) - sum(expense)
 * should equal (closing - opening) within a small tolerance. If not, we mark
 * weakDetection=true so the UI can show a warning.
 */
interface BalanceInfo {
  opening?: number;
  closing?: number;
  currency?: string;
}

/**
 * Vision-based PDF parser — receives page images (base64 JPEG) and sends
 * them to the configured vision LLM (default gpt-5.4-mini, see ai-models.ts)
 * to extract transactions.
 *
 * This is significantly more accurate than text extraction for PDFs where
 * pdf-parse mangles the text (e.g., BBVA joining words together, or
 * Santander returning amounts + balances without spacing).
 */
export async function parseWithVision(pageImages: string[]): Promise<ParseResult> {
  if (pageImages.length === 0) {
    return { transactions: [], format: "vision", errors: ["No hay páginas para analizar"] };
  }

  const allTransactions: ParsedTransaction[] = [];
  const errors: string[] = [];
  const statementBalance: BalanceInfo = {};

  // Split pages into batches
  const batches: string[][] = [];
  for (let i = 0; i < pageImages.length; i += MAX_PAGES_PER_CALL) {
    batches.push(pageImages.slice(i, i + MAX_PAGES_PER_CALL));
  }

  console.log(`[ai-vision] Processing ${pageImages.length} pages in ${batches.length} batch(es)`);

  // Process batches with controlled concurrency
  for (let batchStart = 0; batchStart < batches.length; batchStart += MAX_CONCURRENT) {
    const batchSlice = batches.slice(batchStart, batchStart + MAX_CONCURRENT);
    const results = await Promise.all(
      batchSlice.map((batch, idx) =>
        processBatchVision(batch, batchStart + idx + 1, batches.length)
      )
    );
    for (const result of results) {
      allTransactions.push(...result.transactions);
      errors.push(...result.errors);
      // Opening balance typically comes from the first batch; closing from the last.
      if (result.balance.opening !== undefined && statementBalance.opening === undefined) {
        statementBalance.opening = result.balance.opening;
      }
      if (result.balance.closing !== undefined) {
        statementBalance.closing = result.balance.closing;
      }
      if (result.balance.currency && !statementBalance.currency) {
        statementBalance.currency = result.balance.currency;
      }
    }
  }

  // Deduplicate: the same transaction can appear in two batches when pages overlap
  // (pdfjs occasionally splits tables across page renders). Keep first occurrence.
  const seen = new Set<string>();
  const deduped: ParsedTransaction[] = [];
  for (const tx of allTransactions) {
    const key = `${tx.date}|${tx.amount.toFixed(2)}|${tx.direction}|${tx.description.slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(tx);
  }
  const dropped = allTransactions.length - deduped.length;
  if (dropped > 0) console.log(`[ai-vision] Deduplicated ${dropped} cross-batch duplicates`);

  // Consistency check: do the extracted transactions reconcile with the reported balances?
  let consistency = checkConsistency(deduped, statementBalance);
  let retriedOnce = false;
  let finalTxs = deduped;

  if (!consistency.ok) {
    console.warn(`[ai-vision] Consistency FAILED on first pass: ${consistency.reason}. Retrying with stricter prompt...`);
    retriedOnce = true;
    // Segundo pase: re-pedimos con un mensaje explicito de "revisa si omitiste filas".
    const retryResults: ParsedTransaction[] = [];
    for (let batchStart = 0; batchStart < batches.length; batchStart += MAX_CONCURRENT) {
      const batchSlice = batches.slice(batchStart, batchStart + MAX_CONCURRENT);
      const results = await Promise.all(
        batchSlice.map((batch, idx) =>
          processBatchVision(batch, batchStart + idx + 1, batches.length, /* strict */ true),
        ),
      );
      for (const r of results) retryResults.push(...r.transactions);
    }
    // Merge: preferimos el pase con mas transacciones (casi siempre el strict).
    const mergedSeen = new Set<string>();
    const merged: ParsedTransaction[] = [];
    for (const tx of [...deduped, ...retryResults]) {
      const key = `${tx.date}|${tx.amount.toFixed(2)}|${tx.direction}|${tx.description.slice(0, 40)}`;
      if (mergedSeen.has(key)) continue;
      mergedSeen.add(key);
      merged.push(tx);
    }
    finalTxs = merged;
    consistency = checkConsistency(merged, statementBalance);
    if (!consistency.ok) {
      console.warn(`[ai-vision] Consistency still FAILS after retry: ${consistency.reason}`);
      errors.push(`AVISO: ${consistency.reason}. Revisa antes de importar.`);
    } else {
      console.log(`[ai-vision] Consistency OK after strict retry (${merged.length} txs total)`);
    }
  }

  console.log(`[ai-vision] Total: ${finalTxs.length} transactions from ${pageImages.length} pages (consistency: ${consistency.ok ? "ok" : "fail"}${retriedOnce ? ", retried" : ""})`);

  // Build finalBalances for the UI to pre-fill "balance actual"
  const finalBalances = statementBalance.closing !== undefined
    ? { vision: statementBalance.closing }
    : undefined;

  return {
    transactions: finalTxs,
    format: "vision",
    errors: finalTxs.length === 0
      ? ["La IA no pudo extraer transacciones de las imágenes del PDF."]
      : errors,
    finalBalances,
    // needsManualReview: se marca cuando la consistencia sigue fallando tras el retry.
    needsManualReview: !consistency.ok && retriedOnce,
    weakDetection: !consistency.ok,
  };
}

/**
 * Validate that sum(income) - sum(expense) ≈ closing - opening.
 * Tolerance: €1 (floating point + occasional tiny rounding in statements).
 * Only runs when both balances are present; otherwise returns ok.
 */
function checkConsistency(txs: ParsedTransaction[], bal: BalanceInfo): { ok: true } | { ok: false; reason: string } {
  if (bal.opening === undefined || bal.closing === undefined) return { ok: true };
  if (txs.length === 0) return { ok: true }; // handled elsewhere

  const delta = bal.closing - bal.opening;
  const sum = txs.reduce((acc, tx) => acc + (tx.direction === "income" ? tx.amount : -tx.amount), 0);
  const diff = Math.abs(sum - delta);
  if (diff > 1.0) {
    return {
      ok: false,
      reason: `La suma de las transacciones (${sum.toFixed(2)}) no cuadra con la variación del saldo (${delta.toFixed(2)}). Diferencia: ${diff.toFixed(2)}`,
    };
  }
  return { ok: true };
}

async function processBatchVision(
  pageImages: string[],
  batchNum: number,
  totalBatches: number,
  forceStrict = false,
): Promise<{ transactions: ParsedTransaction[]; errors: string[]; balance: BalanceInfo }> {
  const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPartImage[] = pageImages.map((img) => ({
    type: "image_url",
    image_url: {
      url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}`,
      detail: "high",
    },
  }));

  // Attempt 1: standard prompt (o strict directo si el caller lo pide — retry global).
  let result = await callVisionOnce(imageContent, pageImages.length, batchNum, totalBatches, forceStrict);

  // Retry: if attempt 1 returned 0 transactions, try once more with a stricter,
  // more explicit prompt. This catches cases where the model silently "skips"
  // due to conservative behaviour with unfamiliar layouts.
  if (!forceStrict && result.transactions.length === 0 && !result.errorThrown) {
    console.warn(`[ai-vision] Batch ${batchNum}: 0 transactions on first attempt — retrying with stricter prompt`);
    result = await callVisionOnce(imageContent, pageImages.length, batchNum, totalBatches, true);
  }

  return {
    transactions: result.transactions,
    errors: result.errors,
    balance: result.balance,
  };
}

interface VisionCallResult {
  transactions: ParsedTransaction[];
  errors: string[];
  balance: BalanceInfo;
  errorThrown: boolean;
}

async function callVisionOnce(
  imageContent: OpenAI.Chat.Completions.ChatCompletionContentPartImage[],
  pageCount: number,
  batchNum: number,
  totalBatches: number,
  strict: boolean,
): Promise<VisionCallResult> {
  const client = getClient();
  const today = new Date().toISOString().slice(0, 10);

  const strictNote = strict
    ? `\n\nATENCIÓN: El intento anterior devolvió 0 transacciones pero el PDF contiene datos. Mira CADA FILA de la tabla de movimientos. Devuelve TODAS las líneas, aunque parezcan triviales, de test, o repetidas. NO DEVUELVAS UN ARRAY VACÍO.`
    : "";

  const model = AI_VISION_MODEL();
  // GPT-5.x models support `reasoning_effort` — for bank statements OpenAI
  // explicitly recommends "high" so the model can combine information across
  // table regions. Older models (gpt-4o) ignore the parameter.
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
          content: `Eres un experto parser de extractos bancarios. Analizas IMÁGENES de extractos y extraes TODAS las transacciones con máxima precisión. Respondes SOLO en JSON válido.

Eres extremadamente bueno leyendo:
- PDFs de bancos españoles (BBVA, Santander, Sabadell, CaixaBank, ING, Bankinter, Openbank, KutxaBank, Unicaja)
- PDFs de bancos latinoamericanos (Santander MX/AR/CL, BBVA MX, Banco Galicia, Itaú, Bradesco)
- PDFs de neobancos (Revolut, N26, Wise, Bunq, Monzo)
- Formatos con texto pequeño o comprimido
- Tablas con columnas de fecha, concepto, importe y saldo

IMPORTANTE: Extrae ABSOLUTAMENTE TODAS las transacciones visibles. No omitas ninguna. Si hay 50 filas de movimientos, devuelve 50 objetos. Este es el lote ${batchNum} de ${totalBatches}.${strictNote}`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analiza estas ${pageCount} página(s) de extracto bancario.

Devuelve JSON con DOS campos:

1. "transactions": array con TODAS las filas de movimientos. Para cada una:
   - date: YYYY-MM-DD (fechas europeas: DD/MM/YYYY = día primero)
   - description: descripción/concepto del movimiento
   - amount: número positivo (sin signo, sin símbolo de moneda)
   - currency: "EUR" (o la moneda indicada)
   - direction: "expense" si es cargo/debe/negativo, "income" si es abono/haber/positivo
   - account: slug del banco si puedes identificarlo (bbva, ing, revolut, n26, wise, bunq, santander, sabadell, caixabank, bankinter, openbank, kutxabank, unicaja, imaginbank, myinvestor)

2. "balance": información de saldo del extracto (si aparece — suele estar en cabecera o pie):
   - opening: saldo inicial / saldo anterior / "Saldo a DD/MM/YYYY" al inicio del periodo (número con signo)
   - closing: saldo final / saldo al cierre del periodo (número con signo)
   - currency: divisa del saldo

Reglas:
- Formato europeo de números: 1.234,56 (punto = miles, coma = decimal) → devuelve 1234.56
- Ignora filas de "Saldo anterior", "Saldo final", "Saldo nuevo", totales, resúmenes
- Ignora filas con estado PENDIENTE/REVERTIDO/RECHAZADO/DEVUELTO/ANULADO
- Si hay dos fechas (operación y valor), usa la de operación
- Importes negativos o en columna "Debe"/"Cargo" = expense
- Importes positivos o en columna "Haber"/"Abono" = income
- Hoy es ${today}

JSON: {
  "transactions": [{"date":"YYYY-MM-DD","description":"...","amount":123.45,"currency":"EUR","direction":"expense","account":"bbva"}, ...],
  "balance": {"opening": 1000.00, "closing": 1234.56, "currency": "EUR"}
}`,
            },
            ...imageContent,
          ],
        },
      ],
    }, { timeout: 60_000 });

    const text = response.choices[0]?.message?.content ?? "";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error(`[ai-vision] Batch ${batchNum}${strict ? " (retry)" : ""}: invalid JSON response`);
      return {
        transactions: [],
        errors: [`Lote visual ${batchNum}: respuesta IA no válida`],
        balance: {},
        errorThrown: false,
      };
    }
    const items = (parsed.transactions ?? []) as Array<{
      date: string;
      description: string;
      amount: number;
      currency: string;
      direction: "income" | "expense";
      account?: string;
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
        account: item.account || undefined,
      });
    }

    // Parse the balance block (may be absent)
    const balanceRaw = parsed.balance as { opening?: unknown; closing?: unknown; currency?: unknown } | undefined;
    const balance: BalanceInfo = {};
    if (balanceRaw && typeof balanceRaw === "object") {
      if (typeof balanceRaw.opening === "number" && !isNaN(balanceRaw.opening)) balance.opening = balanceRaw.opening;
      if (typeof balanceRaw.closing === "number" && !isNaN(balanceRaw.closing)) balance.closing = balanceRaw.closing;
      if (typeof balanceRaw.currency === "string") balance.currency = balanceRaw.currency.toUpperCase();
    }

    console.log(`[ai-vision] Batch ${batchNum}/${totalBatches}${strict ? " (retry)" : ""}: ${transactions.length} transactions from ${pageCount} pages${balance.closing !== undefined ? ` (closing balance ${balance.closing})` : ""}`);
    return { transactions, errors: [], balance, errorThrown: false };
  } catch (err) {
    console.error(`[ai-vision] Batch ${batchNum}/${totalBatches}${strict ? " (retry)" : ""} failed:`, err);
    return {
      transactions: [],
      errors: [`Error en lote visual ${batchNum}: ${err instanceof Error ? err.message : "desconocido"}`],
      balance: {},
      errorThrown: true,
    };
  }
}

// Exported purely for unit tests of the consistency check
export const _testing = { checkConsistency };
