import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { logger } from "@/lib/logger";
import { resolveSslConfig } from "@/lib/db-ssl";

/**
 * Shared pg connection pool. Defaults to the repo's local Docker Postgres
 * (`coffee-pg`); override with DATABASE_URL. In production the startup validator
 * (instrumentation.ts) guarantees DATABASE_URL is set, so the localhost default
 * is only ever effective in dev. (Throwaway local creds — not a secret.)
 */
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/coffee_tracker";

// Reuse the pool across HMR reloads in dev so we don't exhaust connections.
const globalForPool = globalThis as unknown as { __cortadoPool?: Pool };

function createPool(): Pool {
  const p = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    ssl: resolveSslConfig(process.env),
  });
  // An idle client erroring (e.g. the server drops the connection) emits 'error'
  // on the pool; with no handler, node-postgres throws and crashes the process.
  // Attached once per real pool creation (HMR reuse below skips this).
  p.on("error", (err) => logger.error("pg_pool_error", { err: err.message }));
  return p;
}

export const pool = globalForPool.__cortadoPool ?? createPool();

if (process.env.NODE_ENV !== "production") globalForPool.__cortadoPool = pool;

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

/** Factory so the transaction helper is unit-testable with a fake pool. */
export function makeWithTransaction(p: Pick<Pool, "connect">) {
  return async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = (await p.connect()) as PoolClient;
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
}

/** App-wide transaction runner bound to the shared pool. */
export const withTransaction = makeWithTransaction(pool);
