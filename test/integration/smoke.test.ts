import { describe, it, expect, afterAll } from "vitest";
import { testPool } from "./_db";

const hasDb = !!process.env.DATABASE_URL;
const pool = hasDb ? testPool() : null;
afterAll(async () => {
  await pool?.end();
});

describe.skipIf(!hasDb)("integration lane", () => {
  it("connects to the test database", async () => {
    const r = await pool!.query("select 1 as ok");
    expect(r.rows[0].ok).toBe(1);
  });
});
