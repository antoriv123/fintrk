/**
 * Public health endpoint para monitoring externo (UptimeRobot, Better Stack).
 *
 * Intencionalmente NO toca DB — un fallo de Neon no debe tirar este endpoint.
 * El objetivo es saber si el edge de Vercel responde; para liveness de DB
 * existe /api/ai/health (requiere auth).
 *
 * Runtime edge para latencia minima y evitar cold starts de funciones
 * serverless. No expone informacion sensible (version, build hash, etc).
 */
export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json(
    { status: "ok", ts: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
