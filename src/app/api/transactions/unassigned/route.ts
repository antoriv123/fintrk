export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

/**
 * List unassigned transactions (account IS NULL OR '').
 */
export async function GET() {
  try {
    const userId = await getUserId();
    const rows = await sql(
      `SELECT id, date, description, amount, eur_amount, currency, direction, category, expense_type
       FROM transactions
       WHERE user_id = $1 AND (account IS NULL OR account = '')
       ORDER BY date DESC, id DESC
       LIMIT 500`,
      [userId],
    );
    return NextResponse.json({ transactions: rows, count: rows.length });
  } catch (e) {
    console.error("[unassigned GET]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

/**
 * Bulk action on unassigned transactions.
 * Body: { action: "reassign", accountSlug: string }
 *     | { action: "delete" }
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "reassign") {
      const slug = typeof body.accountSlug === "string" ? body.accountSlug.trim() : "";
      if (!slug) {
        return NextResponse.json({ error: "accountSlug requerido" }, { status: 400 });
      }
      // Verify the account belongs to this user.
      const [acc] = await sql(
        "SELECT slug FROM accounts WHERE user_id = $1 AND slug = $2 AND is_active = 1",
        [userId, slug],
      );
      if (!acc) {
        return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
      }
      const result = await sql(
        "UPDATE transactions SET account = $1 WHERE user_id = $2 AND (account IS NULL OR account = '')",
        [slug, userId],
      ) as unknown as { rowCount?: number } | unknown[];
      const affected = Array.isArray(result) ? result.length : (result?.rowCount ?? 0);
      return NextResponse.json({ ok: true, reassigned: affected });
    }

    if (action === "delete") {
      try {
        await sql(
          "DELETE FROM transaction_splits WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = $1 AND (account IS NULL OR account = ''))",
          [userId],
        );
      } catch { /* optional table */ }
      const result = await sql(
        "DELETE FROM transactions WHERE user_id = $1 AND (account IS NULL OR account = '')",
        [userId],
      ) as unknown as { rowCount?: number } | unknown[];
      const deleted = Array.isArray(result) ? result.length : (result?.rowCount ?? 0);
      return NextResponse.json({ ok: true, deleted });
    }

    return NextResponse.json({ error: "action inválida — usa 'reassign' o 'delete'" }, { status: 400 });
  } catch (e) {
    console.error("[unassigned POST]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
