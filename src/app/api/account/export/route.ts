export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

/**
 * Full account export — JSON with every row belonging to the user.
 * Used to fulfil GDPR right to data portability.
 *
 * ?format=csv -> returns a CSV with transactions only (more practical for
 * users importing to a spreadsheet). JSON remains the default for a
 * complete portable dump.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    const format = req.nextUrl.searchParams.get("format") ?? "json";

    if (format === "csv") {
      const transactions = await sql(
        "SELECT date, direction, description, amount, currency, eur_amount, category, expense_type, account FROM transactions WHERE user_id = $1 ORDER BY date DESC",
        [userId],
      );
      const header = ["date", "direction", "description", "amount", "currency", "eur_amount", "category", "expense_type", "account"];
      const lines = [header.join(",")];
      for (const tx of transactions as Record<string, unknown>[]) {
        lines.push(
          header
            .map((h) => {
              const v = tx[h];
              if (v == null) return "";
              const s = String(v);
              if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
              return s;
            })
            .join(","),
        );
      }
      const body = lines.join("\n");
      const filename = `fintrk-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Art. 20 RGPD: portabilidad. Incluimos TODAS las tablas con datos del
    // usuario. Nombres correctos verificados contra schema.sql — antes
    // consultabamos tablas inexistentes (goals, streak_check_ins,
    // custom_categories) y el .catch(()=>[]) lo silenciaba, devolviendo
    // exports vacios sin avisar.
    // Si una query falla ahora, falla el export entero — preferimos errores
    // visibles a exports mentirosos.
    const [user] = await sql(
      "SELECT id, email, name, created_at, privacy_accepted_at, privacy_version, terms_accepted_at, terms_version FROM users WHERE id = $1",
      [userId],
    );
    const transactions = await sql("SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC", [userId]);
    const transactionSplits = await sql(
      "SELECT ts.* FROM transaction_splits ts JOIN transactions t ON t.id = ts.transaction_id WHERE t.user_id = $1",
      [userId],
    );
    const transactionTags = await sql(
      "SELECT tt.* FROM transaction_tags tt JOIN transactions t ON t.id = tt.transaction_id WHERE t.user_id = $1",
      [userId],
    ).catch(() => []);
    const transfers = await sql("SELECT * FROM transfers WHERE user_id = $1", [userId]);
    const accounts = await sql("SELECT * FROM accounts WHERE user_id = $1", [userId]);
    const subscriptions = await sql("SELECT * FROM subscriptions WHERE user_id = $1", [userId]);
    const recurring = await sql("SELECT * FROM recurring_transactions WHERE user_id = $1", [userId]);
    const budgets = await sql("SELECT * FROM budgets WHERE user_id = $1", [userId]);
    const envelopes = await sql("SELECT * FROM envelopes WHERE user_id = $1", [userId]);
    const savingsGoals = await sql("SELECT * FROM savings_goals WHERE user_id = $1", [userId]);
    const investmentPositions = await sql("SELECT * FROM investment_positions WHERE user_id = $1", [userId]);
    const investmentTransactions = await sql("SELECT * FROM investment_transactions WHERE user_id = $1", [userId]);
    const investmentPrices = await sql("SELECT * FROM investment_prices WHERE user_id = $1", [userId]);
    const netWorthSnapshots = await sql(
      "SELECT * FROM net_worth_snapshots WHERE user_id = $1 ORDER BY date DESC",
      [userId],
    );
    const rules = await sql("SELECT * FROM categorization_rules WHERE user_id = $1", [userId]);
    const settings = await sql("SELECT * FROM app_settings WHERE user_id = $1", [userId]);
    const dailyCheckins = await sql(
      "SELECT * FROM daily_checkins WHERE user_id = $1 ORDER BY date DESC",
      [userId],
    );
    const streaks = await sql("SELECT * FROM streaks WHERE user_id = $1", [userId]).catch(() => []);
    const applePayTokens = await sql(
      "SELECT id, token_prefix, created_at, revoked_at, last_used_at FROM apple_pay_tokens WHERE user_id = $1",
      [userId],
    ).catch(() => []);
    const applePayImports = await sql(
      "SELECT * FROM apple_pay_imports WHERE user_id = $1 ORDER BY created_at DESC",
      [userId],
    ).catch(() => []);

    const payload = {
      exported_at: new Date().toISOString(),
      format_version: 2,
      user: user ?? null,
      accounts,
      transactions,
      transaction_splits: transactionSplits,
      transaction_tags: transactionTags,
      transfers,
      subscriptions,
      recurring_transactions: recurring,
      budgets,
      envelopes,
      savings_goals: savingsGoals,
      investment_positions: investmentPositions,
      investment_transactions: investmentTransactions,
      investment_prices: investmentPrices,
      net_worth_snapshots: netWorthSnapshots,
      categorization_rules: rules,
      settings,
      daily_checkins: dailyCheckins,
      streaks,
      apple_pay_tokens: applePayTokens,
      apple_pay_imports: applePayImports,
    };

    const body = JSON.stringify(payload, null, 2);
    const filename = `fintrk-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[account export] error:", e);
    return NextResponse.json({ error: "No se pudo exportar" }, { status: 500 });
  }
}
