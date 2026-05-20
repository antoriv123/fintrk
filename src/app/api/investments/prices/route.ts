import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

interface PriceRow {
  id: number;
  ticker: string;
  price: number;
  currency: string;
  date: string;
  source: string;
  fetched_at: string;
}

export async function GET() {
  // Prices are shared market data, but only return prices for tickers the user owns
  const userId = await getUserId();

  const prices = await sql(`
    SELECT p1.*
    FROM investment_prices p1
    INNER JOIN (
      SELECT ticker, MAX(date) as max_date
      FROM investment_prices
      GROUP BY ticker
    ) p2 ON p1.ticker = p2.ticker AND p1.date = p2.max_date
    WHERE p1.ticker IN (SELECT ticker FROM investment_positions WHERE user_id = $1)
    ORDER BY p1.ticker
  `, [userId]) as PriceRow[];

  return NextResponse.json({ prices });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const body = await req.json();
  const { ticker, price, currency, date } = body;

  if (!ticker || price === undefined) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify the user owns a position with this ticker
  const posRows = await sql(
    "SELECT id FROM investment_positions WHERE ticker = $1 AND user_id = $2",
    [ticker, userId]
  );
  if (posRows.length === 0) {
    return NextResponse.json({ error: "Position not found" }, { status: 404 });
  }

  const priceDate = date ?? new Date().toISOString().slice(0, 10);

  await sql(
    `INSERT INTO investment_prices (user_id, ticker, price, currency, date, source)
     VALUES ($1, $2, $3, $4, $5, 'manual')
     ON CONFLICT(user_id, ticker, date) DO UPDATE SET price = excluded.price, currency = excluded.currency, fetched_at = NOW()`,
    [userId, ticker, price, currency ?? "EUR", priceDate]
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
