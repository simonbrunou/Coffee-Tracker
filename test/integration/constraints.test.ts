import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { freshDbWithSql, dropDb } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("schema constraints fire", () => {
  const DB = "cortado_constraints";
  afterAll(() => dropDb(DB));

  async function client() {
    const baseline = readFileSync(join(process.cwd(), "drizzle", "0000_init.sql"), "utf8");
    return freshDbWithSql(DB, baseline);
  }

  it("has exactly 11 public tables", async () => {
    // Scratch DB applies drizzle/0000 as raw SQL (no migrate()), so there is no
    // __drizzle_migrations journal here — a plain public BASE TABLE count is 11.
    const c = await client();
    try {
      const r = await c.query(
        `select count(*)::int as n from information_schema.tables
         where table_schema='public' and table_type='BASE TABLE'`,
      );
      expect(r.rows[0].n).toBe(11);
    } finally { await c.end(); }
  });

  it("rejects a duplicate credential email (case-insensitive) via users_email_lower_uq", async () => {
    const c = await client();
    try {
      // Both rows have password_hash set and the same lower(email) -> trips the
      // partial functional unique index. (OAuth rows sharing an email would NOT,
      // since the index is WHERE password_hash IS NOT NULL.)
      await c.query(
        `insert into users (id,name,handle,avatar,email,password_hash)
         values ('u1','A','a','#000','X@x.com','h1')`,
      );
      await expect(
        c.query(
          `insert into users (id,name,handle,avatar,email,password_hash)
           values ('u2','B','b','#000','x@X.com','h2')`,
        ),
      ).rejects.toMatchObject({ constraint: "users_email_lower_uq" });
    } finally { await c.end(); }
  });

  it("rejects a self-follow via no_self_follow", async () => {
    const c = await client();
    try {
      await c.query(`insert into users (id,name,handle,avatar) values ('s','S','s','#000')`);
      await expect(
        c.query(`insert into user_follows (follower_id,followee_id) values ('s','s')`),
      ).rejects.toMatchObject({ constraint: "no_self_follow" });
    } finally { await c.end(); }
  });

  it("rejects rating 6 via the tastings rating check (SQLSTATE 23514)", async () => {
    const c = await client();
    try {
      await c.query(`insert into users (id,name,handle,avatar) values ('ru','R','r','#000')`);
      await c.query(`insert into beans (id,name,color) values ('rb','Bean','#000')`);
      await expect(
        c.query(`insert into tastings (id,user_id,bean_id,rating) values ('rt','ru','rb',6)`),
      ).rejects.toMatchObject({ code: "23514" });
    } finally { await c.end(); }
  });
});
