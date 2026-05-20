import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { headers } from "next/headers";
import OpenAI from "openai";
import { logError } from "@/lib/log-error";

// Allow up to 30s for AI generation
export const maxDuration = 30;

// Cooldown: 15 min en dev, 1h en prod. Admin siempre puede regenerar.
const COOLDOWN_MS = process.env.NODE_ENV === "production" ? 60 * 60 * 1000 : 15 * 60 * 1000;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _client;
}

function getMonthRange(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

async function getLastInsightDate(userId: number): Promise<string | null> {
  const rows = await sql(
    "SELECT value FROM app_settings WHERE user_id = $1 AND key = 'last_ai_insight'",
    [userId]
  );
  return (rows[0]?.value as string) ?? null;
}

async function saveInsightDate(userId: number): Promise<void> {
  await sql(
    `INSERT INTO app_settings (user_id, key, value) VALUES ($1, 'last_ai_insight', $2)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, new Date().toISOString()]
  );
}

async function isAdmin(): Promise<boolean> {
  const h = await headers();
  return h.get("x-user-role") === "admin";
}

// GET: check availability + return cached insights
export async function GET() {
  try {
    const userId = await getUserId();
    const lastDate = await getLastInsightDate(userId);
    const admin = await isAdmin();

    let canGenerate = true;
    let nextAvailable: string | null = null;

    if (!admin && lastDate) {
      const last = new Date(lastDate);
      const hourLater = new Date(last.getTime() + COOLDOWN_MS);
      if (new Date() < hourLater) {
        canGenerate = false;
        nextAvailable = hourLater.toISOString();
      }
    }

    const storedRows = await sql(
      "SELECT value FROM app_settings WHERE user_id = $1 AND key = 'ai_insights_cache'",
      [userId]
    );
    let cached = null;
    try {
      cached = storedRows[0]?.value ? JSON.parse(storedRows[0].value as string) : null;
    } catch { /* ignore bad cache */ }

    return NextResponse.json({ canGenerate, lastGenerated: lastDate, nextAvailable, cached });
  } catch (e) {
    console.error("AI insights GET error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ canGenerate: true, lastGenerated: null, nextAvailable: null, cached: null });
  }
}

interface MonthlyRow { month_key: string; income: number; expenses: number }

async function getHistoricalContext(userId: number, monthsBack = 6) {
  const now = new Date();
  const fromMonth = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
  const fromStr = `${fromMonth.getFullYear()}-${String(fromMonth.getMonth() + 1).padStart(2, "0")}-01`;

  const monthly = (await sql(
    `SELECT
       TO_CHAR(TO_DATE(date, 'YYYY-MM-DD'), 'YYYY-MM') as month_key,
       COALESCE(SUM(CASE WHEN direction = 'income' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as income,
       COALESCE(SUM(CASE WHEN direction = 'expense' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as expenses
     FROM transactions
     WHERE user_id = $1 AND date >= $2
     GROUP BY month_key ORDER BY month_key`,
    [userId, fromStr]
  )) as MonthlyRow[];

  const series: { monthKey: string; income: number; expenses: number; savings: number }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = monthly.find((r) => r.month_key === key);
    const income = Number(row?.income ?? 0);
    const expenses = Number(row?.expenses ?? 0);
    series.push({ monthKey: key, income, expenses, savings: income - expenses });
  }

  // Excluimos el mes actual para el cálculo "media 6m" porque puede estar incompleto.
  const closed = series.slice(0, -1);
  const avgIncome = closed.length ? closed.reduce((s, m) => s + m.income, 0) / closed.length : 0;
  const avgExpenses = closed.length ? closed.reduce((s, m) => s + m.expenses, 0) / closed.length : 0;
  const avgSavings = avgIncome - avgExpenses;

  // Stddev de income (estabilidad de ingresos).
  const mean = avgIncome;
  const variance = closed.length
    ? closed.reduce((s, m) => s + (m.income - mean) ** 2, 0) / closed.length
    : 0;
  const incomeStddev = Math.sqrt(variance);
  const incomeStability = mean > 0 ? 1 - Math.min(1, incomeStddev / mean) : 0;

  // Top 10 categorías último mes cerrado + delta vs media 6m.
  const catCurrent = (await sql(
    `SELECT category, SUM(eur_amount) as total
     FROM transactions
     WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia'
       AND date >= $2 AND date <= $3
     GROUP BY category ORDER BY total DESC LIMIT 10`,
    [
      userId,
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`,
    ]
  )) as { category: string; total: number }[];

  const cat6m = (await sql(
    `SELECT category, SUM(eur_amount) as total
     FROM transactions
     WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia'
       AND date >= $2
     GROUP BY category`,
    [userId, fromStr]
  )) as { category: string; total: number }[];

  const cat6mMap = new Map(cat6m.map((c) => [c.category, Number(c.total)]));
  const categoriesWithTrend = catCurrent.map((c) => {
    const avg6m = (cat6mMap.get(c.category) ?? 0) / monthsBack;
    const delta = avg6m > 0 ? Math.round(((Number(c.total) - avg6m) / avg6m) * 100) : 0;
    return { category: c.category, current: Number(c.total), avg6m: Math.round(avg6m * 100) / 100, deltaPct: delta };
  });

  // Subscripciones activas.
  const subs = (await sql(
    `SELECT name, amount, billing_cycle, next_renewal
     FROM subscriptions WHERE user_id = $1 AND active = 1
     ORDER BY amount DESC LIMIT 20`,
    [userId]
  ).catch(() => [])) as { name: string; amount: number; billing_cycle: string; next_renewal: string }[];

  // Saldo actual vs hace 3 meses (aprox con net_worth_snapshots si existe).
  const nwRows = (await sql(
    `SELECT date, total FROM net_worth_snapshots
     WHERE user_id = $1 ORDER BY date DESC LIMIT 100`,
    [userId]
  ).catch(() => [])) as { date: string; total: number }[];

  const balanceNow = nwRows[0] ? Number(nwRows[0].total) : null;
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  const snapThen = nwRows.find((r) => new Date(r.date) <= threeMonthsAgo);
  const balanceThen = snapThen ? Number(snapThen.total) : null;

  // Spending velocity mes actual vs media últimos 3 cerrados.
  const daysElapsed = Math.max(1, now.getDate());
  const currentMonth = series[series.length - 1];
  const lastThreeClosed = closed.slice(-3);
  const currentDailyAvg = currentMonth ? currentMonth.expenses / daysElapsed : 0;
  const last3DailyAvg = lastThreeClosed.length
    ? lastThreeClosed.reduce((s, m) => {
        const days = new Date(
          Number(m.monthKey.slice(0, 4)),
          Number(m.monthKey.slice(5, 7)),
          0
        ).getDate();
        return s + m.expenses / days;
      }, 0) / lastThreeClosed.length
    : 0;

  return {
    series,
    avgIncome: Math.round(avgIncome * 100) / 100,
    avgExpenses: Math.round(avgExpenses * 100) / 100,
    avgSavings: Math.round(avgSavings * 100) / 100,
    incomeStability: Math.round(incomeStability * 100) / 100,
    categoriesWithTrend,
    subscriptions: subs.map((s) => ({
      name: s.name,
      amount: Number(s.amount),
      cycle: s.billing_cycle,
      next: s.next_renewal,
    })),
    balanceNow,
    balanceThen,
    balanceDelta: balanceNow !== null && balanceThen !== null ? balanceNow - balanceThen : null,
    currentDailyAvg: Math.round(currentDailyAvg * 100) / 100,
    last3DailyAvg: Math.round(last3DailyAvg * 100) / 100,
    velocityDelta:
      last3DailyAvg > 0 ? Math.round(((currentDailyAvg - last3DailyAvg) / last3DailyAvg) * 100) : 0,
  };
}

// POST: generate new insight
export async function POST() {
  const userId = await getUserId();
  const admin = await isAdmin();

  if (!admin) {
    const lastDate = await getLastInsightDate(userId);
    if (lastDate) {
      const last = new Date(lastDate);
      const hourLater = new Date(last.getTime() + COOLDOWN_MS);
      if (new Date() < hourLater) {
        const minsLeft = Math.ceil((hourLater.getTime() - Date.now()) / (60 * 1000));
        return NextResponse.json(
          { error: `Próximo análisis en ${minsLeft} minuto${minsLeft === 1 ? "" : "s"}` },
          { status: 429 }
        );
      }
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "API de IA no configurada" }, { status: 500 });
  }

  try {
  const now = new Date();
  const currentRange = getMonthRange(now.getFullYear(), now.getMonth() + 1);
  const prevRange = getMonthRange(
    now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
    now.getMonth() === 0 ? 12 : now.getMonth()
  );

  const currentTotals = await sql(
    `SELECT
       COALESCE(SUM(CASE WHEN direction = 'income' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as income,
       COALESCE(SUM(CASE WHEN direction = 'expense' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as expenses
     FROM transactions WHERE user_id = $1 AND date >= $2 AND date <= $3`,
    [userId, currentRange.from, currentRange.to]
  );
  const prevTotals = await sql(
    `SELECT
       COALESCE(SUM(CASE WHEN direction = 'income' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as income,
       COALESCE(SUM(CASE WHEN direction = 'expense' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as expenses
     FROM transactions WHERE user_id = $1 AND date >= $2 AND date <= $3`,
    [userId, prevRange.from, prevRange.to]
  );

  // Repeated expenses — same description appearing 3+ times in last 90 days
  const repeatedExpenses = (await sql(
    `SELECT description, category, COUNT(*) as times, AVG(eur_amount) as avg_amount, SUM(eur_amount) as total_spent
     FROM transactions
     WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia'
     AND date >= (CURRENT_DATE - INTERVAL '90 days')::text
     GROUP BY description, category
     HAVING COUNT(*) >= 3
     ORDER BY total_spent DESC
     LIMIT 10`,
    [userId]
  )) as { description: string; category: string; times: number; avg_amount: number; total_spent: number }[];

  const topExpenses = (await sql(
    `SELECT description, eur_amount, category, date FROM transactions
     WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND date >= $2 AND date <= $3
     ORDER BY eur_amount DESC LIMIT 10`,
    [userId, currentRange.from, currentRange.to]
  )) as { description: string; eur_amount: number; category: string; date: string }[];

  const accounts = (await sql(
    `SELECT a.name, a.initial_balance +
       COALESCE(SUM(CASE WHEN t.direction = 'income' THEN t.eur_amount ELSE 0 END), 0) -
       COALESCE(SUM(CASE WHEN t.direction = 'expense' THEN t.eur_amount ELSE 0 END), 0) as balance
     FROM accounts a
     LEFT JOIN transactions t ON t.account = a.slug AND t.user_id = a.user_id
     WHERE a.user_id = $1 AND a.is_active = 1
     GROUP BY a.id, a.name, a.initial_balance`,
    [userId]
  )) as { name: string; balance: number }[];

  // Historical context — 6 months rolling.
  const history = await getHistoricalContext(userId, 6);

  const currentExpenses = Number((currentTotals[0] as { expenses: number } | undefined)?.expenses ?? 0);
  const currentIncome = Number((currentTotals[0] as { income: number } | undefined)?.income ?? 0);
  const prevExpenses = Number((prevTotals[0] as { expenses: number } | undefined)?.expenses ?? 0);
  const prevIncome = Number((prevTotals[0] as { income: number } | undefined)?.income ?? 0);
  const daysElapsed = Math.max(1, now.getDate());
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyAvg = currentExpenses / daysElapsed;
  const projected = Math.round(dailyAvg * daysInMonth * 100) / 100;
  const savingsRate = currentIncome > 0 ? Math.round(((currentIncome - currentExpenses) / currentIncome) * 100) : 0;
  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance), 0);

  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const monthName = months[now.getMonth()];

  // Goals
  const goalsRows = await sql(
    "SELECT value FROM app_settings WHERE user_id = $1 AND key = 'onboarding_goals'",
    [userId]
  );
  const userGoals: string[] = goalsRows[0]?.value
    ? (() => { try { return JSON.parse(goalsRows[0].value as string); } catch { return []; } })()
    : [];
  const GOAL_MAP: Record<string, string> = {
    control_spending: "Controlar gastos",
    save: "Ahorrar",
    invest: "Invertir",
    debt: "Eliminar deudas",
    budget: "Presupuestar",
  };
  const goalsText = userGoals.length > 0
    ? `\nOBJETIVOS DEL USUARIO:\n${userGoals.map(g => `- ${GOAL_MAP[g] ?? g}`).join("\n")}\n`
    : "";

  const historyLines = history.series
    .map((m) => `  ${m.monthKey}: +${m.income.toFixed(0)} / -${m.expenses.toFixed(0)} = ${m.savings.toFixed(0)} EUR`)
    .join("\n");

  const categoriesWithTrendLines = history.categoriesWithTrend
    .map((c) => `  - ${c.category}: ${c.current.toFixed(2)} EUR este mes (media 6m: ${c.avg6m.toFixed(0)} EUR, ${c.deltaPct > 0 ? "+" : ""}${c.deltaPct}% vs media)`)
    .join("\n");

  const subsLines = history.subscriptions.length > 0
    ? history.subscriptions
        .map((s) => `  - ${s.name}: ${s.amount} EUR ${s.cycle} (próx: ${s.next})`)
        .join("\n")
    : "  (sin suscripciones activas)";

  const repeatedList = repeatedExpenses
    .map(e => `  - "${e.description}" (${e.category}): ${e.times} veces en 90d, media ${Number(e.avg_amount).toFixed(2)} EUR, total ${Number(e.total_spent).toFixed(2)} EUR`)
    .join("\n");

  const topList = topExpenses
    .map(e => `  - ${e.description}: ${Number(e.eur_amount).toFixed(2)} EUR (${e.category}, ${e.date})`)
    .join("\n");

  const accountsList = accounts
    .map(a => `  - ${a.name}: ${Number(a.balance).toFixed(2)} EUR`)
    .join("\n");

  const velocityDescription = history.velocityDelta !== 0
    ? `${history.velocityDelta > 0 ? "+" : ""}${history.velocityDelta}% vs media últimos 3 meses`
    : "estable";

  const balanceEvolution =
    history.balanceDelta !== null
      ? `${history.balanceDelta > 0 ? "+" : ""}${history.balanceDelta.toFixed(0)} EUR en 3 meses`
      : "sin snapshots previos";

  const context = `
FINTRK · Análisis para ${monthName} ${now.getFullYear()} · día ${now.getDate()} de ${daysInMonth}
${goalsText}

RESUMEN MES ACTUAL
  Ingresos: ${currentIncome.toFixed(2)} EUR
  Gastos: ${currentExpenses.toFixed(2)} EUR
  Balance: ${(currentIncome - currentExpenses).toFixed(2)} EUR
  Tasa ahorro: ${savingsRate}%
  Gasto diario: ${dailyAvg.toFixed(2)} EUR (${velocityDescription})
  Proyección fin de mes: ${projected.toFixed(2)} EUR
  Días restantes: ${daysInMonth - daysElapsed}

HISTÓRICO 6 MESES (mes: +income / -expenses = savings)
${historyLines}
  Media cerrados: +${history.avgIncome.toFixed(0)} / -${history.avgExpenses.toFixed(0)} = ${history.avgSavings.toFixed(0)} EUR
  Estabilidad ingresos: ${(history.incomeStability * 100).toFixed(0)}/100 (100 = constante, 0 = errático)

MES ANTERIOR
  Ingresos: ${prevIncome.toFixed(2)} EUR
  Gastos: ${prevExpenses.toFixed(2)} EUR

PATRIMONIO
  Total en cuentas: ${totalBalance.toFixed(2)} EUR
  Evolución vs hace 3 meses: ${balanceEvolution}
${accountsList ? `Cuentas:\n${accountsList}` : ""}

CATEGORÍAS TOP 10 ESTE MES (con tendencia vs media 6m)
${categoriesWithTrendLines || "  (sin gastos este mes)"}

SUSCRIPCIONES ACTIVAS
${subsLines}

GASTOS REPETIDOS (≥3 veces en 90 días)
${repeatedList || "  (ninguno)"}

TOP 10 GASTOS ESTE MES
${topList || "  (sin gastos)"}
`.trim();

    const client = getClient();
    const { AI_PARSE_MODEL } = await import("@/lib/ai-models");
    const response = await client.chat.completions.create({
      model: AI_PARSE_MODEL(),
      messages: [
        {
          role: "system",
          content: `Eres el asesor financiero de fintrk. Tono: amigo que sabe MUCHO de finanzas personales, directo, sin rodeos, sin jerga tipo banquero y sin frases cringe tipo "¡genial!", "buen trabajo", "sigue así". Cero emojis. Concreto con cifras reales del usuario, nunca consejos genéricos tipo "gasta menos" o "ahorra más".

RESPONDE SOLO con JSON de esta estructura exacta:
{
  "healthScore": 0-100,
  "healthLabel": "Excelente" | "Buena" | "Regular" | "Mejorable" | "Crítica",
  "summary": "1 frase corta, ≤90 caracteres, con cifra o % concreto",
  "projectionEndOfMonth": { "expenses": 1234.56, "oneLiner": "Si sigues así acabarás el mes gastando 1.234 EUR, unos X EUR más que el mes pasado" },
  "insights": [
    {
      "type": "pattern" | "saving" | "investment" | "alert" | "achievement",
      "title": "Título específico con nombre o categoría real",
      "body": "2-3 frases con cifra exacta y recomendación accionable",
      "metric": "ej: '-23%', '142 EUR', '4 veces'",
      "metricLabel": "ej: 'menos que el mes pasado', 'podrías ahorrar al mes', 'este mes'",
      "action": { "label": "Texto del botón", "intent": "route" | "category" | "subscription" | "budget", "value": "ruta o slug" }
    }
  ]
}

REGLAS DE CALIDAD (no opcionales):

1. **healthScore**: 80+ excelente, 60-79 buena, 40-59 regular, 20-39 mejorable, <20 crítica. Pondera: tasa de ahorro (40%), estabilidad ingresos (20%), tendencia gasto vs 3m (20%), patrimonio vs hace 3m (20%).

2. **4-6 insights**, SIEMPRE incluyendo mínimo:
   - 1x pattern: gasto repetido con nombre real, frecuencia y ahorro anual si lo reduce.
   - 1x saving: oportunidad concreta con importe exacto al mes o al año.
   - 1x projection o investment según su situación:
     * Si sobregasta vs media → insight tipo alert con proyección y qué categoría recortar.
     * Si ahorra bien → insight tipo investment ajustado a su capacidad real.
   - 1x achievement SOLO si lo merece de verdad (savings rate >20%, racha de ahorro, etc.). Si no, no lo fuerces.

3. **Acciones concretas** (campo action):
   - pattern sobre categoría → { label: "Ver gastos", intent: "category", value: "ocio" }
   - saving en suscripciones → { label: "Revisar suscripciones", intent: "route", value: "/subscriptions" }
   - investment → { label: "Crear presupuesto", intent: "route", value: "/budgets" }
   - alert sobre una categoría → { label: "Ver categoría", intent: "category", value: "supermercado" }
   action es OPCIONAL — solo añádelo si tienes una ruta real donde la app resuelve el CTA.

4. **Inversiones** (solo si aplica, NO siempre):
   - Si ahorra <100 EUR/mes → cuenta remunerada (Trade Republic ~3%, Revolut Ultra).
   - Si ahorra 100-500 EUR/mes → fondo indexado (MyInvestor S&P 500, Indexa Capital).
   - Si ahorra >500 EUR/mes → 70% indexados, 20% renta fija, 10% oportunidades.
   - Importe concreto: "con 300 EUR/mes durante 10 años al 7% anual tendrías 52.000 EUR".

5. **Tono prohibido**: "genial", "fantástico", "enhorabuena", "sigue así", "brutal", emojis, metáforas poéticas, exclamaciones múltiples, verbo en imperativo suave tipo "podrías considerar". En su lugar: imperativo directo ("cancela", "revisa", "reduce"), verbo en indicativo ("llevas X EUR", "tu media es Y").

6. **Lenguaje**: español casual de España, tuteo, frases cortas. Si el dato va en EUR usa "EUR" o "€" sin abreviaturas raras. Sin "billones" (usa "mil millones" o "miles").

7. **PRIVACIDAD**: no menciones datos personales identificativos. Solo finanzas.`,
        },
        { role: "user", content: context },
      ],
      temperature: 0.6,
      max_tokens: 2048,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logError("ai insights: invalid JSON from model", null, { raw: raw.slice(0, 500) });
      return NextResponse.json({ error: "La IA devolvió una respuesta inválida" }, { status: 500 });
    }

    // Backwards-compat: la UI actual lee healthScore/healthLabel/summary/insights.
    // Añadimos projectionEndOfMonth + action por insight sin romper lo anterior.
    const insights = Array.isArray(parsed.insights) ? parsed.insights : [];
    const result = {
      healthScore: Number(parsed.healthScore ?? 50),
      healthLabel: String(parsed.healthLabel ?? "Regular"),
      summary: String(parsed.summary ?? ""),
      projectionEndOfMonth: parsed.projectionEndOfMonth ?? null,
      insights: insights.map((i: Record<string, unknown>) => ({
        type: (i.type ?? "alert") as string,
        title: String(i.title ?? ""),
        body: String(i.body ?? ""),
        metric: String(i.metric ?? ""),
        metricLabel: String(i.metricLabel ?? ""),
        action: i.action ?? null,
      })),
      generatedAt: new Date().toISOString(),
    };

    await saveInsightDate(userId);
    await sql(
      `INSERT INTO app_settings (user_id, key, value) VALUES ($1, 'ai_insights_cache', $2)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [userId, JSON.stringify(result)]
    );

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logError("ai insights POST error", e, { userId });
    if (msg.includes("API key") || msg.includes("auth")) {
      return NextResponse.json({ error: "API de IA no configurada" }, { status: 500 });
    }
    if (msg.includes("quota") || msg.includes("rate")) {
      return NextResponse.json({ error: "Límite de la API alcanzado" }, { status: 429 });
    }
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}
