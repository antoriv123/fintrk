import { NextRequest, NextResponse } from "next/server";
import { categorizeTransactions } from "@/lib/ai";
import { getUserId } from "@/lib/get-user-id";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";

export async function POST(req: NextRequest) {
  const userId = await getUserId();

  const rl = await checkAiRateLimit(Number(userId), "categorize");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Limite alcanzado. Espera ${rl.retryAfterSec}s.` },
      { status: 429 }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "AI no configurada" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const transactions = Array.isArray(body.transactions) ? body.transactions : [];

  if (transactions.length === 0) {
    return NextResponse.json({ error: "No hay transacciones" }, { status: 400 });
  }

  if (transactions.length > 200) {
    return NextResponse.json(
      { error: "Maximo 200 transacciones por peticion" },
      { status: 400 }
    );
  }

  // Validate each transaction has required fields
  for (const tx of transactions) {
    if (!tx.description || typeof tx.amount !== "number" || !tx.direction) {
      return NextResponse.json(
        { error: "Cada transaccion necesita description, amount, direction" },
        { status: 400 }
      );
    }
  }

  const results = await categorizeTransactions(transactions);

  return NextResponse.json({ results });
}
