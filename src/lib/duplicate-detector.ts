import { sql } from "./db";
import type { ParsedTransaction } from "./csv-parser";

export interface DuplicateCheck {
  transaction: ParsedTransaction;
  isDuplicate: boolean;
  matchedId?: number;
}

/**
 * Batch duplicate detection — checks all transactions against DB in a single query
 * instead of one query per transaction (O(1) vs O(n)).
 */
export async function checkDuplicates(transactions: ParsedTransaction[], userId?: number): Promise<DuplicateCheck[]> {
  if (transactions.length === 0) return [];

  // Track how many times we've seen each key in this batch
  const batchSeen = new Map<string, number>();

  // Build a batch query: get counts for all unique (date, amount, description) combos
  const uniqueKeys = new Map<string, { amount: number; date: string; description: string }>();
  for (const tx of transactions) {
    const key = `${tx.date}|${Math.abs(tx.amount).toFixed(2)}|${tx.description.toLowerCase()}`;
    if (!uniqueKeys.has(key)) {
      uniqueKeys.set(key, { amount: Math.abs(tx.amount), date: tx.date, description: tx.description });
    }
  }

  // Fetch counts from DB in batches of 50 unique keys
  const dbCounts = new Map<string, number>();
  const keyEntries = Array.from(uniqueKeys.entries());
  const BATCH = 50;

  for (let i = 0; i < keyEntries.length; i += BATCH) {
    const batch = keyEntries.slice(i, i + BATCH);
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = userId ? 2 : 1;

    if (userId) {
      params.push(userId);
    }

    for (const [, { amount, date, description }] of batch) {
      conditions.push(
        `(ABS(eur_amount - $${paramIdx}) < 0.01 AND date = $${paramIdx + 1} AND LOWER(description) = LOWER($${paramIdx + 2}))`
      );
      params.push(amount, date, description);
      paramIdx += 3;
    }

    const userFilter = userId ? "user_id = $1 AND" : "";
    const rows = await sql(
      `SELECT eur_amount, date, LOWER(description) as desc_lower, COUNT(*) as cnt
       FROM transactions
       WHERE ${userFilter} (${conditions.join(" OR ")})
       GROUP BY eur_amount, date, desc_lower`,
      params
    );

    for (const row of rows as Array<{ eur_amount: number; date: string; desc_lower: string; cnt: number }>) {
      // Match back to our keys — find the closest amount match
      for (const [key, { amount, date, description }] of batch) {
        if (row.date === date &&
            row.desc_lower === description.toLowerCase() &&
            Math.abs(row.eur_amount - amount) < 0.01) {
          dbCounts.set(key, Number(row.cnt));
        }
      }
    }
  }

  // Build results
  const results: DuplicateCheck[] = [];
  for (const tx of transactions) {
    const key = `${tx.date}|${Math.abs(tx.amount).toFixed(2)}|${tx.description.toLowerCase()}`;
    const dbCount = dbCounts.get(key) ?? 0;
    const seenInBatch = batchSeen.get(key) ?? 0;
    const isDuplicate = seenInBatch < dbCount;

    batchSeen.set(key, seenInBatch + 1);
    results.push({ transaction: tx, isDuplicate });
  }

  return results;
}
