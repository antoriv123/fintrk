import OpenAI from "openai";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, EXPENSE_TYPES } from "./categories";
import { AI_CATEGORIZE_MODEL, AI_PARSE_MODEL, AI_VISION_MODEL, isGPT5Family } from "./ai-models";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _client;
}

const EXPENSE_SLUGS = Object.keys(EXPENSE_CATEGORIES);
const INCOME_SLUGS = Object.keys(INCOME_CATEGORIES);
const EXPENSE_TYPE_SLUGS = Object.keys(EXPENSE_TYPES);

const EXPENSE_LABELS = Object.entries(EXPENSE_CATEGORIES).map(([slug, info]) => `${slug} (${info.label})`).join(", ");
const INCOME_LABELS = Object.entries(INCOME_CATEGORIES).map(([slug, info]) => `${slug} (${info.label})`).join(", ");

interface TransactionInput {
  description: string;
  amount: number;
  currency: string;
  date: string;
  direction: "income" | "expense";
  account?: string;
}

interface CategorizedTransaction {
  description: string;
  category: string;
  expense_type: string | null;
  confidence: number;
}

// ─── CATEGORIZATION RULES (shared across all AI functions) ───

const CATEGORIZATION_RULES = `
REGLAS DE CATEGORIZACION ESTRICTAS:

SUPERMERCADO: Albert Heijn, AH, Lidl, Aldi, Mercadona, Carrefour, Spar, Jumbo, Dia, Consum, Eroski, Vomar, Dirk, Plus, Colruyt
TRANSPORTE: Uber, Bolt, taxi, NS, OV-chipkaart, metro, bus, gasolina, Shell, BP, Repsol, Cepsa, peaje, parking, Tier, Lime, scooter, avion, vuelo, Ryanair, Vueling, KLM
SUSCRIPCIONES: Netflix, Spotify, Apple, iCloud, Google One, YouTube Premium, Amazon Prime, Disney+, HBO, ChatGPT, Claude, OpenAI, Adobe, Notion, Figma, GitHub, Vercel, cualquier SaaS mensual
OCIO: restaurante, bar, cafe, cafeteria, cine, concierto, McDonald's, Burger King, KFC, Domino's, Just Eat, Uber Eats, Deliveroo, Glovo, Thuisbezorgd, teatro, museo
ALQUILER: alquiler, rent, huur, hipoteca
UNIVERSIDAD: universidad, university, college, matricula, tuition, libros academicos
HERRAMIENTAS-NEGOCIO: dominio, hosting, servidor, Cloudflare, AWS, DigitalOcean, Stripe, Mailchimp, Resend, software profesional
ROPA: Zara, H&M, Pull&Bear, Primark, Nike, Adidas, ASOS, tienda de ropa
SALUD: farmacia, medico, dentista, hospital, seguro medico, gimnasio, gym, fisio
INVERSIONES: MyInvestor, Revolut trading, acciones, ETF, crypto, broker, Trading 212
TRANSFERENCIA: transferencia entre cuentas propias, savings, vault, pocket, traspaso

TIPOS DE GASTO:
- necesario: alquiler, facturas, supermercado basico, transporte al trabajo, seguro, medicina
- negocio: herramientas profesionales, dominio, hosting, SaaS de trabajo
- discrecional: ocio, restaurantes, ropa, suscripciones entretenimiento, caprichos

USA "otros" SOLO si REALMENTE no encaja en NINGUNA categoria. Haz tu mejor esfuerzo por categorizar.`;

// ─── CATEGORIZATION ───

export async function categorizeTransactions(
  transactions: TransactionInput[]
): Promise<CategorizedTransaction[]> {
  if (transactions.length === 0) return [];
  const client = getClient();

  const BATCH_SIZE = 30;
  const allResults: CategorizedTransaction[][] = [];

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const result = await categorizeBatch(client, batch);
    allResults.push(result);
  }

  return allResults.flat();
}

async function categorizeBatch(
  client: OpenAI,
  transactions: TransactionInput[]
): Promise<CategorizedTransaction[]> {
  const txList = transactions
    .map((tx, i) => `${i + 1}. "${tx.description}" | ${tx.amount} ${tx.currency} | ${tx.direction} | ${tx.date}${tx.account ? ` | ${tx.account}` : ""}`)
    .join("\n");

  const response = await client.chat.completions.create({
    model: AI_CATEGORIZE_MODEL(),
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Eres un experto categorizador financiero. NUNCA devuelvas "otros" si puedes categorizar.

${CATEGORIZATION_RULES}`,
      },
      {
        role: "user",
        content: `Categoriza estas transacciones.

Categorias gasto: ${EXPENSE_LABELS}
Categorias ingreso: ${INCOME_LABELS}

${txList}

JSON: {"results": [{"description":"...","category":"...","expense_type":"necesario"|"negocio"|"discrecional"|null,"confidence":0.95}]}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(text);
    const items = (parsed.results ?? parsed) as CategorizedTransaction[];
    return items.map((item, i) => ({
      description: transactions[i]?.description ?? item.description,
      category: validateCategory(item.category, transactions[i]?.direction ?? "expense"),
      expense_type: transactions[i]?.direction === "expense" ? validateExpenseType(item.expense_type) : null,
      confidence: Math.min(1, Math.max(0, item.confidence ?? 0.5)),
    }));
  } catch {
    return fallbackCategorize(transactions);
  }
}

function validateCategory(category: string, direction: string): string {
  const validSlugs = direction === "income" ? INCOME_SLUGS : EXPENSE_SLUGS;
  return validSlugs.includes(category) ? category : direction === "income" ? "otros-ingreso" : "otros";
}

function validateExpenseType(type: string | null): string | null {
  if (!type) return null;
  return EXPENSE_TYPE_SLUGS.includes(type) ? type : null;
}

function fallbackCategorize(transactions: TransactionInput[]): CategorizedTransaction[] {
  return transactions.map((tx) => ({
    description: tx.description,
    category: tx.direction === "income" ? "otros-ingreso" : "otros",
    expense_type: null,
    confidence: 0,
  }));
}

// ─── RECEIPT SCANNING (vision model, high detail) ───

export async function scanReceipt(imageBase64: string, mimeType: string): Promise<{
  amount: number;
  currency: string;
  direction: "income" | "expense";
  description: string;
  category: string;
  expense_type: string | null;
  date: string | null;
  confidence: number;
  payment_method: string | null;
}> {
  const client = getClient();
  const today = new Date().toISOString().slice(0, 10);

  const visionModel = AI_VISION_MODEL();
  const visionExtra: Record<string, unknown> = isGPT5Family(visionModel) ? { reasoning_effort: "high" } : {};
  const response = await client.chat.completions.create({
    model: visionModel,
    max_tokens: 800,
    response_format: { type: "json_object" },
    ...visionExtra,
    messages: [
      {
        role: "system",
        content: `Eres un experto en leer recibos, tickets y capturas bancarias. Extraes datos con alta precision.

PRIVACIDAD: Esta imagen se procesa en memoria y NO se almacena.

${CATEGORIZATION_RULES}

SIEMPRE devuelve JSON valido. Si no puedes leer, devuelve confidence: 0.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analiza esta imagen y extrae la transaccion principal.

JSON esperado:
{
  "amount": <positivo>,
  "currency": "EUR",
  "direction": "expense" | "income",
  "description": "<nombre comercio, limpio, sin codigos>",
  "category": "<categoria exacta>",
  "expense_type": "necesario" | "negocio" | "discrecional" | null,
  "date": "YYYY-MM-DD" | null,
  "confidence": 0.0-1.0,
  "payment_method": "<banco o metodo de pago detectado>" | null
}

Hoy es ${today}.
- "description" = nombre del comercio/concepto, limpio y corto
- Si hay multiples transacciones, la principal (mas grande o reciente)
- NUNCA uses "otros" si puedes identificar la categoria
- Si es un supermercado, ponlo como "supermercado", no como "otros"
- Si es una suscripcion digital, ponla como "suscripciones"
- "payment_method": detecta el banco o metodo de pago. Busca logos, nombres, texto como:
  * Revolut, BBVA, ING, CaixaBank, Santander, N26, Wise, Bunq, MyInvestor
  * Visa, Mastercard, American Express, Apple Pay, Google Pay
  * Si ves el logo o nombre de un banco/tarjeta, ponlo en minusculas (ej: "revolut", "bbva", "ing")
  * Si no detectas metodo de pago, pon null`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      amount: 0, currency: "EUR", direction: "expense" as const,
      description: "No se pudo leer", category: "otros",
      expense_type: null, date: null, confidence: 0, payment_method: null,
    };
  }

  return {
    amount: Math.abs(Number(parsed.amount) || 0),
    currency: (parsed.currency as string) || "EUR",
    direction: parsed.direction === "income" ? "income" as const : "expense" as const,
    description: String(parsed.description || "").slice(0, 200),
    category: validateCategory((parsed.category as string) || "otros", (parsed.direction as string) || "expense"),
    expense_type: parsed.direction === "expense" ? validateExpenseType(parsed.expense_type as string | null) : null,
    date: parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date as string) ? parsed.date as string : null,
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
    payment_method: typeof parsed.payment_method === "string" ? parsed.payment_method.toLowerCase().trim() : null,
  };
}

// ─── ACCOUNT ANALYSIS ───

export async function analyzeAccount(data: {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
  topCategories: { category: string; amount: number }[];
  recentTrends: { month: string; income: number; expenses: number }[];
  recurringExpenses: { description: string; amount: number }[];
  accountBreakdown: { name: string; balance: number }[];
}): Promise<string> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: AI_PARSE_MODEL(),
    max_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `Eres el asesor financiero de fintrk. Analizas datos reales y das consejos CONCRETOS.

REGLAS:
- Español casual, directo, como un amigo que sabe de finanzas
- NO repitas numeros — interpreta y aconseja
- Recomendaciones con importes concretos ("si reduces X en 20%, ahorras Y EUR/ano")
- Al menos una recomendacion de inversion basada en capacidad real de ahorro
- Si hay patron preocupante, dilo sin rodeos
- Maximo 4-5 parrafos cortos, texto fluido
- Sin emojis, sin listas con asteriscos`,
      },
      {
        role: "user",
        content: `Balance: ${data.totalBalance.toFixed(2)} EUR
Ingresos/mes: ${data.monthlyIncome.toFixed(2)} EUR
Gastos/mes: ${data.monthlyExpenses.toFixed(2)} EUR
Ahorro: ${data.savingsRate}%
Top gastos: ${data.topCategories.map((c) => `${c.category}: ${c.amount.toFixed(2)}`).join(", ")}
Tendencia: ${data.recentTrends.map((t) => `${t.month}: +${t.income.toFixed(0)}/-${t.expenses.toFixed(0)}`).join(", ")}
Recurrentes: ${data.recurringExpenses.map((r) => `${r.description}: ${r.amount.toFixed(2)}`).join(", ")}
Cuentas: ${data.accountBreakdown.map((a) => `${a.name}: ${a.balance.toFixed(2)}`).join(", ")}`,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? "No se pudo generar el analisis.";
}
