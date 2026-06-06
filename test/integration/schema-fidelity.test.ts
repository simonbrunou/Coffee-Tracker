import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { freshDbWithSql, dropDb, catalog } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("schema fidelity: Drizzle baseline == db/schema.sql", () => {
  const DRIZZLE_DB = "cortado_fidelity_drizzle";
  const SQL_DB = "cortado_fidelity_sql";

  afterAll(async () => {
    await dropDb(DRIZZLE_DB);
    await dropDb(SQL_DB);
  });

  it("produces catalog-equivalent schemas", async () => {
    const baseline = readFileSync(join(process.cwd(), "drizzle", "0000_init.sql"), "utf8");
    const handwritten = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");

    const a = await freshDbWithSql(DRIZZLE_DB, baseline);
    const b = await freshDbWithSql(SQL_DB, handwritten);
    try {
      const ca = await catalog(a);
      const cb = await catalog(b);
      // Columns (normalized defaults); CHECKs by name+def; FK/PK/UNIQUE by def
      // only (auto-names differ by engine); standalone indexes by name+def
      // (this is where the load-bearing users_email_lower_uq is verified).
      expect(ca.columns).toEqual(cb.columns);
      expect(ca.checks).toEqual(cb.checks);
      expect(ca.constraintDefs).toEqual(cb.constraintDefs);
      expect(ca.indexes).toEqual(cb.indexes);
    } finally {
      await a.end();
      await b.end();
    }
  });
});
