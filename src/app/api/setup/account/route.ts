import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { sql } from "@/lib/db";

interface AccountPayload {
  slug: string;
  name: string;
  color: string;
  initialBalance: number;
  currency?: string;
}

// Upsert de cuentas con balance inicial. Lo usa /setup/account, el sub-flujo
// que se abre desde el panel "Completar primeros pasos". Mismo INSERT que
// el endpoint de onboarding pero sin pedir country/currency (los toma de
// app_settings.country y la primera cuenta existente).
export async function POST(req: NextRequest) {
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { accounts?: AccountPayload[]; currency?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const accounts = Array.isArray(body.accounts) ? body.accounts : [];
  if (accounts.length === 0) {
    return NextResponse.json({ error: "Sin cuentas" }, { status: 400 });
  }

  // Currency fallback: 1) lo que mande el cliente, 2) primera cuenta existente,
  // 3) EUR. Asi el endpoint funciona aunque el cliente no la pase.
  let currency = body.currency;
  if (!currency) {
    const existing = await sql(
      `SELECT currency FROM accounts WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    currency = (existing[0]?.currency as string) || "EUR";
  }

  try {
    for (const acct of accounts) {
      await sql(
        `INSERT INTO accounts (slug, name, emoji, initial_balance, currency, color, user_id)
         VALUES ($1, $2, '🏦', $3, $4, $5, $6)
         ON CONFLICT (user_id, slug) DO UPDATE SET
           name = EXCLUDED.name,
           initial_balance = EXCLUDED.initial_balance,
           currency = EXCLUDED.currency,
           color = EXCLUDED.color`,
        [acct.slug, acct.name, acct.initialBalance || 0, acct.currency || currency, acct.color, userId],
      );
    }
    return NextResponse.json({ ok: true, count: accounts.length });
  } catch (e) {
    console.error("[setup/account] error:", e);
    return NextResponse.json({ error: "Error al guardar cuentas" }, { status: 500 });
  }
}
