/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool, type QueryResultRow } from "@neondatabase/serverless";

// Shared pool instance (reused across requests in serverless)
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

type DbQueryResult<T = any> = {
  rows: T[];
  rowCount: number | null;
  command?: string;
  oid?: number;
  fields?: unknown[];
};

type DbClient = {
  query: <T = any>(
    text: string,
    params?: unknown[],
  ) => Promise<DbQueryResult<T>>;
};

// Compatibility mode:
// - keeps transaction support for atomic sync-event writes
// - still allows explicit db.query<RowType>(...) where needed
// - preserves rowCount for older code paths
async function transaction<T>(
  callback: (client: DbClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client as unknown as DbClient);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run a query without RLS context.
 */
export const db = {
  query: <T = any>(text: string, params?: unknown[]) =>
    getPool().query(text, params) as unknown as Promise<DbQueryResult<T>>,
  connect: () => getPool().connect(),
  transaction,
};

/**
 * Run a query WITH RLS context.
 */
export async function dbWithRLS<T = any>(
  userId: number,
  userRole: string,
  text: string,
  params?: unknown[],
): Promise<DbQueryResult<T>> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      String(userId),
    ]);
    await client.query(`SELECT set_config('app.current_user_role', $1, true)`, [
      userRole,
    ]);
    const result = await client.query(text, params);
    await client.query("COMMIT");
    return result as unknown as DbQueryResult<T>;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run multiple queries in a single RLS-scoped transaction.
 */
export async function dbTransaction<T>(
  userId: number,
  userRole: string,
  callback: (client: DbClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [
      String(userId),
    ]);
    await client.query(`SELECT set_config('app.current_user_role', $1, true)`, [
      userRole,
    ]);
    const result = await callback(client as unknown as DbClient);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}