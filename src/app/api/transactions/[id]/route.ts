import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import type { Transaction } from "@/lib/db";
import { sanitizeText, validateCurrency, validateDate, sanitizeSlug } from "@/lib/sanitize";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const rows = await sql("SELECT * FROM transactions WHERE id = $1 AND user_id = $2", [id, userId]);
    const transaction = rows[0] as Transaction | undefined;

    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json(transaction);
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await req.json();

    const existingRows = await sql("SELECT * FROM transactions WHERE id = $1 AND user_id = $2", [id, userId]);
    const existing = existingRows[0] as Transaction | undefined;
    if (!existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const amount = typeof body.amount === "number" && body.amount > 0 ? body.amount : existing.amount;
    const currency = body.currency ? validateCurrency(body.currency) : existing.currency;
    const eur_amount = typeof body.eur_amount === "number" && body.eur_amount > 0
      ? body.eur_amount
      : (currency === "EUR" ? amount : existing.eur_amount);
    const direction = (body.direction === "income" || body.direction === "expense") ? body.direction : existing.direction;
    const description = body.description !== undefined ? sanitizeText(body.description, 300) : existing.description;
    const category = body.category !== undefined ? sanitizeText(body.category, 50) : existing.category;
    const expense_type = body.expense_type !== undefined ? (body.expense_type || null) : existing.expense_type;
    const date = body.date !== undefined ? (validateDate(body.date) ?? existing.date) : existing.date;
    const account = body.account !== undefined
      ? (body.account ? sanitizeSlug(body.account) : null)
      : (existing as Transaction & { account?: string }).account ?? null;

    await sql(
      `UPDATE transactions
       SET amount = $1, currency = $2, eur_amount = $3, direction = $4, description = $5,
           category = $6, expense_type = $7, date = $8, account = $9, updated_at = NOW()
       WHERE id = $10 AND user_id = $11`,
      [amount, currency, eur_amount, direction, description, category, expense_type, date, account, id, userId]
    );

    const updatedRows = await sql("SELECT * FROM transactions WHERE id = $1 AND user_id = $2", [id, userId]);
    return NextResponse.json(updatedRows[0]);
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const existingRows = await sql("SELECT * FROM transactions WHERE id = $1 AND user_id = $2", [id, userId]);
    if (!existingRows[0]) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // Atomico: un unico statement con CTEs. Si el DELETE principal falla
    // (ej: tx referenciada por FK desde transfers), los tags no se borran
    // tampoco. Antes eran 2 queries separadas sin transaccion.
    const deleted = await sql(
      `WITH deleted_tags AS (
         DELETE FROM transaction_tags WHERE transaction_id = $1 RETURNING 1
       ),
       deleted_splits AS (
         DELETE FROM transaction_splits WHERE transaction_id = $1 RETURNING 1
       )
       DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (!deleted[0]) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
