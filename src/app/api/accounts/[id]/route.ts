import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { sanitizeText } from "@/lib/sanitize";

const VALID_INTEREST_FREQUENCIES = ["daily", "monthly", "quarterly", "annual"] as const;
type InterestPaymentFrequency = typeof VALID_INTEREST_FREQUENCIES[number];

interface AccountRow {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  initial_balance: number;
  currency: string;
  color: string;
  is_active: number;
  annual_interest_rate: number;
  interest_payment_frequency: InterestPaymentFrequency | null;
  scope: string;
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

  const rows = await sql("SELECT * FROM accounts WHERE id = $1 AND user_id = $2", [id, userId]);
  const account = rows[0] as AccountRow | undefined;

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json(account);
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

  const existingRows = await sql("SELECT * FROM accounts WHERE id = $1 AND user_id = $2", [id, userId]);
  const existing = existingRows[0] as AccountRow | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const body = await req.json();

  const name = body.name !== undefined
    ? sanitizeText(body.name, 100)
    : existing.name;
  const emoji = body.emoji !== undefined
    ? (typeof body.emoji === "string" ? body.emoji.trim().slice(0, 4) : existing.emoji)
    : existing.emoji;
  const initialBalance = body.initial_balance !== undefined
    ? (typeof body.initial_balance === "number" && isFinite(body.initial_balance) ? body.initial_balance : existing.initial_balance)
    : existing.initial_balance;
  const color = body.color !== undefined
    ? (typeof body.color === "string" && /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : existing.color)
    : existing.color;

  const annualInterestRate = body.annual_interest_rate !== undefined
    ? (typeof body.annual_interest_rate === "number" && isFinite(body.annual_interest_rate)
        ? Math.max(0, Math.min(1, body.annual_interest_rate))
        : existing.annual_interest_rate)
    : existing.annual_interest_rate;

  const interestPaymentFrequency: InterestPaymentFrequency = body.interest_payment_frequency !== undefined
    ? (typeof body.interest_payment_frequency === "string" &&
       (VALID_INTEREST_FREQUENCIES as readonly string[]).includes(body.interest_payment_frequency)
         ? (body.interest_payment_frequency as InterestPaymentFrequency)
         : (existing.interest_payment_frequency ?? "monthly"))
    : (existing.interest_payment_frequency ?? "monthly");

  const scope = body.scope !== undefined
    ? (typeof body.scope === "string" && ["personal", "business", "shared", "savings"].includes(body.scope) ? body.scope : existing.scope)
    : existing.scope;

  const scopeLabel = body.scope_label !== undefined
    ? (typeof body.scope_label === "string" ? body.scope_label.trim().slice(0, 50) : null)
    : (existing as unknown as Record<string, unknown>).scope_label as string | null ?? null;

  if (!name) {
    return NextResponse.json({ error: "El nombre no puede estar vacio" }, { status: 400 });
  }

  await sql(
    "UPDATE accounts SET name = $1, emoji = $2, initial_balance = $3, color = $4, annual_interest_rate = $5, interest_payment_frequency = $6, scope = $7, scope_label = $8 WHERE id = $9 AND user_id = $10",
    [name, emoji, initialBalance, color, annualInterestRate, interestPaymentFrequency, scope, scopeLabel, id, userId]
  );

  const updatedRows = await sql("SELECT * FROM accounts WHERE id = $1 AND user_id = $2", [id, userId]);
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

  const existingRows = await sql("SELECT * FROM accounts WHERE id = $1 AND user_id = $2", [id, userId]);
  const existing = existingRows[0] as AccountRow | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Delete related rows first to avoid FK issues and orphan movements.
  // Transaction splits reference transactions — drop them if the table exists.
  try {
    await sql(
      "DELETE FROM transaction_splits WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = $1 AND account = $2)",
      [userId, existing.slug],
    );
  } catch { /* table may not exist in older deployments */ }
  const txResult = await sql(
    "DELETE FROM transactions WHERE user_id = $1 AND account = $2",
    [userId, existing.slug],
  ) as unknown as { rowCount?: number } | unknown[];
  const deletedTx = Array.isArray(txResult) ? txResult.length : (txResult?.rowCount ?? 0);
  await sql("DELETE FROM accounts WHERE id = $1 AND user_id = $2", [id, userId]);

  return NextResponse.json({ ok: true, deleted_transactions: deletedTx });
}
