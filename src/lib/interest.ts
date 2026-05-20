import { sql } from "./db";

export type InterestPaymentFrequency = "daily" | "monthly" | "quarterly" | "annual";

interface AccountWithInterest {
  slug: string;
  initial_balance: number;
  annual_interest_rate: number;
  interest_payment_frequency: InterestPaymentFrequency | null;
}

function isPayoutDay(date: Date, frequency: InterestPaymentFrequency): boolean {
  if (frequency === "daily") return true;
  const day = date.getDate();
  const month = date.getMonth();
  if (frequency === "monthly") return day === 1;
  if (frequency === "quarterly") return day === 1 && month % 3 === 0;
  if (frequency === "annual") return day === 1 && month === 0;
  return false;
}

/**
 * Accrue daily interest for accounts with annual_interest_rate > 0.
 * Groups payouts according to interest_payment_frequency (daily | monthly | quarterly | annual).
 * Idempotent — skips periods already paid.
 */
export async function accrueInterest(userId: number): Promise<{ accrued: number; transactions: number }> {
  const accounts = await sql(
    "SELECT slug, initial_balance, annual_interest_rate, interest_payment_frequency FROM accounts WHERE user_id = $1 AND annual_interest_rate > 0 AND is_active = 1",
    [userId]
  ) as AccountWithInterest[];

  if (accounts.length === 0) return { accrued: 0, transactions: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let totalAccrued = 0;
  let totalTransactions = 0;

  for (const account of accounts) {
    const frequency: InterestPaymentFrequency = account.interest_payment_frequency ?? "monthly";

    const lastInterest = await sql(
      "SELECT MAX(date) as d FROM transactions WHERE user_id = $1 AND account = $2 AND category = 'intereses'",
      [userId, account.slug]
    );

    const firstTx = await sql(
      "SELECT MIN(date) as d FROM transactions WHERE user_id = $1 AND account = $2 AND category != 'intereses'",
      [userId, account.slug]
    );

    if (!firstTx[0]?.d) continue;

    const lastInterestDate = lastInterest[0]?.d ? new Date(lastInterest[0].d) : null;
    const startDate = new Date(lastInterestDate ?? firstTx[0].d);
    if (lastInterestDate) startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);

    const dailyRate = account.annual_interest_rate / 365;

    if (frequency === "daily") {
      const current = new Date(startDate);
      while (current <= yesterday) {
        const dateStr = current.toISOString().slice(0, 10);
        const balance = await balanceOnDate(userId, account.slug, account.initial_balance, dateStr);

        if (balance > 0) {
          const interest = Math.round(balance * dailyRate * 100) / 100;
          if (interest >= 0.01) {
            await insertInterestTransaction(userId, account.slug, interest, account.annual_interest_rate, dateStr);
            totalAccrued += interest;
            totalTransactions++;
          }
        }
        current.setDate(current.getDate() + 1);
      }
      continue;
    }

    let accumulated = 0;
    const cursor = new Date(startDate);
    while (cursor <= yesterday) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const balance = await balanceOnDate(userId, account.slug, account.initial_balance, dateStr);
      if (balance > 0) {
        accumulated += balance * dailyRate;
      }

      const next = new Date(cursor);
      next.setDate(next.getDate() + 1);

      if (isPayoutDay(next, frequency)) {
        const interest = Math.round(accumulated * 100) / 100;
        if (interest >= 0.01) {
          const payoutDateStr = next.toISOString().slice(0, 10);
          const exists = await sql(
            "SELECT COUNT(*) as cnt FROM transactions WHERE user_id = $1 AND account = $2 AND date = $3 AND category = 'intereses'",
            [userId, account.slug, payoutDateStr]
          );
          if (Number(exists[0].cnt) === 0) {
            await insertInterestTransaction(userId, account.slug, interest, account.annual_interest_rate, payoutDateStr);
            totalAccrued += interest;
            totalTransactions++;
          }
        }
        accumulated = 0;
      }

      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return { accrued: Math.round(totalAccrued * 100) / 100, transactions: totalTransactions };
}

async function balanceOnDate(userId: number, slug: string, initialBalance: number, dateStr: string): Promise<number> {
  const rows = await sql(
    `SELECT
      COALESCE(SUM(CASE WHEN direction = 'income' THEN eur_amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN direction = 'expense' THEN eur_amount ELSE 0 END), 0) as net
    FROM transactions
    WHERE user_id = $1 AND account = $2 AND date <= $3 AND category != 'intereses'`,
    [userId, slug, dateStr]
  );
  return initialBalance + Number(rows[0].net);
}

async function insertInterestTransaction(
  userId: number,
  slug: string,
  amount: number,
  annualRate: number,
  dateStr: string
): Promise<void> {
  await sql(
    `INSERT INTO transactions (user_id, amount, currency, eur_amount, direction, description, category, expense_type, date, account, created_at, updated_at)
     VALUES ($1, $2, 'EUR', $3, 'income', $4, 'intereses', NULL, $5, $6, NOW(), NOW())`,
    [userId, amount, amount, `Interés (${(annualRate * 100).toFixed(2)}% anual)`, dateStr, slug]
  );
}
