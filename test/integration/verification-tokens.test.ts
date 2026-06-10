import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import { freshDbWithSql, dropDb, allMigrationsSql, urlForDb } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("verification_tokens", () => {
  const DB = "cortado_verification_tokens";
  afterAll(() => dropDb(DB));

  it("cascade-deletes a user's tokens when the user is deleted", async () => {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    try {
      await c.query(`insert into users (id,name,handle,avatar) values ('u1','U','u','#000')`);
      await c.query(`insert into verification_tokens (id,user_id,email,token_hash,expires_at) values ('t1','u1','a@b.com','h1', now()+interval '1 hour')`);
      await c.query(`delete from users where id='u1'`);
      const n = ((await c.query(`select count(*)::int n from verification_tokens`)).rows[0] as { n: number }).n;
      expect(n).toBe(0);
    } finally { await c.end(); }
  });

  it("consume is single-use under concurrency (exactly one winner)", async () => {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    const pool = new Pool({ connectionString: urlForDb(DB), max: 6 });
    try {
      await c.query(`insert into users (id,name,handle,avatar) values ('u2','U','u2','#000')`);
      await c.query(`insert into verification_tokens (id,user_id,email,token_hash,expires_at) values ('t2','u2','a@b.com','hh', now()+interval '1 hour')`);
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          pool.query(`delete from verification_tokens where token_hash='hh' and expires_at > now() returning user_id`),
        ),
      );
      expect(results.filter((r) => r.rows.length === 1).length).toBe(1); // exactly one delete wins
    } finally { await pool.end(); await c.end(); }
  });
});
