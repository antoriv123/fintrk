import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

interface PositionRow {
  id: number;
  ticker: string;
  name: string;
  asset_type: string;
  account: string | null;
  yahoo_ticker: string | null;
  created_at: string;
}

interface TxRow {
  type: string;
  shares: number;
  price_per_share: number;
  commission: number;
}

interface PriceRow {
  price: number;
  currency: string;
  date: string;
}

export async function GET() {
  const userId = await getUserId();

  const positions = await sql(
    "SELECT * FROM investment_positions WHERE user_id = $1 ORDER BY asset_type, ticker",
    [userId]
  ) as PositionRow[];

  const result = [];

  for (const pos of positions) {
    const txs = await sql(
      "SELECT type, shares, price_per_share, commission FROM investment_transactions WHERE position_id = $1 ORDER BY date",
      [pos.id]
    ) as TxRow[];

    let totalShares = 0;
    let totalCostBasis = 0;
    let dividendsTotal = 0;

    for (const tx of txs) {
      if (tx.type === "buy") {
        totalCostBasis += tx.shares * tx.price_per_share + (tx.commission ?? 0);
        totalShares += tx.shares;
      } else if (tx.type === "sell") {
        if (totalShares > 0) {
          const avgBefore = totalCostBasis / totalShares;
          totalShares -= tx.shares;
          totalCostBasis = totalShares * avgBefore;
        }
      } else if (tx.type === "dividend") {
        dividendsTotal += tx.price_per_share;
      }
    }

    const avgCost = totalShares > 0 ? totalCostBasis / totalShares : 0;
    const totalInvested = totalCostBasis;

    const priceRows = await sql(
      "SELECT price, currency, date FROM investment_prices WHERE ticker = $1 ORDER BY date DESC LIMIT 1",
      [pos.ticker]
    ) as PriceRow[];
    const latestPrice = priceRows[0];

    const currentPrice = latestPrice?.price ?? 0;
    const currentValue = totalShares * currentPrice;
    const pnlEur = currentValue - totalInvested;
    const pnlPct = totalInvested > 0 ? (pnlEur / totalInvested) * 100 : 0;

    result.push({
      id: pos.id,
      ticker: pos.ticker,
      name: pos.name,
      asset_type: pos.asset_type,
      account: pos.account,
      yahoo_ticker: pos.yahoo_ticker,
      price_date: latestPrice?.date ?? null,
      total_shares: totalShares,
      avg_cost: avgCost,
      total_invested: totalInvested,
      current_price: currentPrice,
      current_value: currentValue,
      pnl_eur: pnlEur,
      pnl_pct: pnlPct,
      weight: 0,
      dividends_total: dividendsTotal,
    });
  }

  const totalValue = result.reduce((s, p) => s + p.current_value, 0);
  for (const p of result) {
    p.weight = totalValue > 0 ? (p.current_value / totalValue) * 100 : 0;
  }

  const totalInvested = result.reduce((s, p) => s + p.total_invested, 0);
  const totalPnlEur = totalValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnlEur / totalInvested) * 100 : 0;
  const totalDividends = result.reduce((s, p) => s + p.dividends_total, 0);

  const byType: Record<string, number> = { etf: 0, stock: 0, crypto: 0, index_fund: 0, fund: 0 };
  for (const p of result) {
    const key = p.asset_type;
    byType[key] = (byType[key] ?? 0) + p.current_value;
  }

  return NextResponse.json({
    positions: result,
    totals: {
      total_invested: totalInvested,
      current_value: totalValue,
      total_pnl_eur: totalPnlEur,
      total_pnl_pct: totalPnlPct,
      total_dividends: totalDividends,
      by_type: byType,
    },
  });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const body = await req.json();
  const { ticker, name, asset_type, account } = body;

  if (!ticker || !name || !asset_type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const rows = await sql(
    "INSERT INTO investment_positions (ticker, name, asset_type, account, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [ticker, name, asset_type, account ?? null, userId]
  );

  return NextResponse.json({ id: rows[0].id }, { status: 201 });
}
