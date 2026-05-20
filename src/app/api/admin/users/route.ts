import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const users = await sql(`
    SELECT
      u.id,
      u.email,
      u.name,
      u.role,
      u.failed_login_attempts,
      u.last_failed_login,
      u.created_at,
      u.updated_at,
      COUNT(DISTINCT t.id) as transaction_count,
      COUNT(DISTINCT a.id) as account_count,
      MAX(t.created_at) as last_activity
    FROM users u
    LEFT JOIN transactions t ON t.user_id = u.id
    LEFT JOIN accounts a ON a.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);

  return NextResponse.json({ users });
}
