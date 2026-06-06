import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { freshDbWithSql, dropDb } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

/** Concatenate all migrations in order → one raw SQL batch for a scratch DB.
 *  (`--> statement-breakpoint` lines are `--` SQL comments, so a simple-query
 *  batch runs the whole thing; mirrors constraints.test.ts applying 0000.) */
function allMigrations(): string {
  const dir = join(process.cwd(), "drizzle");
  return ["0000_init.sql", "0001_pagination_indexes.sql", "0002_account_deletion_cascade.sql"]
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

describe.skipIf(!hasDb)("account deletion cascade", () => {
  const DB = "cortado_account_deletion";
  afterAll(() => dropDb(DB));
  async function client() {
    return freshDbWithSql(DB, allMigrations());
  }

  it("tastings.user_id and likes.user_id are ON DELETE CASCADE (confdeltype 'c')", async () => {
    const c = await client();
    try {
      const r = await c.query(
        `select conname, confdeltype from pg_constraint
         where conname in ('tastings_user_id_users_id_fk','likes_user_id_users_id_fk')
         order by conname`,
      );
      // 'c' = CASCADE, 'a' = NO ACTION
      expect(r.rows.map((x: { confdeltype: string }) => x.confdeltype)).toEqual(["c", "c"]);
    } finally {
      await c.end();
    }
  });

  it("DELETE FROM users removes the user's content + others' engagement on it, sparing others' catalog content", async () => {
    const c = await client();
    try {
      await c.query(
        `insert into users (id,name,handle,avatar) values
         ('u1','One','one','#000'),('u2','Two','two','#111')`,
      );
      // u1 owns a bag; a catalog bean has no owner
      await c.query(
        `insert into beans (id,name,color,user_id,owned) values ('b-own','Bag','#000','u1',true)`,
      );
      await c.query(`insert into beans (id,name,color) values ('b-cat','Catalog','#222')`);
      // u1 logs a tasting on their bag; u2 logs one on the catalog bean
      await c.query(`insert into tastings (id,user_id,bean_id,rating) values ('t-own','u1','b-own',5)`);
      await c.query(`insert into tastings (id,user_id,bean_id,rating) values ('t-cat','u2','b-cat',4)`);
      // cross-user engagement
      await c.query(`insert into likes (user_id,tasting_id) values ('u1','t-cat'),('u2','t-own')`);
      await c.query(`insert into comments (id,tasting_id,user_id,body) values ('c-1','t-own','u2','nice')`);

      await c.query(`delete from users where id = 'u1'`);

      const n = async (sql: string) =>
        ((await c.query(sql)).rows[0] as { n: number }).n;
      // u1 and everything they own/authored is gone
      expect(await n(`select count(*)::int n from users where id='u1'`)).toBe(0);
      expect(await n(`select count(*)::int n from beans where id='b-own'`)).toBe(0);
      expect(await n(`select count(*)::int n from tastings where id='t-own'`)).toBe(0);
      expect(await n(`select count(*)::int n from likes where user_id='u1'`)).toBe(0);
      // others' engagement ON u1's content cascades away with that content
      expect(await n(`select count(*)::int n from likes where tasting_id='t-own'`)).toBe(0);
      expect(await n(`select count(*)::int n from comments where tasting_id='t-own'`)).toBe(0);
      // u2 and their catalog content are untouched
      expect(await n(`select count(*)::int n from users where id='u2'`)).toBe(1);
      expect(await n(`select count(*)::int n from tastings where id='t-cat'`)).toBe(1);
      expect(await n(`select count(*)::int n from beans where id='b-cat'`)).toBe(1);
    } finally {
      await c.end();
    }
  });
});
