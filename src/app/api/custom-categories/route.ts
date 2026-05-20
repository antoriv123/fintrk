import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

export async function GET() {
  try {
    const userId = await getUserId();
    const categories = await sql(
      "SELECT slug, label, direction, icon, color FROM custom_categories WHERE user_id = $1 ORDER BY label",
      [userId]
    );
    return NextResponse.json({ categories });
  } catch (e) {
    console.error("Custom categories error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    const body = await req.json();

    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });

    const slug = label.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 50);
    const direction = body.direction === "income" ? "income" : "expense";

    // Selector visual de icono y color (PR #5). Si vienen vacios el cliente
    // pre-flag, dejamos NULL y el render hace fallback a CircleDot + gris.
    // Validamos icon como string corto (clave lucide) y color como hex tipo
    // #RRGGBB para evitar inyectar markup en estilos.
    const rawIcon = typeof body.icon === "string" ? body.icon.trim() : "";
    const icon = /^[A-Za-z0-9]{1,40}$/.test(rawIcon) ? rawIcon : null;
    const rawColor = typeof body.color === "string" ? body.color.trim() : "";
    const color = /^#[0-9A-Fa-f]{6}$/.test(rawColor) ? rawColor : null;

    await sql(
      `INSERT INTO custom_categories (user_id, slug, label, direction, icon, color)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, slug) DO UPDATE SET
         label = EXCLUDED.label,
         icon = COALESCE(EXCLUDED.icon, custom_categories.icon),
         color = COALESCE(EXCLUDED.color, custom_categories.color)`,
      [userId, slug, label, direction, icon, color]
    );

    return NextResponse.json({ slug, label, icon, color });
  } catch (e) {
    console.error("Custom category create error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
