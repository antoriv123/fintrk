import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { scanReceipt } from "@/lib/ai";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";

const MAX_SIZE = 4 * 1024 * 1024; // 4MB

export async function POST(req: NextRequest) {
  const userId = await getUserId();

  const rl = await checkAiRateLimit(Number(userId), "scan");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Limite alcanzado. Espera ${rl.retryAfterSec}s.` },
      { status: 429 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "AI no disponible" }, { status: 503 });
  }

  let body: { image: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const { image, mimeType = "image/jpeg" } = body;

  if (!image || typeof image !== "string") {
    return NextResponse.json({ error: "Imagen requerida (base64)" }, { status: 400 });
  }

  // Validate base64 size
  const sizeBytes = Math.ceil(image.length * 0.75);
  if (sizeBytes > MAX_SIZE) {
    return NextResponse.json({ error: "Imagen demasiado grande (max 4MB)" }, { status: 413 });
  }

  // Validate mime type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(mimeType)) {
    return NextResponse.json({ error: "Formato no soportado. Usa JPG, PNG o WebP" }, { status: 400 });
  }

  try {
    const result = await scanReceipt(image, mimeType);
    return NextResponse.json(result);
  } catch (err) {
    console.error("AI scan error:", err);
    return NextResponse.json({ error: "Error al analizar la imagen" }, { status: 500 });
  }
}
