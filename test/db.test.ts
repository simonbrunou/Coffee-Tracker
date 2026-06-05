import { describe, it, expect, vi } from "vitest";
import { makeWithTransaction } from "@/lib/db";

function fakePool() {
  const calls: string[] = [];
  const client = {
    query: vi.fn(async (text: string) => { calls.push(text); return { rows: [] }; }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) };
  return { pool, client, calls };
}

describe("withTransaction", () => {
  it("commits and releases on success", async () => {
    const { pool, client, calls } = fakePool();
    const withTransaction = makeWithTransaction(pool as never);
    const result = await withTransaction(async (c) => { await c.query("select 1"); return 42; });
    expect(result).toBe(42);
    expect(calls).toEqual(["BEGIN", "select 1", "COMMIT"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases on throw", async () => {
    const { pool, client, calls } = fakePool();
    const withTransaction = makeWithTransaction(pool as never);
    await expect(withTransaction(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
