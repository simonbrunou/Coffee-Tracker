import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getCurrentUserId: async () => null, requireUserId: async () => "u-x" }));
import { testPool } from "./_db";
import { getDataExport } from "@/lib/data-export";
import { pool as appPool } from "@/lib/db";

const hasDb = !!process.env.DATABASE_URL;
const pool = hasDb ? testPool() : null;
const TABLES = "users, roasters, beans, tastings, comments, user_follows, roaster_follows, accounts, tasting_saves, bean_wishlist";

describe.skipIf(!hasDb)("getDataExport (DSAR)", () => {
  beforeAll(async () => {
    await pool!.query(`truncate ${TABLES} restart identity cascade`);
    await pool!.query(`insert into users (id,name,handle,avatar,email,password_hash) values
      ('u-x','X','x','#0','x@e.com','$2b$10$abcdefghijklmnopqrstuv'),
      ('u-y','Y','y','#1',null,null)`);
    await pool!.query(`insert into beans (id,name,process,color,owned,user_id) values ('b1','My Bag','Washed','#a',true,'u-x')`);
    await pool!.query(`insert into tastings (id,user_id,bean_id,rating,created_at) values ('t1','u-x','b1',5, now())`);
    await pool!.query(`insert into comments (id,tasting_id,user_id,body,created_at) values ('c1','t1','u-x','nice', now())`);
    await pool!.query(`insert into user_follows (follower_id,followee_id) values ('u-x','u-y')`);
  });
  afterAll(async () => {
    await pool!.query(`truncate ${TABLES} restart identity cascade`);
    await pool?.end();
    await appPool.end();
  });

  it("returns the caller's own data and never leaks the password hash", async () => {
    const exp = await getDataExport("u-x");
    expect(exp.profile).toMatchObject({ handle: "x", has_password: true, email: "x@e.com" });
    expect((exp.brews as unknown[]).length).toBe(1);
    expect((exp.bags as unknown[]).length).toBe(1);
    expect((exp.comments as unknown[]).length).toBe(1);
    expect((exp.following as { users: string[] }).users).toEqual(["u-y"]);
    const json = JSON.stringify(exp);
    expect(json).not.toMatch(/password_hash/);
    expect(json).not.toMatch(/\$2[aby]\$/); // no bcrypt hash value
  });
});
