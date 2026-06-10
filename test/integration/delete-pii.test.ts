import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { testPool } from "./_db";
import { deleteUserWithPii } from "@/lib/users-repo";
import { pool as appPool } from "@/lib/db";

const hasDb = !!process.env.DATABASE_URL;
const pool = hasDb ? testPool() : null;
const db = { query: (t: string, p?: unknown[]) => pool!.query(t, p) };
const TABLES = "users, rate_limits";

describe.skipIf(!hasDb)("deleteUserWithPii (right-to-erasure)", () => {
  beforeAll(async () => {
    await pool!.query(`truncate ${TABLES} restart identity cascade`);
    await pool!.query(`insert into users (id,name,handle,avatar,email) values ('u-del','Del','del','#0','Del@X.com')`);
    await pool!.query(`insert into rate_limits (key,count,reset_at) values
      ('login:email:del@x.com', 3, now() + interval '1 hour'),
      ('signup:email:del@x.com', 1, now() + interval '1 hour'),
      ('login:ip:1.2.3.4', 2, now() + interval '1 hour')`);
  });
  afterAll(async () => {
    await pool!.query(`truncate ${TABLES} restart identity cascade`);
    await pool?.end();
    await appPool.end();
  });

  it("deletes the user and purges their email-keyed rate_limits, keeping unrelated rows", async () => {
    await deleteUserWithPii(db, "u-del");
    expect((await pool!.query(`select 1 from users where id='u-del'`)).rowCount).toBe(0);
    const keys = (await pool!.query(`select key from rate_limits order by key`)).rows.map((r: { key: string }) => r.key);
    expect(keys).toEqual(["login:ip:1.2.3.4"]); // email buckets purged; the IP bucket survives
  });
});
