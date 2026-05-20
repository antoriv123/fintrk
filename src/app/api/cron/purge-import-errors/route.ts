export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { timingSafeEqual } from "crypto";

/**
 * Purga semanal de import_error_reports expirados.
 * GDPR art. 5(1)(e): minimización del plazo de conservación. El formulario
 * "Reportar error" guarda el PDF bancario completo en base64 para que el
 * maintainer pueda reproducir. Sin TTL, esos PDFs persistirían indefinidamente.
 *
 * expires_at se añade por la migración 2026-04-23; tiene default NOW() + 30d.
 * Este cron borra las filas donde expires_at < NOW().
 *
 * Invocado por Vercel Cron semanal (ver vercel.json) con Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron purge-import-errors] CRON_SECRET no configurado");
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const expected = `Bearer ${cronSecret}`;
  if (
    authHeader.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    // Defensive: si la columna expires_at no existe aun (migracion pendiente),
    // no borramos nada — la query falla y devolvemos 0.
    const deleted = await sql(
      `DELETE FROM import_error_reports WHERE expires_at IS NOT NULL AND expires_at < NOW() RETURNING id`,
    ).catch(() => []);

    return NextResponse.json({ deleted: deleted.length });
  } catch (e) {
    console.error(`[cron purge-import-errors] ${e instanceof Error ? e.constructor.name : "Error"}`);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
