import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const [
    usersCount,
    transactionsCount,
    accountsCount,
    recentSignups,
    userStats,
  ] = await Promise.all([
    sql("SELECT COUNT(*) as count FROM users"),
    sql("SELECT COUNT(*) as count FROM transactions"),
    sql("SELECT COUNT(*) as count FROM accounts"),
    sql(
      `SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 5`
    ),
    sql(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.subscription_tier,
        u.created_at,
        u.last_login_at,
        u.failed_login_attempts,
        u.last_failed_login,
        COUNT(DISTINCT t.id) as transaction_count,
        COUNT(DISTINCT a.id) as account_count,
        COALESCE(SUM(CASE WHEN t.direction = 'income' THEN t.eur_amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN t.direction = 'expense' THEN t.eur_amount ELSE 0 END), 0) as total_expenses,
        MAX(t.created_at) as last_activity,
        (SELECT COUNT(*) FROM push_subscriptions ps WHERE ps.user_id = u.id) as push_enabled
      FROM users u
      LEFT JOIN transactions t ON t.user_id = u.id
      LEFT JOIN accounts a ON a.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `),
  ]);

  // Waitlist: try to read from DB or file
  let waitlistCount = 0;
  try {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const data = await readFile(join(process.cwd(), "data", "waitlist.json"), "utf-8");
    const entries = JSON.parse(data);
    waitlistCount = Array.isArray(entries) ? entries.length : 0;
  } catch {
    waitlistCount = 0;
  }

  // Growth stats
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

  const [signupsThisMonth, signupsLastMonth, txThisMonth, txLastMonth] = await Promise.all([
    sql("SELECT COUNT(*) as count FROM users WHERE TO_CHAR(created_at, 'YYYY-MM') = $1", [thisMonth]),
    sql("SELECT COUNT(*) as count FROM users WHERE TO_CHAR(created_at, 'YYYY-MM') = $1", [lastMonthStr]),
    sql("SELECT COUNT(*) as count FROM transactions WHERE date LIKE $1", [thisMonth + "%"]),
    sql("SELECT COUNT(*) as count FROM transactions WHERE date LIKE $1", [lastMonthStr + "%"]),
  ]);

  return NextResponse.json({
    totals: {
      users: Number(usersCount[0].count),
      transactions: Number(transactionsCount[0].count),
      accounts: Number(accountsCount[0].count),
      waitlist: waitlistCount,
    },
    growth: {
      signupsThisMonth: Number(signupsThisMonth[0].count),
      signupsLastMonth: Number(signupsLastMonth[0].count),
      txThisMonth: Number(txThisMonth[0].count),
      txLastMonth: Number(txLastMonth[0].count),
    },
    recentSignups,
    userStats,
  });
}
