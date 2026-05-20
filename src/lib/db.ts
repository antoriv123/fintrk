import { neon, Pool, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;
let _pool: Pool | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    _sql = neon(url);
  }
  return _sql;
}

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    _pool = new Pool({ connectionString: url });
  }
  return _pool;
}

/** Wrapper around neon's .query() for parameterized queries */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sql(query: string, params?: unknown[]): Promise<any[]> {
  return getSql().query(query, params);
}

/**
 * Execute multiple queries inside a Postgres transaction. Neon HTTP serverless
 * no permite BEGIN/COMMIT entre calls separadas (cada una es un request HTTP
 * distinto), asi que esta funcion usa Pool (WebSocket) que si mantiene sesion.
 *
 * Solo disponible en runtime nodejs (no Edge). Usar para operaciones que
 * requieren atomicidad imposible de expresar como un unico CTE — p.ej.
 * clearAccount + batch insert en import. Para operaciones simples con
 * CTEs basta el `sql()` normal.
 */
export async function withTransaction<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (q: (text: string, params?: unknown[]) => Promise<any[]>) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const q = async (text: string, params?: unknown[]) => {
      const res = await client.query(text, params);
      return res.rows;
    };
    const result = await fn(q);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export interface Transaction {
  id: number;
  amount: number;
  currency: string;
  eur_amount: number;
  direction: "income" | "expense";
  description: string;
  category: string;
  expense_type: string | null;
  date: string;
  image_path: string | null;
  telegram_message_id: number | null;
  account: string | null;
  created_at: string;
  updated_at: string;
  has_splits?: number;
  is_reconciled?: number;
  is_demo?: number;
  tags?: string[];
}

export interface TransactionSplit {
  id: number;
  transaction_id: number;
  amount: number;
  category: string;
  expense_type: string | null;
  description: string | null;
  created_at: string;
}
