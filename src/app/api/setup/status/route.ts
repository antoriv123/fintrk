import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sql } from "@/lib/db";

// Estado del panel "Completar primeros pasos" del dashboard. Agregado en
// un solo round-trip para que el dashboard no haga 4-5 fetches paralelos
// solo para pintar el checklist.
//
// 5 tareas core:
//   1. account            -> tiene >=1 cuenta configurada (balance o tx)
//   2. importStatement    -> importó al menos un extracto (heuristica)
//   3. fixedExpenses      -> tiene >=1 suscripcion activa
//   4. customCategory     -> creó >=1 categoria personalizada
//   5. goal               -> tiene >=1 objetivo en app_settings
export async function GET() {
  const headersList = await headers();
  const userId = headersList.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const [accounts, subs, customCats, goalsRows, dismissed, importBucket] = await Promise.all([
      sql(
        `SELECT id, initial_balance FROM accounts WHERE user_id = $1`,
        [userId],
      ),
      sql(
        `SELECT 1 FROM subscriptions WHERE user_id = $1 AND active = 1 LIMIT 1`,
        [userId],
      ),
      sql(
        `SELECT 1 FROM custom_categories WHERE user_id = $1 LIMIT 1`,
        [userId],
      ),
      sql(
        `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'onboarding_goals' LIMIT 1`,
        [userId],
      ),
      sql(
        `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'setup_panel_dismissed' LIMIT 1`,
        [userId],
      ),
      // Heuristica para detectar import de extracto: 5+ transacciones
      // creadas en el mismo minuto. Manual entry o scan no llegan ahi.
      sql(
        `SELECT 1
         FROM (
           SELECT date_trunc('minute', created_at) AS bucket, COUNT(*) AS n
           FROM transactions
           WHERE user_id = $1
           GROUP BY bucket
         ) sub
         WHERE n >= 5
         LIMIT 1`,
        [userId],
      ),
    ]);

    // Una cuenta cuenta como "configurada" si tiene balance inicial o si
    // ya tiene transacciones (extracto importado o Apple Pay funcionando).
    let hasAccountConfigured = false;
    if (accounts.length > 0) {
      const accountIds = accounts.map((a) => a.id);
      const accountsWithTx = (await sql(
        `SELECT DISTINCT account_id FROM transactions WHERE user_id = $1 AND account_id = ANY($2::int[])`,
        [userId, accountIds],
      )) as Array<{ account_id: number }>;
      const txAccountIds = new Set(accountsWithTx.map((r) => r.account_id));
      hasAccountConfigured = accounts.some(
        (a) => Number(a.initial_balance) !== 0 || txAccountIds.has(Number(a.id)),
      );
    }

    let hasGoal = false;
    if (goalsRows.length > 0) {
      try {
        const parsed = JSON.parse(String(goalsRows[0].value ?? "[]"));
        hasGoal = Array.isArray(parsed) && parsed.length > 0;
      } catch {
        hasGoal = false;
      }
    }

    const tasks = {
      account: hasAccountConfigured,
      importStatement: importBucket.length > 0,
      fixedExpenses: subs.length > 0,
      customCategory: customCats.length > 0,
      goal: hasGoal,
    };

    const completed = Object.values(tasks).filter(Boolean).length;
    const total = Object.keys(tasks).length;

    return NextResponse.json({
      tasks,
      completed,
      total,
      panelDismissed:
        dismissed.length > 0 &&
        String(dismissed[0].value).toLowerCase() === "true",
      allDone: completed === total,
    });
  } catch (e) {
    console.error("[setup/status] error:", e);
    return NextResponse.json(
      { error: "Error al leer estado de setup" },
      { status: 500 },
    );
  }
}
