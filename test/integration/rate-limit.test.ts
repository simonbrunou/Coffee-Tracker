import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import { freshDbWithSql, dropDb, allMigrationsSql, urlForDb } from "./_db";
import { RATE_LIMIT_SQL } from "@/lib/rate-limit";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("rate_limits (Postgres fixed-window)", () => {
  const DB = "cortado_rate_limit";
  afterAll(() => dropDb(DB));

  // Run the REAL limiter SQL against a given client; returns allowed (count <= limit).
  async function hit(
    c: { query: (t: string, p?: unknown[]) => Promise<{ rows: { count: number }[] }> },
    key: string,
    limit = 10,
  ) {
    const { rows } = await c.query(RATE_LIMIT_SQL, [key, "15 minutes"]);
    return rows[0].count <= limit;
  }

  it("allows up to the limit then blocks; resets after the window", async () => {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    try {
      for (let i = 0; i < 10; i++) expect(await hit(c, "k:reset")).toBe(true);
      expect(await hit(c, "k:reset")).toBe(false); // 11th
      // expire the window and confirm a fresh one opens
      await c.query(`update rate_limits set reset_at = now() - interval '1 second' where key = 'k:reset'`);
      expect(await hit(c, "k:reset")).toBe(true);
    } finally {
      await c.end();
    }
  });

  it("tracks keys independently", async () => {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    try {
      for (let i = 0; i < 10; i++) await hit(c, "k:a");
      expect(await hit(c, "k:a")).toBe(false);
      expect(await hit(c, "k:b")).toBe(true);
    } finally {
      await c.end();
    }
  });

  it("is atomic under concurrency — no lost updates across connections", async () => {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    const pool = new Pool({ connectionString: urlForDb(DB), max: 6 });
    try {
      // 12 concurrent hits on one key (limit 10) from a multi-connection pool.
      const results = await Promise.all(
        Array.from({ length: 12 }, () => hit(pool, "k:concurrent", 10)),
      );
      // Exactly 10 allowed (counts 1..10); 2 blocked (11, 12) — READ COMMITTED
      // serializes the PK-conflicting upserts into a 1..12 sequence.
      expect(results.filter(Boolean).length).toBe(10);
      const { rows } = await pool.query<{ count: number }>(
        `select count from rate_limits where key = 'k:concurrent'`,
      );
      expect(rows[0].count).toBe(12); // every increment landed → no lost updates
    } finally {
      await pool.end();
      await c.end();
    }
  });
});
