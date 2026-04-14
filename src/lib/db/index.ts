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

type DbRow = QueryResultRow;

type DbQueryResult<T extends QueryResultRow = DbRow> = {
  rows: T[];
};

type DbClient = {
  query: <T extends QueryResultRow = DbRow>(
    text: string,
    params?: unknown[],
  ) => Promise<DbQueryResult<T>>;
};

// Added this generic non-RLS transaction helper so our actual DB change +
// the sync event write can stay atomic moving forward.
async function transaction<T>(
  callback: (client: DbClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
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
 * Run a query without RLS context (uses DB owner, bypasses RLS).
 * Use for: admin operations, imports, cron jobs, migrations.
 *
 * Usage:
 *   const { rows } = await db.query('SELECT * FROM users')
 *   const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId])
 */
export const db = {
  query: <T extends QueryResultRow = DbRow>(
    text: string,
    params?: unknown[],
  ) => getPool().query<T>(text, params),
  connect: () => getPool().connect(),
  transaction,
};

/**
 * Run a query WITH RLS context.
 * Sets app.current_user_id and app.current_user_role as session variables
 * inside a transaction so RLS policies enforce access control.
 *
 * Usage:
 *   const rows = await dbWithRLS(userId, userRole, 'SELECT * FROM hearings')
 *   const rows = await dbWithRLS(userId, userRole, 'SELECT * FROM hearings WHERE id = $1', [123])
 */
export async function dbWithRLS(
  userId: number,
  userRole: string,
  text: string,
  params?: unknown[],
) {
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
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run multiple queries in a single RLS-scoped transaction.
 *
 * Usage:
 *   const result = await dbTransaction(userId, userRole, async (client) => {
 *     const hearings = await client.query('SELECT * FROM hearings WHERE id = $1', [id])
 *     await client.query('UPDATE hearings SET ... WHERE id = $1', [id])
 *     return hearings.rows[0]
 *   })
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
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}