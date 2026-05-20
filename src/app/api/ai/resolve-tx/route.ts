export const runtime = "nodejs";
export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { logError } from "@/lib/log-error";
import OpenAI from "openai";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, EXPENSE_TYPES } from "@/lib/categories";

/**
 * Ambiguity resolver: cuando una fila importada tiene confidence baja o
 * categoría "otros", la UI la puede enviar aquí para que la IA proponga
 * merchant limpio + categoría + expense_type con confianza. Un solo llamado
 * por fila, no batch — es interactivo desde el wizard.
 *
 * Body: { description, amount, date, currency?, direction?, context? }
 * Respuesta: { merchant, category, expense_type, direction, confidence, rationale }
 */
export async function POST(req: NextRequest) {
  let userId: number;
  try {
    userId = Number(await getUserId());
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "IA no configurada" }, { status: 503 });
  }

  const rate = await checkAiRateLimit(userId, "resolve-tx");
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Has usado la IA mucho — vuelve en ${Math.ceil(rate.retryAfterSec / 60)} min` },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const description = String(body?.description ?? "").trim();
  const amount = Number(body?.amount);
  const date = String(body?.date ?? "").slice(0, 10);
  const currency = String(body?.currency ?? "EUR");
  const direction = body?.direction === "income" ? "income" : "expense";
  const context = typeof body?.context === "string" ? body.context.slice(0, 500) : "";

  if (!description || !amount || !date) {
    return NextResponse.json({ error: "description, amount y date son requeridos" }, { status: 400 });
  }

  const EXPENSE_LIST = Object.keys(EXPENSE_CATEGORIES).join(", ");
  const INCOME_LIST = Object.keys(INCOME_CATEGORIES).join(", ");
  const TYPE_LIST = Object.keys(EXPENSE_TYPES).join(", ");

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { AI_CATEGORIZE_MODEL } = await import("@/lib/ai-models");
    const resp = await client.chat.completions.create({
      model: AI_CATEGORIZE_MODEL(),
      max_tokens: 400,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `Eres un clasificador experto de transacciones bancarias en España y Latinoamérica. Te llega una fila de un extracto que el parser no supo categorizar bien. Devuelve JSON con el merchant limpio (sin códigos, sin ciudad, sin fecha) y la categoría más probable.

Categorías gasto válidas: ${EXPENSE_LIST}
Categorías ingreso válidas: ${INCOME_LIST}
Tipos de gasto válidos: ${TYPE_LIST}

REGLAS:
- merchant: nombre del comercio en formato limpio ("Mercadona" no "MERCADONA MADRID 1234").
- category: slug exacto de la lista. Si realmente no hay pista, "otros" o "otros-ingreso".
- expense_type: solo si direction=expense, slug exacto de la lista (o null).
- direction: "expense" o "income" — deduce si no está claro (importe alto + palabra "nomina|transferencia recibida" → income).
- confidence: 0-1. Solo >0.7 si estás realmente seguro.
- rationale: ≤100 car, por qué esa clasificación.

Responde JSON: { "merchant", "category", "expense_type", "direction", "confidence", "rationale" }`,
        },
        {
          role: "user",
          content: `Fila:
description: "${description}"
amount: ${amount} ${currency}
date: ${date}
direction declarada: ${direction}
${context ? `contexto adicional: ${context}` : ""}`,
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logError("resolve-tx: invalid JSON", null, { raw: raw.slice(0, 300) });
      return NextResponse.json({ error: "Respuesta IA inválida" }, { status: 500 });
    }

    const validExpense = Object.keys(EXPENSE_CATEGORIES);
    const validIncome = Object.keys(INCOME_CATEGORIES);
    const validTypes = Object.keys(EXPENSE_TYPES);

    const resolvedDirection = parsed.direction === "income" ? "income" : "expense";
    const valid = resolvedDirection === "income" ? validIncome : validExpense;
    const category = typeof parsed.category === "string" && valid.includes(parsed.category)
      ? parsed.category
      : resolvedDirection === "income"
      ? "otros-ingreso"
      : "otros";
    const expenseType = resolvedDirection === "expense" && typeof parsed.expense_type === "string" && validTypes.includes(parsed.expense_type)
      ? parsed.expense_type
      : null;

    return NextResponse.json({
      merchant: String(parsed.merchant ?? description).slice(0, 80),
      category,
      expense_type: expenseType,
      direction: resolvedDirection,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
      rationale: String(parsed.rationale ?? "").slice(0, 200),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logError("resolve-tx failed", e, { description });
    return NextResponse.json({ error: "Error IA", detail: msg.slice(0, 200) }, { status: 500 });
  }
}
