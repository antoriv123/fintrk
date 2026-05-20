import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

interface RecurringCandidate {
  description: string;
  category: string;
  expense_type: string | null;
  direction: string;
  average_amount: number;
  currency: string;
  occurrences: number;
  months_span: number;
  last_date: string;
  amount_change: number | null; // % change from previous to latest
}

/**
 * Detect recurring transactions by finding descriptions that appear
 * in 2+ different months with similar amounts.
 */
export async function POST() {
  const userId = await getUserId();

  // Find descriptions that appear in 2+ months
  const candidates = await sql(
    `WITH monthly AS (
      SELECT
        LOWER(TRIM(description)) as desc_key,
        description,
        category,
        expense_type,
        direction,
        currency,
        eur_amount,
        TO_CHAR(date::date, 'YYYY-MM') as month,
        date
      FROM transactions
      WHERE user_id = $1 AND category != 'transferencia'
    ),
    grouped AS (
      SELECT
        desc_key,
        MAX(description) as description,
        MAX(category) as category,
        MAX(expense_type) as expense_type,
        MAX(direction) as direction,
        MAX(currency) as currency,
        ROUND(AVG(eur_amount)::numeric, 2) as avg_amount,
        COUNT(DISTINCT month) as distinct_months,
        COUNT(*) as total_count,
        MAX(date) as last_date,
        MIN(date) as first_date
      FROM monthly
      GROUP BY desc_key
      HAVING COUNT(DISTINCT month) >= 2
    )
    SELECT * FROM grouped
    ORDER BY distinct_months DESC, avg_amount DESC
    LIMIT 50`,
    [userId]
  );

  const detected: RecurringCandidate[] = [];
  let created = 0;

  for (const row of candidates) {
    // Get last 2 amounts to detect price changes
    const lastTwo = await sql(
      `SELECT eur_amount FROM transactions
       WHERE user_id = $1 AND LOWER(TRIM(description)) = $2
       ORDER BY date DESC LIMIT 2`,
      [userId, row.desc_key]
    );

    let amountChange: number | null = null;
    if (lastTwo.length === 2) {
      const latest = Number(lastTwo[0].eur_amount);
      const previous = Number(lastTwo[1].eur_amount);
      if (previous > 0) {
        amountChange = Math.round(((latest - previous) / previous) * 100);
      }
    }

    const monthsSpan = Math.max(1,
      Math.round(
        (new Date(row.last_date).getTime() - new Date(row.first_date).getTime()) /
        (30 * 24 * 60 * 60 * 1000)
      )
    );

    detected.push({
      description: row.description,
      category: row.category,
      expense_type: row.expense_type,
      direction: row.direction,
      average_amount: Number(row.avg_amount),
      currency: row.currency,
      occurrences: Number(row.total_count),
      months_span: monthsSpan,
      last_date: row.last_date,
      amount_change: amountChange,
    });

    // Auto-create recurring transaction if not already tracked
    const exists = await sql(
      `SELECT id FROM recurring_transactions
       WHERE user_id = $1 AND LOWER(description) = $2`,
      [userId, row.desc_key]
    );

    if (!exists[0]) {
      const freq = monthsSpan > 0 && Number(row.distinct_months) / monthsSpan > 0.8
        ? "monthly"
        : "occasional";

      await sql(
        `INSERT INTO recurring_transactions
          (user_id, description, category, expense_type, direction, average_amount, currency, frequency, is_active, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9)`,
        [
          userId, row.description, row.category, row.expense_type,
          row.direction, Number(row.avg_amount), row.currency, freq, row.last_date,
        ]
      );
      created++;
    }
  }

  // Detect price increases (>10% increase in recurring expenses)
  const priceAlerts = detected
    .filter((d) => d.amount_change !== null && d.amount_change > 10 && d.direction === "expense")
    .map((d) => ({
      description: d.description,
      change: d.amount_change,
      average: d.average_amount,
    }));

  return NextResponse.json({
    detected: detected.length,
    created,
    priceAlerts,
    recurring: detected,
  });
}
