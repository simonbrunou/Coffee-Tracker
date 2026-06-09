import { describe, it, expect, afterAll } from "vitest";
import { freshDbWithSql, dropDb, allMigrationsSql } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("full migration schema", () => {
  const DB = "cortado_fullschema";
  afterAll(() => dropDb(DB));

  it("has 15 public base tables after all migrations", async () => {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    try {
      const r = await c.query(
        `select count(*)::int as n from information_schema.tables
         where table_schema='public' and table_type='BASE TABLE'`,
      );
      expect(r.rows[0].n).toBe(15);
    } finally { await c.end(); }
  });
});
