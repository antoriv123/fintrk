import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { sanitizeText, parsePositiveNumber, validateDate, validateCurrency } from "@/lib/sanitize";

interface SubscriptionRow {
  id: number;
  name: string;
  amount: number;
  currency: string;
  category: string;
  billing_cycle: string;
  next_renewal: string;
  active: number;
  type: string;
  day_of_month: number | null;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  const typeFilter = req.nextUrl.searchParams.get("type");

  let activeQuery = "SELECT * FROM subscriptions WHERE user_id = $1 AND active = 1";
  let pausedQuery = "SELECT * FROM subscriptions WHERE user_id = $1 AND active = 0";
  const activeParams: (string | number)[] = [userId];
  const pausedParams: (string | number)[] = [userId];

  if (typeFilter) {
    activeQuery += " AND type = $2";
    pausedQuery += " AND type = $2";
    activeParams.push(typeFilter);
    pausedParams.push(typeFilter);
  }

  const active = await sql(activeQuery + " ORDER BY next_renewal ASC", activeParams) as SubscriptionRow[];
  const paused = await sql(pausedQuery + " ORDER BY name ASC", pausedParams) as SubscriptionRow[];

  const today = new Date().toISOString().slice(0, 10);
  const threeDaysOut = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

  const upcoming = active.filter(
    (s) => s.next_renewal >= today && s.next_renewal <= threeDaysOut
  );

  return NextResponse.json({ subscriptions: active, paused, upcoming });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const body = await req.json();

  const name = sanitizeText(body.name, 100);
  const amount = parsePositiveNumber(body.amount);
  const currency = validateCurrency(body.currency);
  const category = sanitizeText(body.category, 50) || "suscripciones";
  const billingCycle = ["monthly", "yearly", "weekly"].includes(body.billing_cycle)
    ? body.billing_cycle
    : "monthly";
  const nextRenewal = validateDate(body.next_renewal);
  const type = ["subscription", "fixed_expense", "fixed_income"].includes(body.type)
    ? body.type
    : "subscription";
  const dayOfMonth = typeof body.day_of_month === "number" && body.day_of_month >= 1 && body.day_of_month <= 31
    ? body.day_of_month
    : null;
  const account = typeof body.account === "string" && body.account.trim() ? body.account.trim() : null;

  if (!name || !amount || !nextRenewal) {
    return NextResponse.json(
      { error: "Campos requeridos: name, amount, next_renewal" },
      { status: 400 }
    );
  }

  const rows = await sql(
    "INSERT INTO subscriptions (user_id, name, amount, currency, category, billing_cycle, next_renewal, type, day_of_month, account) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id",
    [userId, name, amount, currency, category, billingCycle, nextRenewal, type, dayOfMonth, account]
  );
  const newId = rows[0].id;

  const created = await sql("SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2", [newId, userId]);
  return NextResponse.json(created[0], { status: 201 });
}
