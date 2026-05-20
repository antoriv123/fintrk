import { sql } from "./db";

export async function ensureDemoColumn(): Promise<void> {
  await sql(
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_demo INTEGER DEFAULT 0"
  );
}

interface DemoAccount {
  slug: string;
  name: string;
}

interface DemoSeed {
  daysAgo: number;
  direction: "income" | "expense";
  description: string;
  category: string;
  expenseType: "necesario" | "discrecional" | null;
  amount: number;
}

const DEMO_SEEDS: DemoSeed[] = [
  { daysAgo: 1, direction: "expense", description: "Mercadona", category: "supermercado", expenseType: "necesario", amount: 47.80 },
  { daysAgo: 2, direction: "expense", description: "Spotify", category: "suscripciones", expenseType: "discrecional", amount: 9.99 },
  { daysAgo: 3, direction: "expense", description: "Uber Eats", category: "ocio", expenseType: "discrecional", amount: 18.50 },
  { daysAgo: 5, direction: "expense", description: "Gasolina Repsol", category: "transporte", expenseType: "necesario", amount: 45.00 },
  { daysAgo: 7, direction: "expense", description: "Netflix", category: "suscripciones", expenseType: "discrecional", amount: 13.99 },
  { daysAgo: 10, direction: "expense", description: "Cena con amigos", category: "ocio", expenseType: "discrecional", amount: 32.40 },
  { daysAgo: 14, direction: "income", description: "Nómina", category: "salario", expenseType: null, amount: 1450.00 },
  { daysAgo: 15, direction: "expense", description: "Alquiler", category: "alquiler", expenseType: "necesario", amount: 650.00 },
];

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function seedDemoTransactions(
  userId: number,
  currency: string,
  accounts: DemoAccount[]
): Promise<number> {
  await ensureDemoColumn();

  const defaultAccount = accounts[0]?.slug ?? null;

  let inserted = 0;
  for (const seed of DEMO_SEEDS) {
    await sql(
      `INSERT INTO transactions
         (user_id, amount, currency, eur_amount, direction, description, category, expense_type, date, account, is_demo)
       VALUES ($1, $2, $3, $2, $4, $5, $6, $7, $8, $9, 1)`,
      [
        userId,
        seed.amount,
        currency,
        seed.direction,
        seed.description,
        seed.category,
        seed.expenseType,
        dateNDaysAgo(seed.daysAgo),
        defaultAccount,
      ]
    );
    inserted++;
  }
  return inserted;
}

export async function clearDemoTransactions(userId: number): Promise<number> {
  await ensureDemoColumn();
  const rows = await sql(
    "DELETE FROM transactions WHERE user_id = $1 AND is_demo = 1 RETURNING id",
    [userId]
  );
  return rows.length;
}

export async function hasDemoTransactions(userId: number): Promise<boolean> {
  await ensureDemoColumn();
  const rows = await sql(
    "SELECT 1 FROM transactions WHERE user_id = $1 AND is_demo = 1 LIMIT 1",
    [userId]
  );
  return rows.length > 0;
}
