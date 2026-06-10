import { describe, it, expect, afterAll } from "vitest";
import { freshDbWithSql, dropDb, allMigrationsSql } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("tasting_assessments", () => {
  const DB = "cortado_cva";
  afterAll(() => dropDb(DB));

  async function seeded() {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    await c.query(`insert into users (id,name,handle,avatar) values ('u','U','u','#000')`);
    await c.query(`insert into beans (id,name,color,user_id,owned) values ('b','Bean','#000','u',true)`);
    await c.query(`insert into tastings (id,user_id,bean_id,rating) values ('t','u','b',4)`);
    return c;
  }

  it("rejects an out-of-range intensity (SQLSTATE 23514)", async () => {
    const c = await seeded();
    try {
      await expect(
        c.query(`insert into tasting_assessments (tasting_id, body_intensity) values ('t', 99)`),
      ).rejects.toMatchObject({ code: "23514" });
    } finally { await c.end(); }
  });

  it("cascades when the tasting is deleted", async () => {
    const c = await seeded();
    try {
      await c.query(`insert into tasting_assessments (tasting_id, body_intensity) values ('t', 12)`);
      await c.query(`delete from tastings where id = 't'`);
      const r = await c.query(`select count(*)::int as n from tasting_assessments`);
      expect(r.rows[0].n).toBe(0);
    } finally { await c.end(); }
  });

  it("enforces 1:1 (duplicate tasting_id rejected)", async () => {
    const c = await seeded();
    try {
      await c.query(`insert into tasting_assessments (tasting_id) values ('t')`);
      await expect(
        c.query(`insert into tasting_assessments (tasting_id) values ('t')`),
      ).rejects.toMatchObject({ code: "23505" });
    } finally { await c.end(); }
  });

  it("averages the user's assessments per bean (NULL-aware counts)", async () => {
    const c = await seeded();
    try {
      await c.query(`insert into tastings (id,user_id,bean_id,rating) values ('t2','u','b',5)`);
      await c.query(`insert into tasting_assessments (tasting_id, body_intensity, acidity_intensity) values ('t', 10, 8)`);
      await c.query(`insert into tasting_assessments (tasting_id, body_intensity) values ('t2', 14)`);
      const r = await c.query(
        `select avg(body_intensity)::float8 as body, count(body_intensity)::int as body_n,
                avg(acidity_intensity)::float8 as acidity, count(acidity_intensity)::int as acidity_n,
                count(*)::int as n
         from tasting_assessments ta join tastings t on t.id = ta.tasting_id
         where t.bean_id = 'b' and t.user_id = 'u'`,
      );
      expect(r.rows[0].body).toBe(12);
      expect(r.rows[0].body_n).toBe(2);
      expect(r.rows[0].acidity).toBe(8);
      expect(r.rows[0].acidity_n).toBe(1);
      expect(r.rows[0].n).toBe(2);
    } finally { await c.end(); }
  });
});
