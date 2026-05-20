import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import type { Transaction } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId();
    const { id } = await params;
    const txId = parseInt(id, 10);

    // Verify the transaction belongs to this user
    const txRows = await sql("SELECT id FROM transactions WHERE id = $1 AND user_id = $2", [txId, userId]);
    if (!txRows[0]) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const splits = await sql(
      "SELECT * FROM transaction_splits WHERE transaction_id = $1 ORDER BY id",
      [txId]
    );
    return NextResponse.json(splits);
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(
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

    const txRows = await sql("SELECT * FROM transactions WHERE id = $1 AND user_id = $2", [id, userId]);
    const tx = txRows[0] as Transaction | undefined;
    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const body = await req.json();
    const splits: { amount: number; category: string; expense_type?: string; description?: string }[] = body.splits;

    if (!Array.isArray(splits)) {
      return NextResponse.json({ error: "splits must be an array" }, { status: 400 });
    }

    if (splits.length === 0) {
      // Remove all splits
      await sql("DELETE FROM transaction_splits WHERE transaction_id = $1", [id]);
      await sql("UPDATE transactions SET has_splits = 0 WHERE id = $1 AND user_id = $2", [id, userId]);
      return NextResponse.json({ ok: true, splits: [] });
    }

    // Validate sum matches transaction amount
    const sum = splits.reduce((acc, s) => acc + s.amount, 0);
    const diff = Math.abs(sum - tx.eur_amount);
    if (diff > 0.01) {
      return NextResponse.json(
        { error: `Sum of splits (${sum.toFixed(2)}) does not match transaction amount (${tx.eur_amount.toFixed(2)})` },
        { status: 400 }
      );
    }

    // Validate each split
    for (const s of splits) {
      if (!s.amount || !s.category) {
        return NextResponse.json({ error: "Each split requires amount and category" }, { status: 400 });
      }
    }

    // Run sequentially (replaces SQLite transaction)
    await sql("DELETE FROM transaction_splits WHERE transaction_id = $1", [id]);
    for (const s of splits) {
      await sql(
        "INSERT INTO transaction_splits (transaction_id, amount, category, expense_type, description) VALUES ($1, $2, $3, $4, $5)",
        [id, s.amount, s.category, s.expense_type ?? null, s.description ?? null]
      );
    }
    await sql("UPDATE transactions SET has_splits = 1 WHERE id = $1 AND user_id = $2", [id, userId]);

    const saved = await sql(
      "SELECT * FROM transaction_splits WHERE transaction_id = $1 ORDER BY id",
      [id]
    );
    return NextResponse.json({ ok: true, splits: saved });
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

    // Verify the transaction belongs to this user
    const txRows = await sql("SELECT id FROM transactions WHERE id = $1 AND user_id = $2", [id, userId]);
    if (!txRows[0]) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await sql("DELETE FROM transaction_splits WHERE transaction_id = $1", [id]);
    await sql("UPDATE transactions SET has_splits = 0 WHERE id = $1 AND user_id = $2", [id, userId]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
