import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  let body: { action: string; userIds: number[]; title?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const { action, userIds } = body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json({ error: "userIds requerido" }, { status: 400 });
  }

  // Validate all IDs are numbers
  if (!userIds.every((id) => typeof id === "number" && Number.isInteger(id))) {
    return NextResponse.json({ error: "IDs invalidos" }, { status: 400 });
  }

  if (action === "delete") {
    // Filter out admin's own ID
    const safeIds = userIds.filter((id) => id !== admin.userId);
    if (safeIds.length === 0) {
      return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
    }

    // Also filter out other admins
    const adminRows = await sql(
      `SELECT id FROM users WHERE id = ANY($1::int[]) AND role = 'admin'`,
      [safeIds]
    );
    const adminIds = new Set(adminRows.map((r: { id: number }) => r.id));
    const toDelete = safeIds.filter((id) => !adminIds.has(id));

    if (toDelete.length === 0) {
      return NextResponse.json({ error: "No se pueden eliminar admins" }, { status: 400 });
    }

    let deleted = 0;
    for (const userId of toDelete) {
      try {
        await sql("DELETE FROM transaction_tags WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = $1)", [userId]);
        await sql("DELETE FROM transaction_splits WHERE transaction_id IN (SELECT id FROM transactions WHERE user_id = $1)", [userId]);
        await sql("DELETE FROM transfers WHERE user_id = $1", [userId]);
        await sql("DELETE FROM transactions WHERE user_id = $1", [userId]);
        await sql("DELETE FROM investment_transactions WHERE user_id = $1", [userId]);
        await sql("DELETE FROM investment_prices WHERE user_id = $1", [userId]);
        await sql("DELETE FROM investment_positions WHERE user_id = $1", [userId]);
        await sql("DELETE FROM recurring_transactions WHERE user_id = $1", [userId]);
        await sql("DELETE FROM subscriptions WHERE user_id = $1", [userId]);
        await sql("DELETE FROM accounts WHERE user_id = $1", [userId]);
        await sql("DELETE FROM savings_goals WHERE user_id = $1", [userId]);
        await sql("DELETE FROM budgets WHERE user_id = $1", [userId]);
        await sql("DELETE FROM envelopes WHERE user_id = $1", [userId]);
        await sql("DELETE FROM categorization_rules WHERE user_id = $1", [userId]);
        await sql("DELETE FROM net_worth_snapshots WHERE user_id = $1", [userId]);
        await sql("DELETE FROM app_settings WHERE user_id = $1", [userId]);
        await sql("DELETE FROM push_subscriptions WHERE user_id = $1", [userId]);
        await sql("DELETE FROM daily_checkins WHERE user_id = $1", [userId]);
        await sql("DELETE FROM streaks WHERE user_id = $1", [userId]);
        await sql("DELETE FROM users WHERE id = $1", [userId]);
        deleted++;
      } catch (e) {
        console.error(`Bulk delete user ${userId}:`, e instanceof Error ? e.message : e);
      }
    }

    return NextResponse.json({ ok: true, deleted, skipped: userIds.length - deleted });
  }

  if (action === "push") {
    // push disabled in OSS edition (APNs removed)
    return NextResponse.json({ ok: true, sent: 0, failed: 0, total: 0, note: "push disabled in OSS edition" });
  }

  if (action === "set_tier") {
    const tier = (body as Record<string, unknown>).tier;
    if (typeof tier !== "string" || !["free", "beta", "pro"].includes(tier)) {
      return NextResponse.json({ error: "Tier invalido" }, { status: 400 });
    }
    await sql(
      `UPDATE users SET subscription_tier = $1 WHERE id = ANY($2::int[])`,
      [tier, userIds]
    );
    return NextResponse.json({ ok: true, updated: userIds.length });
  }

  return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
}
