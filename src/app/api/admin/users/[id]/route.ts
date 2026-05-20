import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  const [userRows, txStats, accounts, recentTx] = await Promise.all([
    sql("SELECT id, email, name, role, failed_login_attempts, last_failed_login, created_at, updated_at FROM users WHERE id = $1", [userId]),
    sql(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN direction = 'income' THEN 1 END) as income_count,
        COUNT(CASE WHEN direction = 'expense' THEN 1 END) as expense_count,
        COALESCE(SUM(CASE WHEN direction = 'income' THEN eur_amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN direction = 'expense' THEN eur_amount ELSE 0 END), 0) as total_expenses
      FROM transactions WHERE user_id = $1
    `, [userId]),
    sql("SELECT id, slug, name, currency, initial_balance FROM accounts WHERE user_id = $1", [userId]),
    sql("SELECT id, description, eur_amount, direction, category, date FROM transactions WHERE user_id = $1 ORDER BY date DESC LIMIT 10", [userId]),
  ]);

  if (userRows.length === 0) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    user: userRows[0],
    stats: txStats[0],
    accounts,
    recentTransactions: recentTx,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  // Unlock account
  if (body.action === "unlock") {
    await sql(
      "UPDATE users SET failed_login_attempts = 0, last_failed_login = NULL WHERE id = $1",
      [userId]
    );
    return NextResponse.json({ ok: true, message: "Cuenta desbloqueada" });
  }

  // Change role
  if (body.action === "set_role" && typeof body.role === "string") {
    const validRoles = ["user", "admin"];
    if (!validRoles.includes(body.role)) {
      return NextResponse.json({ error: "Rol invalido" }, { status: 400 });
    }
    await sql("UPDATE users SET role = $1 WHERE id = $2", [body.role, userId]);
    return NextResponse.json({ ok: true, message: `Rol cambiado a ${body.role}` });
  }

  // Change subscription tier
  if (body.action === "set_tier" && typeof body.tier === "string") {
    const validTiers = ["free", "beta", "pro"];
    if (!validTiers.includes(body.tier)) {
      return NextResponse.json({ error: "Tier invalido" }, { status: 400 });
    }
    await sql("UPDATE users SET subscription_tier = $1 WHERE id = $2", [body.tier, userId]);
    return NextResponse.json({ ok: true, message: `Tier cambiado a ${body.tier}` });
  }

  return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  // Prevent self-deletion
  if (admin.userId === userId) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  }

  try {
    // Delete all user data in correct order (foreign keys don't have CASCADE)
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

    return NextResponse.json({ ok: true, message: "Usuario eliminado" });
  } catch (e) {
    console.error("Delete user error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error al eliminar: " + (e instanceof Error ? e.message : "desconocido") }, { status: 500 });
  }
}
