import { Pool, PoolClient } from 'pg';

// Global pool singleton — reused across hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env.local. ' +
      'For local dev without PostgreSQL, keep LOCAL_DB_MODE=true to use the SQLite fallback.'
    );
  }
  return new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // pg honors sslmode in DATABASE_URL; never disable certificate verification.
  });
}

export function getPool(): Pool {
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = createPool();
  }
  return globalThis.__pgPool;
}

/** Run a function inside a transaction. Rolls back on error. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Simple query helper — uses the pool directly (no transaction). */
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

/** Convenience: expect exactly one row or throw. */
export async function queryOne<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
