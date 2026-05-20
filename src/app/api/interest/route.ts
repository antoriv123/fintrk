import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

const FREQUENCY_DAYS: Record<string, number> = {
  daily: 1,
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

function getInterestAmount(balance: number, annualRate: number, frequency: string): number {
  if (balance <= 0 || annualRate <= 0) return 0;
  switch (frequency) {
    case "daily": return balance * (annualRate / 365);
    case "monthly": return balance * (annualRate / 12);
    case "quarterly": return balance * (annualRate / 4);
    case "annual": return balance * annualRate;
    default: return balance * (annualRate / 12);
  }
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

export async function POST() {
  let userId: number;
  try { userId = await getUserId(); } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    // Get all remunerated accounts with balances in a single query
    const accounts = await sql(
      `SELECT a.id, a.slug, a.name, a.initial_balance, a.annual_interest_rate,
              a.interest_payment_frequency, a.created_at,
              COALESCE(SUM(CASE WHEN t.direction = 'income' THEN t.eur_amount ELSE 0 END), 0) as total_income,
              COALESCE(SUM(CASE WHEN t.direction = 'expense' THEN t.eur_amount ELSE 0 END), 0) as total_expenses
       FROM accounts a
       LEFT JOIN transactions t ON t.user_id = a.user_id AND t.account = a.slug
       WHERE a.user_id = $1 AND a.is_active = 1 AND a.annual_interest_rate > 0
       GROUP BY a.id`,
      [userId]
    ) as { id: number; slug: string; name: string; initial_balance: number; annual_interest_rate: number; interest_payment_frequency: string; created_at: string; total_income: number; total_expenses: number }[];

    if (accounts.length === 0) return NextResponse.json({ created: 0 });

    // Get last interest dates for all accounts in one query
    const lastInterests = await sql(
      `SELECT DISTINCT ON (account) account, date FROM transactions
       WHERE user_id = $1 AND category = 'intereses' AND direction = 'income'
       AND account = ANY($2)
       ORDER BY account, date DESC`,
      [userId, accounts.map(a => a.slug)]
    ) as { account: string; date: string }[];

    const lastInterestMap = new Map(lastInterests.map(r => [r.account, r.date]));

    let totalCreated = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const account of accounts) {
      const freq = account.interest_payment_frequency || "monthly";
      const freqDays = FREQUENCY_DAYS[freq] ?? 30;
      const currentBalance = account.initial_balance + account.total_income - account.total_expenses;

      if (currentBalance <= 0) continue;

      const lastDate = lastInterestMap.get(account.slug);
      let startDate: Date;
      if (lastDate) {
        startDate = new Date(lastDate + "T00:00:00");
      } else {
        startDate = new Date(account.created_at);
        startDate.setHours(0, 0, 0, 0);
      }

      let nextPayment = addDays(startDate, freqDays);
      const paymentsToCreate: string[] = [];

      while (nextPayment <= today && paymentsToCreate.length < 365) {
        paymentsToCreate.push(formatDate(nextPayment));
        nextPayment = addDays(nextPayment, freqDays);
      }

      if (paymentsToCreate.length === 0) continue;

      const interest = getInterestAmount(currentBalance, account.annual_interest_rate, freq);
      const rounded = Math.round(interest * 100) / 100;
      if (rounded <= 0) continue;

      // Batch insert all payments
      for (const payDate of paymentsToCreate) {
        await sql(
          `INSERT INTO transactions (user_id, amount, currency, eur_amount, direction, description, category, date, account)
           VALUES ($1, $2, 'EUR', $2, 'income', $3, 'intereses', $4, $5)`,
          [userId, rounded, `Intereses ${account.name}`, payDate, account.slug]
        );
        totalCreated++;
      }
    }

    return NextResponse.json({ created: totalCreated });
  } catch (e) {
    console.error("Interest error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error al calcular intereses" }, { status: 500 });
  }
}
