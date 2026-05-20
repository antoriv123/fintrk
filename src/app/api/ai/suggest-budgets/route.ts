import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { AI_CATEGORIZE_MODEL, isGPT5Family } from "@/lib/ai-models";

interface Suggestion {
  category: string;
  monthlyAverage: number;
  suggestedBudget: number;
  reason: string;
}

interface AISummary {
  income: number;
  necessaryTotal: number;
  discretionaryTotal: number;
  savingsTarget: number;
}

interface CategoryRow {
  category: string;
  tx_count: number;
  total: number;
  avg_per_tx: number;
}

interface SumRow {
  total: number;
}

const VALID_SLUGS = new Set(Object.keys(EXPENSE_CATEGORIES).filter(s => s !== "transferencia"));

function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(1, Math.round(ms / (30 * 86_400_000)));
}

function roundTo5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

function heuristicSuggestions(
  byCategory: CategoryRow[],
  monthsOfData: number,
  monthlyIncome: number,
): { suggestions: Suggestion[]; summary: AISummary } {
  const averages = byCategory.map(c => ({
    category: c.category,
    avg: Number(c.total) / monthsOfData,
    tx: Number(c.tx_count),
  }));
  const totalAvg = averages.reduce((s, c) => s + c.avg, 0);

  // Si el gasto promedio supera el ingreso medio, recortamos al 80% del ingreso.
  const cap = monthlyIncome > 0 ? monthlyIncome * 0.8 : totalAvg;
  const scale = totalAvg > 0 && totalAvg > cap ? cap / totalAvg : 1;

  const suggestions: Suggestion[] = averages
    .map(({ category, avg, tx }) => {
      // Factor conservador: 0.95 si estamos escalando hacia abajo, 0.9 si estamos ajustando.
      const factor = scale < 1 ? scale : 0.9;
      const suggested = roundTo5(avg * factor);
      const reason = scale < 1
        ? `Ajustado a tu ingreso medio. Promediabas ${avg.toFixed(0)} €/mes (${tx} movs).`
        : `Tu promedio son ${avg.toFixed(0)} €/mes (${tx} movs). Te dejamos un 10% de margen para ahorrar.`;
      return {
        category,
        monthlyAverage: Math.round(avg * 100) / 100,
        suggestedBudget: suggested,
        reason,
      };
    })
    .filter(s => s.suggestedBudget >= 5);

  // Clasificar por tipo para el resumen
  const necessaryCats = new Set(["alquiler", "supermercado", "transporte", "salud", "universidad"]);
  const necessary = suggestions.filter(s => necessaryCats.has(s.category)).reduce((n, s) => n + s.suggestedBudget, 0);
  const discretionary = suggestions.filter(s => !necessaryCats.has(s.category)).reduce((n, s) => n + s.suggestedBudget, 0);
  const savings = Math.max(0, Math.round(monthlyIncome - (necessary + discretionary)));

  return {
    suggestions,
    summary: {
      income: Math.round(monthlyIncome),
      necessaryTotal: Math.round(necessary),
      discretionaryTotal: Math.round(discretionary),
      savingsTarget: savings,
    },
  };
}

async function aiSuggestions(
  byCategory: CategoryRow[],
  monthsOfData: number,
  monthlyIncome: number,
  fixedTotal: number,
): Promise<{ suggestions: Suggestion[]; summary: AISummary } | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = AI_CATEGORIZE_MODEL();
  if (isGPT5Family(model)) return null; // la Responses API va en otra branch, usamos heurística

  const rows = byCategory
    .map(c => {
      const avg = Number(c.total) / monthsOfData;
      const info = EXPENSE_CATEGORIES[c.category as keyof typeof EXPENSE_CATEGORIES];
      return `${c.category} (${info?.label ?? c.category}): media ${avg.toFixed(0)} €/mes en ${c.tx_count} movimientos`;
    })
    .join("\n");

  const prompt = `Eres un asesor financiero cercano. Crea un presupuesto mensual equilibrado para el próximo mes basándote en estos datos.

Datos del usuario:
- Ingreso medio mensual: ${monthlyIncome.toFixed(0)} €
- Gastos fijos comprometidos (alquiler, suscripciones): ${fixedTotal.toFixed(0)} €/mes
- Meses de datos disponibles: ${monthsOfData}

Histórico de gasto por categoría (${monthsOfData} meses):
${rows}

Categorías válidas: ${Object.keys(EXPENSE_CATEGORIES).filter(s => s !== "transferencia").join(", ")}

Criterios:
1. Respeta el gasto fijo real (alquiler, supermercado base, transporte al trabajo).
2. Recorta entre un 10% y un 25% en categorías discrecionales (ocio, ropa, suscripciones, otros) cuando haya margen.
3. Si los gastos superan el ingreso, prioriza lo imprescindible y reduce el resto.
4. Deja al menos un 10% del ingreso disponible para ahorro si es posible.
5. Redondea a múltiplos de 5€. Mínimo 5€ por categoría.
6. No inventes categorías nuevas.
7. Explica cada sugerencia en una frase corta (máx 90 caracteres), tono cercano y útil, sin clichés.

Responde SOLO JSON válido:
{
  "suggestions": [
    {"category":"slug","monthlyAverage":0,"suggestedBudget":0,"reason":"..."}
  ],
  "summary": {"income":0,"necessaryTotal":0,"discretionaryTotal":0,"savingsTarget":0}
}`;

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Eres un asesor financiero personal. Devuelve JSON válido, sin texto extra." },
        { role: "user", content: prompt },
      ],
    });
    const text = response.choices[0]?.message?.content ?? "";
    if (!text) return null;
    const parsed = JSON.parse(text) as { suggestions?: Suggestion[]; summary?: AISummary };
    const cleaned = (parsed.suggestions ?? [])
      .filter(s => s && typeof s.category === "string" && VALID_SLUGS.has(s.category))
      .map(s => ({
        category: s.category,
        monthlyAverage: Number(s.monthlyAverage) || 0,
        suggestedBudget: Math.max(5, Math.round((Number(s.suggestedBudget) || 0) / 5) * 5),
        reason: (s.reason ?? "").toString().slice(0, 140),
      }));
    if (cleaned.length === 0) return null;
    const summary = parsed.summary ?? { income: monthlyIncome, necessaryTotal: 0, discretionaryTotal: 0, savingsTarget: 0 };
    return { suggestions: cleaned, summary };
  } catch (e) {
    console.warn("AI suggest-budgets fallback:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId();
    const useAI = request.nextUrl.searchParams.get("ai") !== "0";

    // Solo rate-limit el path IA. El path estadistico puro es barato.
    if (useAI) {
      const rate = await checkAiRateLimit(Number(userId), "suggest-budgets");
      if (!rate.allowed) {
        return NextResponse.json(
          { error: `Has usado la IA mucho — vuelve en ${Math.ceil(rate.retryAfterSec / 60)} min` },
          { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
        );
      }
    }

    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const fromDate = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;

    const categorySpending = await sql(
      `SELECT category,
              COUNT(*) as tx_count,
              SUM(eur_amount) as total,
              AVG(eur_amount) as avg_per_tx
       FROM transactions
       WHERE user_id = $1
         AND direction = 'expense'
         AND category NOT IN ('transferencia', 'intereses')
         AND date >= $2
       GROUP BY category
       HAVING SUM(eur_amount) > 0
       ORDER BY total DESC`,
      [userId, fromDate]
    ) as CategoryRow[];

    if (categorySpending.length === 0) {
      return NextResponse.json({ suggestions: [], message: "Necesitas al menos 1 mes de datos", monthsOfData: 0 });
    }

    const incomeRows = await sql(
      `SELECT COALESCE(SUM(eur_amount), 0) as total
       FROM transactions
       WHERE user_id = $1 AND direction = 'income' AND category != 'transferencia' AND date >= $2`,
      [userId, fromDate]
    ) as SumRow[];

    const fixedRows = await sql(
      `SELECT COALESCE(SUM(
         CASE
           WHEN billing_cycle = 'monthly' THEN amount
           WHEN billing_cycle = 'yearly' THEN amount / 12.0
           WHEN billing_cycle = 'weekly' THEN amount * 4.33
           ELSE amount
         END
       ), 0) as total
       FROM subscriptions
       WHERE user_id = $1 AND active = 1 AND type IN ('fixed_expense','subscription')`,
      [userId]
    ) as SumRow[];

    const monthsOfData = monthsBetween(threeMonthsAgo, now);
    const monthlyIncome = Number(incomeRows[0]?.total ?? 0) / monthsOfData;
    const fixedTotal = Number(fixedRows[0]?.total ?? 0);

    let payload = null;
    if (useAI) {
      payload = await aiSuggestions(categorySpending, monthsOfData, monthlyIncome, fixedTotal);
    }
    if (!payload) {
      payload = heuristicSuggestions(categorySpending, monthsOfData, monthlyIncome);
    }

    return NextResponse.json({
      ...payload,
      monthsOfData,
      monthlyIncome: Math.round(monthlyIncome),
      fixedTotal: Math.round(fixedTotal),
      source: useAI && payload ? "ai" : "heuristic",
    });
  } catch (e) {
    console.error("Budget suggestions error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ suggestions: [], error: "Error" }, { status: 500 });
  }
}
