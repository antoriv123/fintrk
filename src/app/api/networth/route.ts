import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";

interface NetWorthSnapshot {
  id: number;
  date: string;
  cash: number;
  investments: number;
  savings_goals: number;
  debts: number;
  total: number;
  notes: string | null;
  created_at: string;
}

interface AccountRow {
  slug: string;
  initial_balance: number;
}

interface SumRow {
  total: number;
}

interface PositionRow {
  id: number;
  ticker: string;
}

interface TxRow {
  type: string;
  shares: number;
  price_per_share: number;
}

interface PriceRow {
  price: number;
}

interface SavingsRow {
  total: number;
}

async function ensureNetWorthTable() {
  await sql(`
    CREATE TABLE IF NOT EXISTS net_worth_snapshots (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      cash REAL NOT NULL DEFAULT 0,
      investments REAL NOT NULL DEFAULT 0,
      savings_goals REAL NOT NULL DEFAULT 0,
      debts REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (NOW()::text)
    )
  `);
  await sql(
    "CREATE INDEX IF NOT EXISTS idx_nw_date ON net_worth_snapshots(date)"
  );
}

async function calculateCash(userId: number): Promise<number> {
  const accounts = await sql(
    "SELECT slug, initial_balance FROM accounts WHERE is_active = 1 AND user_id = $1",
    [userId]
  ) as AccountRow[];

  let totalCash = 0;

  for (const acct of accounts) {
    const incomeRows = await sql(
      `SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions
       WHERE account = $1 AND direction = 'income' AND user_id = $2`,
      [acct.slug, userId]
    ) as SumRow[];
    const income = incomeRows[0].total;

    const expenseRows = await sql(
      `SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions
       WHERE account = $1 AND direction = 'expense' AND user_id = $2`,
      [acct.slug, userId]
    ) as SumRow[];
    const expenses = expenseRows[0].total;

    totalCash += acct.initial_balance + income - expenses;
  }

  // Also include transactions with no account assigned
  const noAcctIncomeRows = await sql(
    `SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions
     WHERE (account IS NULL OR account = '')
     AND direction = 'income'
     AND LOWER(category) != 'transferencia'
     AND user_id = $1`,
    [userId]
  ) as SumRow[];
  const noAcctIncome = noAcctIncomeRows[0].total;

  const noAcctExpenseRows = await sql(
    `SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions
     WHERE (account IS NULL OR account = '')
     AND direction = 'expense'
     AND LOWER(category) != 'transferencia'
     AND user_id = $1`,
    [userId]
  ) as SumRow[];
  const noAcctExpenses = noAcctExpenseRows[0].total;

  totalCash += noAcctIncome - noAcctExpenses;

  return totalCash;
}

async function calculateInvestments(userId: number): Promise<number> {
  let totalValue = 0;

  const positions = await sql(
    "SELECT id, ticker FROM investment_positions WHERE user_id = $1",
    [userId]
  ) as PositionRow[];

  for (const pos of positions) {
    const txs = await sql(
      "SELECT type, shares, price_per_share FROM investment_transactions WHERE position_id = $1 ORDER BY date",
      [pos.id]
    ) as TxRow[];

    let totalShares = 0;
    for (const tx of txs) {
      if (tx.type === "buy") {
        totalShares += tx.shares;
      } else if (tx.type === "sell") {
        totalShares -= tx.shares;
      }
    }

    const priceRows = await sql(
      "SELECT price FROM investment_prices WHERE ticker = $1 ORDER BY date DESC LIMIT 1",
      [pos.ticker]
    ) as PriceRow[];
    const latestPrice = priceRows[0];

    if (latestPrice && totalShares > 0) {
      totalValue += totalShares * latestPrice.price;
    } else if (totalShares > 0) {
      // No market price available — use cost basis as fallback
      let costBasis = 0;
      for (const tx of txs) {
        if (tx.type === "buy") costBasis += tx.shares * tx.price_per_share;
      }
      totalValue += costBasis;
    }
  }

  return totalValue;
}

async function calculateSavingsGoals(userId: number): Promise<number> {
  const rows = await sql(
    "SELECT COALESCE(SUM(current_amount), 0) as total FROM savings_goals WHERE is_completed = 0 AND user_id = $1",
    [userId]
  ) as SavingsRow[];
  return rows[0].total;
}

async function getLatestDebts(userId: number): Promise<number> {
  const rows = await sql(
    "SELECT debts FROM net_worth_snapshots WHERE user_id = $1 ORDER BY date DESC, id DESC LIMIT 1",
    [userId]
  ) as { debts: number }[];
  return rows[0]?.debts ?? 0;
}

export async function GET(request: Request) {
  try {
    const userId = await getUserId();
    await ensureNetWorthTable();

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 30, 100) : 30;

    // Auto-calculate current net worth
    const cash = await calculateCash(userId);
    const investments = await calculateInvestments(userId);
    const savingsGoals = await calculateSavingsGoals(userId);
    const debts = await getLatestDebts(userId);
    const total = cash + investments + savingsGoals - debts;

    const current = { cash, investments, savings_goals: savingsGoals, debts, total };

    // Historical snapshots
    const history = await sql(
      "SELECT * FROM net_worth_snapshots WHERE user_id = $1 ORDER BY date ASC, id ASC LIMIT $2",
      [userId, limit]
    ) as NetWorthSnapshot[];

    return NextResponse.json({ current, history });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId();
    await ensureNetWorthTable();

    const body = await request.json() as {
      date?: string;
      cash?: number;
      investments?: number;
      savings_goals?: number;
      debts?: number;
      notes?: string;
    };

    if (body.cash == null || body.investments == null) {
      return NextResponse.json(
        { error: "cash and investments are required" },
        { status: 400 }
      );
    }

    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const savingsGoals = body.savings_goals ?? 0;
    const debts = body.debts ?? 0;
    const total = body.cash + body.investments + savingsGoals - debts;

    const insertRows = await sql(
      `INSERT INTO net_worth_snapshots (date, cash, investments, savings_goals, debts, total, notes, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [date, body.cash, body.investments, savingsGoals, debts, total, body.notes ?? null, userId]
    );

    const createdRows = await sql(
      "SELECT * FROM net_worth_snapshots WHERE id = $1 AND user_id = $2",
      [insertRows[0].id, userId]
    ) as NetWorthSnapshot[];

    return NextResponse.json({ snapshot: createdRows[0] }, { status: 201 });
  } catch (e) {
    console.error("Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
