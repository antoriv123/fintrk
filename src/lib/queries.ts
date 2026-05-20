import { sql, type Transaction } from "./db";

export interface Summary {
  balance: number;
  income: number;
  expenses: number;
  prevIncome: number;
  prevExpenses: number;
  byCategory: { category: string; total: number }[];
  byExpenseType: { expense_type: string; total: number }[];
  weeklyTrend: { week: string; income: number; expenses: number }[];
  incomeByCategory: { category: string; total: number }[];
  lastTransactionDate: string | null;
}

export async function getTransactions(userId: number, params: {
  from?: string;
  to?: string;
  category?: string;
  expense_type?: string;
  direction?: string;
  search?: string;
  tag?: string;
  account?: string;
  reconciled?: string;
  limit?: number;
  offset?: number;
  /** "date" (default, sorts by t.date) or "created" (sorts by t.created_at) */
  sort?: "date" | "created";
  /** When sort="created", optionally limit to last N days. */
  recentDays?: number;
}): Promise<Transaction[]> {
  const conditions: string[] = ["t.user_id = $1"];
  const values: unknown[] = [userId];
  let paramIndex = 2;
  const sortMode = params.sort === "created" ? "created" : "date";

  // Recent-added mode ignores date filters; instead filters by created_at window.
  if (sortMode === "created") {
    if (params.recentDays && params.recentDays > 0) {
      conditions.push(`t.created_at >= NOW() - ($${paramIndex++}::int * INTERVAL '1 day')`);
      values.push(params.recentDays);
    }
  } else {
    if (params.from) { conditions.push(`t.date >= $${paramIndex++}`); values.push(params.from); }
    if (params.to) { conditions.push(`t.date <= $${paramIndex++}`); values.push(params.to); }
  }
  if (params.category) { conditions.push(`t.category = $${paramIndex++}`); values.push(params.category); }
  if (params.expense_type) { conditions.push(`t.expense_type = $${paramIndex++}`); values.push(params.expense_type); }
  if (params.direction) { conditions.push(`t.direction = $${paramIndex++}`); values.push(params.direction); }
  if (params.search) { conditions.push(`t.description ILIKE $${paramIndex++}`); values.push(`%${params.search}%`); }
  if (params.tag) { conditions.push(`EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt.transaction_id = t.id AND tt.tag = $${paramIndex++})`); values.push(params.tag.toLowerCase().trim()); }
  if (params.account === "unassigned") {
    conditions.push("(t.account IS NULL OR t.account = '')");
  } else if (params.account) {
    conditions.push(`t.account = $${paramIndex++}`);
    values.push(params.account);
  }
  if (params.reconciled === "yes") { conditions.push("t.is_reconciled = 1"); }
  if (params.reconciled === "no") { conditions.push("(t.is_reconciled = 0 OR t.is_reconciled IS NULL)"); }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const orderBy = sortMode === "created"
    ? "t.created_at DESC, t.id DESC"
    : "t.date DESC, t.id DESC";

  const rows = await sql(
    `SELECT t.*, STRING_AGG(tt.tag, ',') as tags_csv
     FROM transactions t
     LEFT JOIN transaction_tags tt ON tt.transaction_id = t.id
     ${where}
     GROUP BY t.id
     ORDER BY ${orderBy} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, limit, offset]
  ) as (Transaction & { tags_csv: string | null })[];

  return rows.map(({ tags_csv, ...tx }) => ({
    ...tx,
    tags: tags_csv ? tags_csv.split(",").sort() : [],
  }));
}

export async function getSummary(userId: number, from: string, to: string): Promise<Summary> {
  const days = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
  const prevTo = new Date(new Date(from).getTime() - 86400000).toISOString().split("T")[0];
  const prevFrom = new Date(new Date(prevTo).getTime() - (days - 1) * 86400000).toISOString().split("T")[0];

  // Combined current + previous period income/expense in one query
  const totalsRows = await sql(
    `SELECT
       CASE WHEN date >= $2 AND date <= $3 THEN 'current' ELSE 'prev' END as period,
       COALESCE(SUM(CASE WHEN direction = 'income' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as income,
       COALESCE(SUM(CASE WHEN direction = 'expense' AND category != 'transferencia' THEN eur_amount ELSE 0 END), 0) as expenses
     FROM transactions
     WHERE user_id = $1 AND category != 'transferencia'
       AND ((date >= $2 AND date <= $3) OR (date >= $4 AND date <= $5))
     GROUP BY period`,
    [userId, from, to, prevFrom, prevTo]
  ) as { period: string; income: number; expenses: number }[];

  const current = totalsRows.find((r) => r.period === "current") ?? { income: 0, expenses: 0 };
  const prev = totalsRows.find((r) => r.period === "prev") ?? { income: 0, expenses: 0 };
  const income = current.income;
  const expenses = current.expenses;
  const prevIncome = prev.income;
  const prevExpenses = prev.expenses;

  const byCategory = await sql(
    "SELECT category, SUM(eur_amount) as total FROM transactions WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND date >= $2 AND date <= $3 GROUP BY category ORDER BY total DESC",
    [userId, from, to]
  ) as { category: string; total: number }[];

  const byExpenseType = await sql(
    "SELECT expense_type, SUM(eur_amount) as total FROM transactions WHERE user_id = $1 AND direction = 'expense' AND category != 'transferencia' AND expense_type IS NOT NULL AND date >= $2 AND date <= $3 GROUP BY expense_type",
    [userId, from, to]
  ) as { expense_type: string; total: number }[];

  // Weekly trend in a single query using date_trunc
  const weekStart = new Date(new Date(to).getTime() - 7 * 7 * 86400000 - 6 * 86400000);
  const trendFrom = weekStart.toISOString().split("T")[0];

  const weeklyRows = await sql(
    `SELECT
       date_trunc('week', date::timestamp) as week_start,
       COALESCE(SUM(CASE WHEN direction = 'income' THEN eur_amount ELSE 0 END), 0) as income,
       COALESCE(SUM(CASE WHEN direction = 'expense' THEN eur_amount ELSE 0 END), 0) as expenses
     FROM transactions
     WHERE user_id = $1 AND date >= $2 AND date <= $3
     GROUP BY week_start
     ORDER BY week_start`,
    [userId, trendFrom, to]
  ) as { week_start: string; income: number; expenses: number }[];

  // Build the 8-week buckets and map results
  const weeklyTrend: { week: string; income: number; expenses: number }[] = [];
  const weeklyMap = new Map(weeklyRows.map((r) => [new Date(r.week_start).toISOString().split("T")[0], r]));

  for (let i = 7; i >= 0; i--) {
    const weekEnd = new Date(new Date(to).getTime() - i * 7 * 86400000);
    const wStart = new Date(weekEnd.getTime() - 6 * 86400000);
    // Find the matching week_start from date_trunc
    // Sum all weekly buckets that fall within this range
    let wIncome = 0;
    let wExpense = 0;
    for (const [key, row] of weeklyMap) {
      const keyDate = new Date(key);
      if (keyDate >= wStart && keyDate <= weekEnd) {
        wIncome += row.income;
        wExpense += row.expenses;
      }
    }
    weeklyTrend.push({ week: `S${8 - i}`, income: wIncome, expenses: wExpense });
  }

  const incomeByCategory = await sql(
    "SELECT category, SUM(eur_amount) as total FROM transactions WHERE user_id = $1 AND direction = 'income' AND date >= $2 AND date <= $3 GROUP BY category ORDER BY total DESC",
    [userId, from, to]
  ) as { category: string; total: number }[];

  const lastTxRow = await sql(
    "SELECT created_at FROM transactions WHERE user_id = $1 ORDER BY date DESC, id DESC LIMIT 1",
    [userId]
  );

  return {
    balance: income - expenses,
    income,
    expenses,
    prevIncome,
    prevExpenses,
    byCategory,
    byExpenseType,
    weeklyTrend,
    incomeByCategory,
    lastTransactionDate: lastTxRow[0]?.created_at ?? null,
  };
}

export async function getCategorySummary(userId: number, from: string, to: string) {
  return await sql(
    `SELECT category, direction, SUM(eur_amount) as total, COUNT(*) as count
     FROM transactions WHERE user_id = $1 AND date >= $2 AND date <= $3
     GROUP BY category, direction ORDER BY total DESC`,
    [userId, from, to]
  ) as { category: string; direction: string; total: number; count: number }[];
}

export async function getCategoryMonthlyTrend(userId: number, category: string, months: number = 6) {
  const results: { month: string; total: number }[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const from = `${year}-${month}-01`;
    const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
    const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

    const row = await sql(
      "SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE user_id = $1 AND category = $2 AND date >= $3 AND date <= $4",
      [userId, category, from, to]
    );

    results.push({ month: `${year}-${month}`, total: row[0].total });
  }
  return results;
}

export interface SpendingVelocity {
  dailyAverage: number;
  projected: number;
  daysLeft: number;
  onTrack: boolean;
}

export interface MonthOverMonth {
  month: string;
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
}

export async function getSpendingVelocity(userId: number, from: string, to: string): Promise<SpendingVelocity> {
  const today = new Date().toISOString().split("T")[0];
  const effectiveTo = today < to ? today : to;

  const expenseRow = await sql(
    "SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE user_id = $1 AND direction = 'expense' AND date >= $2 AND date <= $3",
    [userId, from, effectiveTo]
  );
  const expenses = expenseRow[0].total;

  const incomeRow = await sql(
    "SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE user_id = $1 AND direction = 'income' AND date >= $2 AND date <= $3",
    [userId, from, to]
  );
  const income = incomeRow[0].total;

  const startDate = new Date(from);
  const endDate = new Date(to);
  const todayDate = new Date(today);

  const daysElapsed = Math.max(1, Math.ceil((todayDate.getTime() - startDate.getTime()) / 86400000) + 1);
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const daysLeft = Math.max(0, totalDays - daysElapsed);

  const dailyAverage = expenses / daysElapsed;
  const projected = expenses + dailyAverage * daysLeft;

  return {
    dailyAverage: Math.round(dailyAverage * 100) / 100,
    projected: Math.round(projected * 100) / 100,
    daysLeft,
    onTrack: projected <= income,
  };
}

export async function getTopTransactions(userId: number, from: string, to: string, limit: number = 5): Promise<Transaction[]> {
  return await sql(
    "SELECT * FROM transactions WHERE user_id = $1 AND direction = 'expense' AND date >= $2 AND date <= $3 ORDER BY eur_amount DESC LIMIT $4",
    [userId, from, to, limit]
  ) as Transaction[];
}

export async function getIncomeBreakdown(userId: number, from: string, to: string): Promise<{ category: string; total: number }[]> {
  return await sql(
    "SELECT category, SUM(eur_amount) as total FROM transactions WHERE user_id = $1 AND direction = 'income' AND date >= $2 AND date <= $3 GROUP BY category ORDER BY total DESC",
    [userId, from, to]
  ) as { category: string; total: number }[];
}

export async function getMonthOverMonth(userId: number): Promise<MonthOverMonth[]> {
  const results: MonthOverMonth[] = [];

  for (let i = 2; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const from = `${year}-${month}-01`;
    const lastDay = new Date(year, d.getMonth() + 1, 0).getDate();
    const to = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

    const incomeRow = await sql(
      "SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE user_id = $1 AND direction = 'income' AND date >= $2 AND date <= $3",
      [userId, from, to]
    );

    const expenseRow = await sql(
      "SELECT COALESCE(SUM(eur_amount), 0) as total FROM transactions WHERE user_id = $1 AND direction = 'expense' AND date >= $2 AND date <= $3",
      [userId, from, to]
    );

    const income = incomeRow[0].total;
    const expenses = expenseRow[0].total;
    const savings = income - expenses;
    const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;

    results.push({
      month: `${year}-${month}`,
      income: Math.round(income),
      expenses: Math.round(expenses),
      savings: Math.round(savings),
      savingsRate,
    });
  }

  return results;
}
