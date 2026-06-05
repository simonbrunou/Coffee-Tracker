import "server-only";
import { Pool, type QueryResultRow } from "pg";

/**
 * Shared pg connection pool. The connection string defaults to the repo's
 * local Docker Postgres (`coffee-pg`); override with the DATABASE_URL env var.
 * These are throwaway local-dev credentials — not a secret.
 */
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/coffee_tracker";

// Reuse the pool across HMR reloads in dev so we don't exhaust connections.
const globalForPool = globalThis as unknown as { __cortadoPool?: Pool };

export const pool =
  globalForPool.__cortadoPool ?? new Pool({ connectionString, max: 5 });

if (process.env.NODE_ENV !== "production") globalForPool.__cortadoPool = pool;

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}
