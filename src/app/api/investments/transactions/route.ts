import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

interface TxRow {
  id: number;
  position_id: number;
  type: string;
  shares: number;
  price_per_share: number;
  currency: string;
  commission: number;
  date: string;
  notes: string | null;
  created_at: string;
  ticker: string;
  name: string;
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  const positionId = req.nextUrl.searchParams.get("position_id");

  let query = `
    SELECT t.*, p.ticker, p.name
    FROM investment_transactions t
    JOIN investment_positions p ON p.id = t.position_id
    WHERE p.user_id = $1
  `;
  const queryParams: unknown[] = [userId];

  if (positionId) {
    query += " AND t.position_id = $2";
    queryParams.push(parseInt(positionId, 10));
  }

  query += " ORDER BY t.date DESC";

  const rows = await sql(query, queryParams) as TxRow[];
  return NextResponse.json({ transactions: rows });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  const body = await req.json();
  const { position_id, type, shares, price_per_share, currency, commission, date, notes } = body;

  if (!position_id || !type || shares === undefined || price_per_share === undefined || !date) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["buy", "sell", "dividend"].includes(type)) {
    return NextResponse.json({ error: "Invalid type. Must be buy, sell, or dividend" }, { status: 400 });
  }

  // Verify the position belongs to this user
  const positionRows = await sql(
    "SELECT id FROM investment_positions WHERE id = $1 AND user_id = $2",
    [position_id, userId]
  );
  if (positionRows.length === 0) {
    return NextResponse.json({ error: "Position not found" }, { status: 404 });
  }

  const rows = await sql(
    `INSERT INTO investment_transactions (position_id, type, shares, price_per_share, currency, commission, date, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      position_id,
      type,
      shares,
      price_per_share,
      currency ?? "EUR",
      commission ?? 0,
      date,
      notes ?? null,
    ]
  );

  return NextResponse.json({ id: rows[0].id }, { status: 201 });
}
