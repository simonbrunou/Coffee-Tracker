import { Pool, Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Concatenate every drizzle/*.sql migration in order — one raw SQL batch for a
 *  scratch DB. Auto-includes new migrations (no hardcoded list to maintain). */
export function allMigrationsSql(): string {
  const dir = join(process.cwd(), "drizzle");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

/** Base test connection string (from .env.test locally or the CI job env). */
export function baseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set for integration tests");
  return url;
}

/** Swap the database name in a connection string (keeps host/creds/params). */
export function urlForDb(name: string): string {
  const u = new URL(baseUrl());
  u.pathname = `/${name}`;
  return u.toString();
}

/** A pool bound to the main test DB. Caller must end() it in afterAll. */
export function testPool(): Pool {
  return new Pool({ connectionString: baseUrl(), max: 4 });
}

/** Run admin SQL against the maintenance `postgres` db (for CREATE/DROP DATABASE). */
export async function admin(fn: (c: Client) => Promise<void>) {
  const c = new Client({ connectionString: urlForDb("postgres") });
  await c.connect();
  try {
    await fn(c);
  } finally {
    await c.end();
  }
}

/** Drop+create a scratch DB, run `sqlText` against it, return a connected Client. */
export async function freshDbWithSql(name: string, sqlText: string): Promise<Client> {
  await admin(async (c) => {
    await c.query(`drop database if exists ${name} with (force)`);
    await c.query(`create database ${name}`);
  });
  const client = new Client({ connectionString: urlForDb(name) });
  await client.connect();
  await client.query(sqlText);
  return client;
}

export async function dropDb(name: string) {
  await admin(async (c) => {
    await c.query(`drop database if exists ${name} with (force)`);
  });
}

/** Normalize a column_default so cosmetic representations compare equal:
 *  '0'::numeric -> 0, '{}'::text[] -> {}, ''::text -> '', 'now'::text -> now.
 *  Assumes default literals contain no embedded "::" (true for this schema); a
 *  future textual default whose body contains "::" would need a smarter parse. */
function normDefault(d: string | null): string | null {
  if (d == null) return null;
  return d
    .replace(/::[a-zA-Z0-9_ "[\]]+/g, "") // strip ::type casts
    .replace(/^'([\s\S]*)'$/, "$1") // unwrap surrounding quotes
    .trim();
}

/** Catalog snapshot for the fidelity gate.
 *  Constraint NAMES are only asserted for CHECKs (stable + app-meaningful) and,
 *  separately, the load-bearing standalone index `users_email_lower_uq`.
 *  FK/PK/UNIQUE auto-names differ between drizzle-kit and Postgres, so those are
 *  compared by DEFINITION only (def still encodes columns, refs, ON DELETE). */
export async function catalog(client: Client) {
  const columns = (
    await client.query(`
      select table_name, column_name, udt_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, column_name`)
  ).rows.map((r) => ({ ...r, column_default: normDefault(r.column_default) }));

  const cons = (
    await client.query(`
      select conname, contype, pg_get_constraintdef(oid) as def
      from pg_constraint
      where connamespace = 'public'::regnamespace
      order by contype, def, conname`)
  ).rows;
  const checks = cons
    .filter((c) => c.contype === "c")
    .map((c) => ({ conname: c.conname, def: c.def }));
  const constraintDefs = cons.filter((c) => c.contype !== "c").map((c) => c.def).sort();

  const conNames = new Set(cons.map((c) => c.conname));
  const indexes = (
    await client.query(`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public'
      order by indexname`)
  ).rows.filter((i) => !conNames.has(i.indexname));

  return { columns, checks, constraintDefs, indexes };
}
