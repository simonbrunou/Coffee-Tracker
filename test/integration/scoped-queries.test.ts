import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
// lib/queries -> lib/auth -> next-auth -> next/server doesn't resolve under vitest;
// the scoped queries under test take explicit args, so a stub auth is enough.
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: async () => null,
  requireUserId: async () => "u1",
}));
import { testPool } from "./_db";
import {
  getMyTastings, getMyShelf, getSavedTastings, getWishlistBeans,
  getUserById, getBean, getDiscoverBeansPage,
} from "@/lib/queries";
import { pool as appPool } from "@/lib/db";

const hasDb = !!process.env.DATABASE_URL;
const pool = hasDb ? testPool() : null;

const TABLES = "users, roasters, beans, tastings, likes, tasting_saves, bean_wishlist, comments";

describe.skipIf(!hasDb)("scoped + paginated queries", () => {
  beforeAll(async () => {
    await pool!.query(`truncate ${TABLES} restart identity cascade`);
    await pool!.query(`insert into roasters (id,name,city,founded) values ('r1','Ember','PDX',2018)`);
    await pool!.query(`insert into users (id,name,handle,avatar) values ('u1','Ada','ada','#000'),('u2','Alan','alan','#111')`);
    await pool!.query(`insert into beans (id,name,roaster_id,process,color,owned,user_id,bag_weight) values
      ('b1','My Bag',null,'Washed','#a00',true,'u1','250g'),
      ('b2','Catalog A','r1','Natural','#0a0',false,null,null),
      ('bw','Wished','r1','Washed','#00a',false,null,null)`);
    await pool!.query(`insert into tastings (id,user_id,bean_id,rating,created_at) values
      ('t1','u1','b1',5, now()),
      ('t2','u1','b2',4, now() - interval '1 min'),
      ('t3','u2','b2',3, now() - interval '2 min')`);
    await pool!.query(`insert into tasting_saves (user_id,tasting_id) values ('u1','t3')`);
    await pool!.query(`insert into bean_wishlist (user_id,bean_id) values ('u1','bw')`);
  });
  afterAll(async () => {
    await pool!.query(`truncate ${TABLES} restart identity cascade`);
    await pool?.end();
    await appPool.end();
  });

  it("getMyTastings returns only the user's brews", async () => {
    const rows = await getMyTastings("u1");
    expect(rows.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    expect(rows.every((t) => t.userId === "u1")).toBe(true);
    expect(rows[0].authorName).toBe("Ada"); // denormalized author present
  });

  it("getMyShelf returns only owned bags", async () => {
    const rows = await getMyShelf("u1");
    expect(rows.map((b) => b.id)).toEqual(["b1"]);
    expect(rows[0].owned).toBe(true);
  });

  it("getSavedTastings returns saved tastings", async () => {
    const rows = await getSavedTastings("u1");
    expect(rows.map((t) => t.id)).toEqual(["t3"]);
  });

  it("getWishlistBeans returns wishlisted beans", async () => {
    const rows = await getWishlistBeans("u1");
    expect(rows.map((b) => b.id)).toEqual(["bw"]);
  });

  it("getUserById derives aggregates (tastings count)", async () => {
    const u = await getUserById(null, "u1");
    expect(u?.tastings).toBe(2);
    expect(typeof u?.followers).toBe("number");
  });

  it("getBean redacts private bag fields for a non-owner", async () => {
    const asOwner = await getBean("u1", "b1");
    const asOther = await getBean("u2", "b1");
    expect(asOwner?.bagWeight).toBe("250g");
    expect(asOther?.bagWeight ?? null).toBeNull();
  });

  it("getDiscoverBeansPage filters by process server-side", async () => {
    const washed = await getDiscoverBeansPage(null, { process: "Washed" });
    expect(washed.rows.map((b) => b.id).sort()).toEqual(["b1", "bw"]);
    const all = await getDiscoverBeansPage(null, {});
    expect(all.rows.length).toBe(3);
  });
});
