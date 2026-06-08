import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
// lib/queries -> lib/auth -> next-auth -> next/server doesn't resolve under vitest;
// the queries under test take explicit args, so a stub auth is enough.
vi.mock("@/lib/auth", () => ({
  getCurrentUserId: async () => null,
  requireUserId: async () => "u1",
}));
import { testPool } from "./_db";
import {
  getUserProfileByHandle, getUserTastingsPage, getTopFlavors, getUserHandlesForSitemap,
} from "@/lib/queries";
import { pool as appPool } from "@/lib/db";

const hasDb = !!process.env.DATABASE_URL;
const pool = hasDb ? testPool() : null;

// user_follows IS included (the count asserts need a follow edge — scoped-queries
// omits it).
const TABLES = "users, roasters, beans, tastings, likes, tasting_saves, bean_wishlist, comments, user_follows";

describe.skipIf(!hasDb)("public profile queries", () => {
  beforeAll(async () => {
    await pool!.query(`truncate ${TABLES} restart identity cascade`);
    await pool!.query(`insert into roasters (id,name,city,founded) values ('r1','Ember','PDX',2018)`);
    // u2's handle is stored mixed-case ("Alan") to exercise the CI lookup + stored-case return.
    await pool!.query(`insert into users (id,name,handle,avatar,discoverable) values
      ('u1','Ada','ada','#000',false),
      ('u2','Alan','Alan','#111',true)`);
    await pool!.query(`insert into beans (id,name,roaster_id,process,color,owned,user_id,flavors) values
      ('b1','Cat','r1','Washed','#a00',false,null,'{cocoa,nutty}')`);
    await pool!.query(`insert into tastings (id,user_id,bean_id,rating,created_at) values
      ('t1','u1','b1',5, now()),
      ('t2','u1','b1',4, now() - interval '1 min'),
      ('t3','u2','b1',3, now() - interval '2 min')`);
    await pool!.query(`insert into user_follows (follower_id,followee_id) values ('u1','u2')`);
  });
  afterAll(async () => {
    await pool!.query(`truncate ${TABLES} restart identity cascade`);
    await pool?.end();
    await appPool.end();
  });

  it("resolves a handle case-insensitively and returns the stored case + discoverable", async () => {
    const p = await getUserProfileByHandle(null, "ALAN");
    expect(p?.handle).toBe("Alan");
    expect(p?.discoverable).toBe(true);
    expect(p?.followers).toBe(1); // u1 follows u2
  });

  it("computes following + followedByMe for the viewer", async () => {
    expect((await getUserProfileByHandle(null, "ada"))?.following).toBe(1);
    expect((await getUserProfileByHandle("u1", "Alan"))?.followedByMe).toBe(true);
    expect((await getUserProfileByHandle("u2", "Alan"))?.followedByMe).toBe(false);
  });

  it("returns null for a missing handle", async () => {
    expect(await getUserProfileByHandle(null, "nope_nope")).toBeNull();
  });

  it("anonymous viewer gets likedByMe=false and the page carries no bag-inventory fields", async () => {
    const page = await getUserTastingsPage(null, "u1", {});
    expect(page.rows.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    expect(page.rows.every((t) => t.likedByMe === false)).toBe(true);
    expect(JSON.stringify(page.rows)).not.toMatch(/bagWeight|bag_weight|purchased|remaining|where_bought|owned/i);
  });

  it("top flavors aggregates over the user's tastings", async () => {
    const f = await getTopFlavors("u1");
    expect(f).toEqual([{ flavor: "cocoa", n: 2 }, { flavor: "nutty", n: 2 }]);
  });

  it("sitemap lists only discoverable handles", async () => {
    const handles = (await getUserHandlesForSitemap()).map((h) => h.handle);
    expect(handles).toContain("Alan");
    expect(handles).not.toContain("ada");
  });
});
