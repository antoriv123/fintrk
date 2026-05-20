import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sql } from "@/lib/db";

interface WaitlistRow {
  email: string;
  created_at: string;
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const rows = (await sql(
    "SELECT email, created_at FROM waitlist ORDER BY created_at DESC"
  )) as WaitlistRow[];

  return NextResponse.json({
    total: rows.length,
    entries: rows.map((r) => ({
      email: r.email,
      createdAt: r.created_at,
    })),
  });
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  const result = (await sql(
    "DELETE FROM waitlist WHERE email = $1 RETURNING id",
    [email]
  )) as { id: number }[];

  if (result.length === 0) {
    return NextResponse.json({ error: "Email no encontrado" }, { status: 404 });
  }

  const remainingResult = (await sql(
    "SELECT COUNT(*)::int AS count FROM waitlist"
  )) as { count: number }[];

  return NextResponse.json({
    ok: true,
    remaining: remainingResult[0]?.count ?? 0,
  });
}
