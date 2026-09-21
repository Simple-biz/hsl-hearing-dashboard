import { Pool } from "@neondatabase/serverless";

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

/**
 * Detect transient connection-level failures that are safe to retry.
 * Neon auto-suspends idle databases on the any tier, which leaves the
 * cached pool holding a dead socket. The first query after wake-up then
 * fails with one of these messages — but a fresh pool succeeds.
 */
function isTransientConnectionError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("connection terminated unexpectedly") ||
    msg.includes("connection terminated") ||
    msg.includes("connection lost") ||
    msg.includes("connection ended") ||
    msg.includes("client has encountered a connection error") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up")
  );
}

/** Drop the cached pool so the next getPool() call creates a fresh one. */
async function resetPool(): Promise<void> {
  const dead = pool;
  pool = null;
  if (dead) {
    try {
      await dead.end();
    } catch {
      // The connection is already broken — `end()` may itself throw.
      // Swallow so the retry path isn't blocked.
    }
  }
}

/**
 * Run a query without RLS context (uses DB owner, bypasses RLS).
 * Use for: admin operations, imports, cron jobs, migrations.
 *
 * Retries once on transient connection errors so a stale-pool drop
 * (common with Neon auto-suspend on the free tier) doesn't surface as
 * a 500 to the user.
 *
 * Usage:
 *   const { rows } = await db.query('SELECT * FROM users')
 *   const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId])
 */
export const db = {
  query: async (text: string, params?: unknown[]) => {
    try {
      return await getPool().query(text, params);
    } catch (err) {
      if (!isTransientConnectionError(err)) throw err;
      console.warn(
        "[db] transient connection error; recreating pool and retrying once:",
        err instanceof Error ? err.message : err,
      );
      await resetPool();
      return await getPool().query(text, params);
    }
  },
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
 *   const results = await dbTransaction(userId, userRole, async (client) => {
 *     const hearings = await client.query('SELECT * FROM hearings WHERE id = $1', [id])
 *     await client.query('UPDATE hearings SET ... WHERE id = $1', [id])
 *     return hearings.rows[0]
 *   })
 */
export async function dbTransaction<T>(
  userId: number,
  userRole: string,
  callback: (client: {
    query: (text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  }) => Promise<T>,
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
