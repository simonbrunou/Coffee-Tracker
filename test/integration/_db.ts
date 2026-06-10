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

