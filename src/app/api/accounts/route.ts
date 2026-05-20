import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getUserId } from "@/lib/get-user-id";
import type { Transaction } from "@/lib/db";

const VALID_INTEREST_FREQUENCIES = ["daily", "monthly", "quarterly", "annual"] as const;
type InterestPaymentFrequency = typeof VALID_INTEREST_FREQUENCIES[number];

interface AccountRow {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  initial_balance: number;
  currency: string;
  color: string;
  is_active: number;
  annual_interest_rate: number;
  interest_payment_frequency: InterestPaymentFrequency | null;
  scope: string;
  created_at: string;
}

interface AccountWithBalance extends AccountRow {
  current_balance: number;
  total_income: number;
  total_expenses: number;
  transaction_count: number;
  recent_transactions: Transaction[];
}

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  const includeTx = req.nextUrl.searchParams.get("transactions") === "1";

  const accounts = await sql(
    "SELECT * FROM accounts WHERE user_id = $1 AND is_active = 1 ORDER BY created_at ASC",
    [userId]
  ) as AccountRow[];

  // Single aggregate query for all account balances
  const balanceRows = await sql(
    `SELECT
       account,
       COALESCE(SUM(CASE WHEN direction = 'income' THEN eur_amount ELSE 0 END), 0) as all_income,
       COALESCE(SUM(CASE WHEN direction = 'expense' THEN eur_amount ELSE 0 END), 0) as all_expense,
       COALESCE(SUM(CASE WHEN direction = 'income' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as display_income,
       COALESCE(SUM(CASE WHEN direction = 'expense' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as display_expense,
       COUNT(*) as tx_count
     FROM transactions
     WHERE user_id = $1
     GROUP BY account`,
    [userId]
  ) as { account: string | null; all_income: number; all_expense: number; display_income: number; display_expense: number; tx_count: number }[];

  const balanceMap = new Map(balanceRows.map((r) => [r.account ?? "", r]));

  // Batch-fetch recent transactions for ALL accounts in one query (avoids N+1)
  const recentTxMap = new Map<string, Transaction[]>();
  if (includeTx && accounts.length > 0) {
    const recentTx = await sql(
      `SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY account ORDER BY date DESC, id DESC) as rn
        FROM transactions WHERE user_id = $1
      ) sub WHERE rn <= 10 ORDER BY account, date DESC, id DESC`,
      [userId]
    ) as (Transaction & { rn: number })[];
    for (const tx of recentTx) {
      const acc = tx.account ?? "";
      if (!recentTxMap.has(acc)) recentTxMap.set(acc, []);
      recentTxMap.get(acc)!.push(tx);
    }
  }

  const accountsWithBalances: AccountWithBalance[] = [];
  for (const account of accounts) {
    const b = balanceMap.get(account.slug);
    accountsWithBalances.push({
      ...account,
      current_balance: account.initial_balance + (b?.all_income ?? 0) - (b?.all_expense ?? 0),
      total_income: b?.display_income ?? 0,
      total_expenses: b?.display_expense ?? 0,
      transaction_count: b?.tx_count ?? 0,
      recent_transactions: recentTxMap.get(account.slug) ?? [],
    });
  }

  const totalBalance = accountsWithBalances.reduce((sum, a) => sum + a.current_balance, 0);

  // Unassigned transactions — aggregate from balanceRows where account is null or empty
  const unassignedNull = balanceMap.get("") ?? { display_income: 0, display_expense: 0, tx_count: 0 };
  const unassigned = {
    total_income: unassignedNull.display_income ?? 0,
    total_expenses: unassignedNull.display_expense ?? 0,
    transaction_count: unassignedNull.tx_count ?? 0,
    recent_transactions: includeTx
      ? await sql(
          "SELECT * FROM transactions WHERE user_id = $1 AND (account IS NULL OR account = '') ORDER BY date DESC, id DESC LIMIT 10",
          [userId]
        ) as Transaction[]
      : [],
  };

  return NextResponse.json({ accounts: accountsWithBalances, totalBalance, unassigned });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  const body = await request.json();

  const slug = typeof body.slug === "string"
    ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 50)
    : "";
  const name = typeof body.name === "string"
    ? body.name.trim().replace(/<[^>]*>/g, "").slice(0, 100)
    : "";
  const emoji = typeof body.emoji === "string"
    ? body.emoji.trim().slice(0, 4)
    : "🏦";
  const initialBalance = typeof body.initial_balance === "number" && isFinite(body.initial_balance)
    ? body.initial_balance
    : 0;
  const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "MXN", "ARS", "COP", "CLP", "PEN", "UYU", "BRL", "CAD", "AUD", "CHF", "JPY"];
  const currency = typeof body.currency === "string" && SUPPORTED_CURRENCIES.includes(body.currency.toUpperCase())
    ? body.currency.toUpperCase()
    : "EUR";
  const color = typeof body.color === "string" && /^#[0-9a-f]{6}$/i.test(body.color)
    ? body.color
    : "#3b82f6";

  // Remunerated account fields
  // annual_interest_rate is stored as a decimal (e.g. 0.025 for 2.5% APR)
  const rawRate = typeof body.annual_interest_rate === "number" && isFinite(body.annual_interest_rate)
    ? body.annual_interest_rate
    : 0;
  const annualInterestRate = Math.max(0, Math.min(1, rawRate));
  const interestPaymentFrequency: InterestPaymentFrequency =
    typeof body.interest_payment_frequency === "string" &&
    (VALID_INTEREST_FREQUENCIES as readonly string[]).includes(body.interest_payment_frequency)
      ? (body.interest_payment_frequency as InterestPaymentFrequency)
      : "monthly";
  const scope = typeof body.scope === "string" && ["personal", "business"].includes(body.scope)
    ? body.scope
    : "personal";
  const scopeLabel = typeof body.scope_label === "string"
    ? body.scope_label.trim().slice(0, 50) || null
    : null;

  if (!slug || !name) {
    return NextResponse.json({ error: "slug and name are required" }, { status: 400 });
  }

  // Check for duplicate slug for this user
  const existingRows = await sql("SELECT id FROM accounts WHERE user_id = $1 AND slug = $2", [userId, slug]);
  if (existingRows[0]) {
    return NextResponse.json({ error: "Ya existe una cuenta con ese slug" }, { status: 409 });
  }

  try {
    await sql(
      "INSERT INTO accounts (user_id, slug, name, emoji, initial_balance, currency, color, annual_interest_rate, interest_payment_frequency, scope, scope_label) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
      [userId, slug, name, emoji, initialBalance, currency, color, annualInterestRate, interestPaymentFrequency, scope, scopeLabel]
    );

    // Fetch the newly created account by slug (more reliable than RETURNING across Neon versions)
    const createdRows = await sql(
      "SELECT * FROM accounts WHERE user_id = $1 AND slug = $2",
      [userId, slug]
    );
    const created = createdRows[0] as AccountRow;

    if (!created) {
      console.error("Account INSERT succeeded but SELECT returned nothing", { userId, slug, name });
      return NextResponse.json({ error: "Error interno al crear la cuenta" }, { status: 500 });
    }

    const newAccount: AccountWithBalance = {
      ...created,
      current_balance: created.initial_balance,
      total_income: 0,
      total_expenses: 0,
      transaction_count: 0,
      recent_transactions: [],
    };

    return NextResponse.json({ account: newAccount }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Account creation error:", msg, { userId, slug, name });
    // Duplicate slug
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("UNIQUE")) {
      return NextResponse.json({ error: "Ya existe una cuenta con ese nombre" }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al crear la cuenta: " + msg }, { status: 500 });
  }
}
