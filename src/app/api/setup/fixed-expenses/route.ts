import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { sql } from "@/lib/db";

interface ExpensePayload {
  name: string;
  slug?: string;
  amount: number;
  category?: string;
}

// Insert masivo de suscripciones + gastos recurrentes. Lo usa /setup/fixed-expenses,
// el sub-flujo que se abre desde el panel "Completar primeros pasos".
// Reutiliza la tabla `subscriptions` (donde tambien viven los recurring
// expenses) con billing_cycle='monthly'.
export async function POST(req: NextRequest) {
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { subscriptions?: ExpensePayload[]; recurringExpenses?: ExpensePayload[]; currency?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const subs = Array.isArray(body.subscriptions) ? body.subscriptions : [];
  const recurring = Array.isArray(body.recurringExpenses) ? body.recurringExpenses : [];
  const all = [...subs, ...recurring];
  if (all.length === 0) {
    return NextResponse.json({ error: "Sin gastos" }, { status: 400 });
  }

  let currency = body.currency;
  if (!currency) {
    const existing = await sql(
      `SELECT currency FROM accounts WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    currency = (existing[0]?.currency as string) || "EUR";
  }

  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  try {
    for (const expense of all) {
      await sql(
        `INSERT INTO subscriptions (user_id, name, amount, currency, category, billing_cycle, next_renewal, active)
         VALUES ($1, $2, $3, $4, $5, 'monthly', $6, 1)`,
        [
          userId,
          expense.name,
          expense.amount,
          currency,
          expense.category || "suscripciones",
          nextMonth,
        ],
      );
    }
    return NextResponse.json({ ok: true, count: all.length });
  } catch (e) {
    console.error("[setup/fixed-expenses] error:", e);
    return NextResponse.json({ error: "Error al guardar gastos fijos" }, { status: 500 });
  }
}
