import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

interface PositionRow {
  ticker: string;
  yahoo_ticker: string | null;
  name: string;
}

export async function POST() {
  const userId = await getUserId();

  const positions = await sql(
    "SELECT ticker, yahoo_ticker, name FROM investment_positions WHERE yahoo_ticker IS NOT NULL AND user_id = $1",
    [userId]
  ) as PositionRow[];

  if (positions.length === 0) {
    return NextResponse.json({ error: "No positions with Yahoo tickers found" }, { status: 404 });
  }

  const results: { ticker: string; name: string; price: number | null; error?: string }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Dynamic import to avoid issues with SSR
  const YahooFinance = (await import("yahoo-finance2")).default;
  const yf = new YahooFinance();

  for (const pos of positions) {
    try {
      const quote = await yf.quote(pos.yahoo_ticker!);
      const price = quote.regularMarketPrice;

      if (price && price > 0) {
        await sql(
          `INSERT INTO investment_prices (user_id, ticker, price, currency, date, source)
           VALUES ($1, $2, $3, 'EUR', $4, 'yahoo-finance')
           ON CONFLICT(user_id, ticker, date) DO UPDATE SET
             price = excluded.price,
             source = excluded.source,
             fetched_at = NOW()`,
          [userId, pos.ticker, price, today]
        );

        results.push({ ticker: pos.ticker, name: pos.name, price });
      } else {
        results.push({ ticker: pos.ticker, name: pos.name, price: null, error: "No price returned" });
      }
    } catch (err) {
      results.push({
        ticker: pos.ticker,
        name: pos.name,
        price: null,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const updated = results.filter((r) => r.price !== null).length;

  return NextResponse.json({
    updated,
    total: positions.length,
    date: today,
    results,
  });
}
