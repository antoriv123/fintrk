import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sql } from "@/lib/db";

// Marca el panel "Completar primeros pasos" como cerrado por el usuario,
// tipicamente despues de que las 4 tareas se completaron y se mostro la
// celebracion. El dashboard deja de renderizar el panel cuando esto = true.
export async function POST() {
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    await sql(
      `INSERT INTO app_settings (user_id, key, value)
       VALUES ($1, 'setup_panel_dismissed', 'true')
       ON CONFLICT (user_id, key) DO UPDATE SET value = 'true', updated_at = NOW()`,
      [userId],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[setup/dismiss] error:", e);
    return NextResponse.json(
      { error: "Error al cerrar panel" },
      { status: 500 },
    );
  }
}
