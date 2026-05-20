import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import { clearDemoTransactions } from "@/lib/demo-data";

export async function GET() {
  try {
    const userId = await getUserId();

    const transfers = await sql(`
      SELECT t.*,
        ft.description as from_description, ft.account as from_account,
        tt.description as to_description, tt.account as to_account
      FROM transfers t
      JOIN transactions ft ON ft.id = t.from_transaction_id AND ft.user_id = $1
      JOIN transactions tt ON tt.id = t.to_transaction_id AND tt.user_id = $1
      ORDER BY t.date DESC
    `, [userId]);

    return NextResponse.json(transfers);
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await req.json();
    const { amount, currency, from_account, to_account, date, description, notes } = body;

    if (!amount || !from_account || !to_account || !date) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (from_account === to_account) {
      return NextResponse.json({ error: "From and to accounts must be different" }, { status: 400 });
    }

    const desc = description || `Transferencia ${from_account} → ${to_account}`;
    const cur = currency || "EUR";

    try { await clearDemoTransactions(Number(userId)); } catch {}

    // Atomico en Postgres: un unico statement con CTEs encadenadas. Si alguna
    // parte falla (constraint, FK, etc.), toda la operacion aborta sin dejar
    // transacciones huerfanas. Neon HTTP serverless no soporta BEGIN/COMMIT
    // entre calls separadas; CTEs garantizan atomicidad en single-statement.
    // Incluye user_id en transfers (DB-NEW-001) — antes se omitia, dejando
    // filas sin dueño que no cascadean al borrar cuenta.
    const result = await sql(
      `WITH from_tx AS (
         INSERT INTO transactions (user_id, amount, currency, eur_amount, direction, description, category, expense_type, date, image_path, telegram_message_id, account)
         VALUES ($1, $2, $3, $2, 'expense', $4, 'transferencia', NULL, $5, NULL, NULL, $6)
         RETURNING id
       ),
       to_tx AS (
         INSERT INTO transactions (user_id, amount, currency, eur_amount, direction, description, category, expense_type, date, image_path, telegram_message_id, account)
         VALUES ($1, $2, $3, $2, 'income', $4, 'transferencia', NULL, $5, NULL, NULL, $7)
         RETURNING id
       ),
       tr AS (
         INSERT INTO transfers (from_transaction_id, to_transaction_id, user_id, amount, currency, date, notes)
         SELECT (SELECT id FROM from_tx), (SELECT id FROM to_tx), $1, $2, $3, $5, $8
         RETURNING id
       ),
       update_from AS (
         UPDATE transactions SET transfer_id = (SELECT id FROM tr)
         WHERE id = (SELECT id FROM from_tx) AND user_id = $1
         RETURNING id
       ),
       update_to AS (
         UPDATE transactions SET transfer_id = (SELECT id FROM tr)
         WHERE id = (SELECT id FROM to_tx) AND user_id = $1
         RETURNING id
       )
       SELECT
         (SELECT id FROM tr) AS transfer_id,
         (SELECT COUNT(*) FROM update_from) + (SELECT COUNT(*) FROM update_to) AS updated_count
      `,
      [userId, amount, cur, desc, date, from_account, to_account, notes || null]
    );

    const transferId = result[0]?.transfer_id;
    if (!transferId) {
      return NextResponse.json({ error: "Transfer creation failed" }, { status: 500 });
    }

    return NextResponse.json({ id: transferId }, { status: 201 });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
