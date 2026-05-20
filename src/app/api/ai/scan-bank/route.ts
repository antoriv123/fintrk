import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import OpenAI from "openai";

export const maxDuration = 30;

const MAX_SIZE = 4 * 1024 * 1024;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _client;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "IA no disponible" }, { status: 503 });
  }

  const rate = await checkAiRateLimit(Number(userId), "scan-bank");
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Has usado la IA mucho — vuelve en ${Math.ceil(rate.retryAfterSec / 60)} min` },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
    );
  }

  let body: { image: string; mimeType?: string; account?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const { image, mimeType = "image/jpeg", account } = body;

  if (!image || typeof image !== "string") {
    return NextResponse.json({ error: "Imagen requerida (base64)" }, { status: 400 });
  }

  const sizeBytes = Math.ceil(image.length * 0.75);
  if (sizeBytes > MAX_SIZE) {
    return NextResponse.json({ error: "Imagen demasiado grande (max 4MB)" }, { status: 413 });
  }

  // Validar magic bytes: JPEG (FFD8FF), PNG (89504E47), WebP (52494646...57454250)
  // Base64 prefix alcanza: /9j/ = JPEG, iVBOR = PNG, UklGR = WebP.
  const magicPrefix = image.slice(0, 6);
  const isJPEG = magicPrefix.startsWith("/9j/");
  const isPNG = magicPrefix.startsWith("iVBOR");
  const isWebP = magicPrefix.startsWith("UklGR");
  if (!isJPEG && !isPNG && !isWebP) {
    return NextResponse.json({ error: "Formato de imagen no soportado (JPEG/PNG/WebP)" }, { status: 400 });
  }

  try {
    const client = getClient();
    const { AI_VISION_MODEL, isGPT5Family } = await import("@/lib/ai-models");
    const model = AI_VISION_MODEL();
    const extra: Record<string, unknown> = isGPT5Family(model) ? { reasoning_effort: "high" } : {};
    const response = await client.chat.completions.create({
      model,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      ...extra,
      messages: [
        {
          role: "system",
          content: `Eres un experto en extraer transacciones de capturas de apps bancarias (Revolut, BBVA, ING, CaixaBank, N26, Wise, Santander, Bunq, etc).

Tu trabajo: analizar la imagen y extraer CADA transacción que veas. Aunque la imagen esté en otro idioma, borrosa, o tenga formato raro, intenta extraer todo lo que puedas.

Responde SIEMPRE con JSON válido:
{
  "transactions": [
    {
      "description": "Nombre del comercio o concepto tal como aparece",
      "amount": 12.50,
      "currency": "EUR",
      "direction": "expense",
      "date": "2026-04-12",
      "category": "supermercado",
      "expense_type": "necesario"
    }
  ]
}

Categorías de gasto: alquiler, supermercado, transporte, suscripciones, ocio, universidad, herramientas-negocio, ropa, salud, inversiones, otros, transferencia
Categorías de ingreso: salario, freelance, negocio, alquiler, inversiones-retorno, otros-ingreso, transferencia
Tipos de gasto: necesario (facturas, supermercado), negocio (trabajo), discrecional (ocio, caprichos)

REGLAS DE CATEGORIZACIÓN:
- Supermercados (Albert Heijn, Lidl, Mercadona, etc.) → "supermercado"
- Restaurantes, bares, delivery → "ocio"
- Netflix, Spotify, Apple, SaaS → "suscripciones"
- Uber, taxi, NS, metro, gasolina → "transporte"
- Transferencias entre cuentas propias → "transferencia"
- NUNCA uses "otros" si puedes identificar la categoría

Reglas importantes:
- Importes SIEMPRE positivos, la dirección (expense/income) indica el signo
- Si ves "-" o rojo o "pagado" = expense
- Si ves "+" o verde o "recibido" = income
- Transferencias entre cuentas propias = category "transferencia"
- Si el año no aparece, asume ${new Date().getFullYear()}
- Si la fecha no es clara, usa la fecha más probable basándote en el contexto
- NO inventes transacciones — solo extrae lo que realmente ves en la imagen
- Si no puedes leer nada, devuelve {"transactions": []} — NUNCA devuelvas un error
- Incluso si solo ves 1 transacción, devuélvela en el array`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extrae todas las transacciones de esta captura de mi app bancaria:",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${image}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "La IA no pudo leer la imagen" }, { status: 500 });
    }

    const transactions = (parsed.transactions ?? []).map((tx: Record<string, unknown>) => ({
      ...tx,
      account: account || null,
      userId,
    }));

    return NextResponse.json({ transactions, count: transactions.length });
  } catch (e) {
    console.error("Bank scan error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error al analizar la captura" }, { status: 500 });
  }
}
