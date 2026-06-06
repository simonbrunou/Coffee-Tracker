import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";
import { freshDbWithSql, dropDb } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("keyset feed pagination (created_at, id)", () => {
  const DB = "cortado_pagination";
  let c: Client;

  beforeAll(async () => {
    const baseline = readFileSync(join(process.cwd(), "drizzle", "0000_init.sql"), "utf8");
    const idx = readFileSync(join(process.cwd(), "drizzle", "0001_pagination_indexes.sql"), "utf8");
    c = await freshDbWithSql(DB, baseline + "\n;\n" + idx);
    await c.query(`insert into users (id,name,handle,avatar) values ('u','U','u','#000')`);
    await c.query(`insert into beans (id,name,color) values ('b','B','#000')`);
    // 25 tastings, strictly descending created_at (minutes ago).
    for (let i = 0; i < 25; i++) {
      await c.query(
        `insert into tastings (id,user_id,bean_id,rating,created_at)
         values ($1,'u','b',5, now() - ($2 || ' minutes')::interval)`,
        [`t${String(i).padStart(2, "0")}`, i],
      );
    }
  });
  afterAll(async () => {
    await c?.end();
    await dropDb(DB);
  });

  const KEYSET = `
    select id, created_at from tastings
    where ($1::timestamptz is null or (created_at, id) < ($1::timestamptz, $2))
    order by created_at desc, id desc limit 11`; // limit 10 + 1 over-fetch

  it("pages with no duplicate or skipped rows and stable order", async () => {
    const p1 = await c.query(KEYSET, [null, null]);
    expect(p1.rows.length).toBe(11); // 10 returned + 1 over-fetch sentinel
    const last = p1.rows[9];
    const p2 = await c.query(KEYSET, [last.created_at, last.id]);

    const ids1 = p1.rows.slice(0, 10).map((r) => r.id);
    const ids2 = p2.rows.slice(0, 10).map((r) => r.id);
    expect(new Set([...ids1, ...ids2]).size).toBe(20); // no overlap across the boundary
    // page 1 is strictly newest-first by created_at
    const ts1 = p1.rows.slice(0, 10).map((r) => new Date(r.created_at).getTime());
    expect(ts1).toEqual([...ts1].sort((a, b) => b - a));
  });

  it("a row inserted at the top after page 1 never appears on page 2", async () => {
    const p1 = await c.query(KEYSET, [null, null]);
    const last = p1.rows[9];
    await c.query(`insert into tastings (id,user_id,bean_id,rating,created_at) values ('t-new','u','b',5, now())`);
    const p2 = await c.query(KEYSET, [last.created_at, last.id]);
    expect(p2.rows.map((r) => r.id)).not.toContain("t-new");
    await c.query(`delete from tastings where id = 't-new'`);
  });
});
