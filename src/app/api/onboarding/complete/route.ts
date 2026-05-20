import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { headers } from "next/headers";
import { sendWelcomeEmail } from "@/lib/emails";

interface AccountPayload {
  slug: string;
  name: string;
  color: string;
  initialBalance: number;
}

interface ExpensePayload {
  name: string;
  slug: string;
  amount: number;
  category: string;
}

interface OnboardingPayload {
  country: string;
  currency: string;
  accounts: AccountPayload[];
  goals: string[];
  subscriptions: ExpensePayload[];
  recurringExpenses: ExpensePayload[];
}

export async function POST(req: NextRequest) {
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: OnboardingPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const { country, currency, accounts, goals, subscriptions, recurringExpenses } = body;

  if (!country || !currency) {
    return NextResponse.json({ error: "Pais y moneda requeridos" }, { status: 400 });
  }

  try {
    // 1. Create accounts (upsert)
    for (const acct of accounts) {
      await sql(
        `INSERT INTO accounts (slug, name, emoji, initial_balance, currency, color, user_id)
         VALUES ($1, $2, '🏦', $3, $4, $5, $6)
         ON CONFLICT (user_id, slug) DO UPDATE SET
           name = EXCLUDED.name,
           initial_balance = EXCLUDED.initial_balance,
           currency = EXCLUDED.currency,
           color = EXCLUDED.color`,
        [acct.slug, acct.name, acct.initialBalance || 0, currency, acct.color, userId]
      );
    }

    // 2. Create subscriptions and recurring expenses
    const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const allExpenses = [...subscriptions, ...recurringExpenses];

    for (const expense of allExpenses) {
      await sql(
        `INSERT INTO subscriptions (user_id, name, amount, currency, category, billing_cycle, next_renewal, active)
         VALUES ($1, $2, $3, $4, $5, 'monthly', $6, 1)`,
        [userId, expense.name, expense.amount, currency, expense.category || "suscripciones", nextMonth]
      );
    }

    // 3. Save country
    await sql(
      `INSERT INTO app_settings (user_id, key, value) VALUES ($1, 'country', $2)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [userId, country]
    );

    // 4. Save goals
    await sql(
      `INSERT INTO app_settings (user_id, key, value) VALUES ($1, 'onboarding_goals', $2)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [userId, JSON.stringify(goals)]
    );

    // 5. Mark onboarding completed
    await sql(
      `INSERT INTO app_settings (user_id, key, value) VALUES ($1, 'onboarding_completed', 'true')
       ON CONFLICT (user_id, key) DO UPDATE SET value = 'true', updated_at = NOW()`,
      [userId]
    );

    // 6. Send welcome email (fire and forget — do not block onboarding)
    try {
      const rows = await sql("SELECT email, name FROM users WHERE id = $1", [userId]);
      const user = rows[0];
      if (user?.email) {
        sendWelcomeEmail({ to: user.email, name: user.name ?? null })
          .then((r) => { if (!r.ok) console.warn("[onboarding] welcome email failed:", r.error); })
          .catch((e) => console.warn("[onboarding] welcome email threw:", e));
      }
    } catch (emailErr) {
      console.warn("[onboarding] welcome email setup error:", emailErr);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Onboarding complete error:", e);
    return NextResponse.json({ error: "Error al completar onboarding" }, { status: 500 });
  }
}
