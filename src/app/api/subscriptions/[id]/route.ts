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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const rows = await sql("SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2", [id, userId]);
  const sub = rows[0] as SubscriptionRow | undefined;

  if (!sub) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  return NextResponse.json(sub);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existingRows = await sql("SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2", [id, userId]);
  const existing = existingRows[0] as SubscriptionRow | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  const body = await req.json();

  const name = body.name !== undefined ? sanitizeText(body.name, 100) : existing.name;
  const amount = body.amount !== undefined ? parsePositiveNumber(body.amount) : existing.amount;
  const currency = body.currency !== undefined ? validateCurrency(body.currency) : existing.currency;
  const category = body.category !== undefined ? (sanitizeText(body.category, 50) || "suscripciones") : existing.category;
  const billingCycle = body.billing_cycle !== undefined
    ? (["monthly", "yearly", "weekly"].includes(body.billing_cycle) ? body.billing_cycle : existing.billing_cycle)
    : existing.billing_cycle;
  const nextRenewal = body.next_renewal !== undefined ? validateDate(body.next_renewal) : existing.next_renewal;
  const active = body.active !== undefined ? (body.active ? 1 : 0) : existing.active;
  const type = body.type !== undefined
    ? (["subscription", "fixed_expense", "fixed_income"].includes(body.type) ? body.type : existing.type)
    : existing.type;
  const dayOfMonth = body.day_of_month !== undefined
    ? (typeof body.day_of_month === "number" && body.day_of_month >= 1 && body.day_of_month <= 31 ? body.day_of_month : null)
    : existing.day_of_month;
  const account = body.account !== undefined
    ? (typeof body.account === "string" && body.account.trim() ? body.account.trim() : null)
    : (existing as unknown as Record<string, unknown>).account as string ?? null;

  if (!name || !amount || !nextRenewal) {
    return NextResponse.json(
      { error: "name, amount y next_renewal no pueden estar vacíos" },
      { status: 400 }
    );
  }

  await sql(
    `UPDATE subscriptions
    SET name = $1, amount = $2, currency = $3, category = $4, billing_cycle = $5, next_renewal = $6, active = $7, type = $8, day_of_month = $9, account = $10
    WHERE id = $11 AND user_id = $12`,
    [name, amount, currency, category, billingCycle, nextRenewal, active, type, dayOfMonth, account, id, userId]
  );

  const updatedRows = await sql("SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2", [id, userId]);
  return NextResponse.json(updatedRows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId();
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const existingRows = await sql("SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2", [id, userId]);
  if (!existingRows[0]) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  await sql("DELETE FROM subscriptions WHERE id = $1 AND user_id = $2", [id, userId]);
  return NextResponse.json({ ok: true });
}
