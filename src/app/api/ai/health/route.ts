export const runtime = "nodejs";
export const maxDuration = 10;

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import OpenAI from "openai";
import { AI_CATEGORIZE_MODEL } from "@/lib/ai-models";

/**
 * Health check del pipeline de IA para debugear "no se pudo recategorizar".
 * Hace un ping real al modelo que usa la categorización con un prompt minimo
 * y devuelve diagnóstico sobre qué está fallando (api key, modelo, quota…).
 * Auth: cualquier user autenticado — así el maintainer puede visitarlo desde
 * el frontend si vuelve a haber problemas.
 */
export async function GET() {
  try {
    await getUserId();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      stage: "config",
      detail: "OPENAI_API_KEY no está definida en este servidor.",
    }, { status: 503 });
  }

  const model = AI_CATEGORIZE_MODEL();
  const maskedKey = `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}`;

  try {
    const client = new OpenAI({ apiKey });
    const started = Date.now();
    const resp = await client.chat.completions.create({
      model,
      max_tokens: 30,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Responde JSON {ok: true}." },
        { role: "user", content: "ping" },
      ],
    });
    const elapsed = Date.now() - started;
    const content = resp.choices[0]?.message?.content ?? "";
    return NextResponse.json({
      ok: true,
      stage: "success",
      model,
      maskedKey,
      elapsedMs: elapsed,
      echo: content,
    });
  } catch (e) {
    const err = e as { message?: string; status?: number; code?: string };
    return NextResponse.json({
      ok: false,
      stage: "openai",
      model,
      maskedKey,
      status: err.status ?? null,
      code: err.code ?? null,
      detail: err.message ?? String(e),
    }, { status: 500 });
  }
}
