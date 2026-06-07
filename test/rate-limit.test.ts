import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const errorMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { error: (...a: unknown[]) => errorMock(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { checkRateLimit, RL_IP_LIMIT, RL_EMAIL_LIMIT, RATE_LIMIT_SQL } from "@/lib/rate-limit";

beforeEach(() => {
  // mockResolvedValue (persistent) so a stray opportunistic-cleanup call also gets a
  // thenable — never undefined — keeping the suite deterministic regardless of the 1% gate.
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ count: 1 }] });
  errorMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("checkRateLimit (Postgres-backed)", () => {
  it("returns a Promise (the async contract the call sites await)", () => {
    expect(checkRateLimit("k")).toBeInstanceOf(Promise);
  });
  it("runs the atomic upsert and allows when count <= limit", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: 3 }] });
    const ok = await checkRateLimit("login:ip:1.2.3.4");
    expect(ok).toBe(true);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe(RATE_LIMIT_SQL); // shape-only: pins that the impl uses the shared SQL const
    expect(sql).toMatch(/insert into rate_limits/i);
    expect(sql).toMatch(/on conflict \(key\) do update/i);
    expect(sql).toMatch(/returning count/i);
    expect(params).toEqual(["login:ip:1.2.3.4", "15 minutes"]);
  });
  it("blocks when the returned count exceeds the limit", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT + 1 }] });
    expect(await checkRateLimit("login:ip:x")).toBe(false);
  });
  it("allows exactly at the limit boundary", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT }] });
    expect(await checkRateLimit("login:ip:x")).toBe(true);
  });
  it("honors a higher per-email limit (softened lockout)", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT + 5 }] }); // 15
    expect(await checkRateLimit("login:email:a@b.com", RL_EMAIL_LIMIT)).toBe(true); // 15 <= 20
  });
  it("fires the opportunistic cleanup without affecting the decision", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // force the cleanup branch
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT + 1 }] });
    expect(await checkRateLimit("login:ip:x")).toBe(false); // decision unaffected
    expect(queryMock.mock.calls.some(([sql]) => /delete from rate_limits/i.test(sql as string))).toBe(true);
  });
  it("fails OPEN and logs when the store errors", async () => {
    queryMock.mockReset();
    queryMock.mockRejectedValueOnce(new Error("db down"));
    expect(await checkRateLimit("login:ip:x")).toBe(true);
    expect(errorMock).toHaveBeenCalled();
  });
  it("fails OPEN if the query exceeds the timeout", async () => {
    vi.useFakeTimers();
    queryMock.mockReset();
    queryMock.mockReturnValueOnce(new Promise(() => {})); // never settles
    const p = checkRateLimit("login:ip:x");
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toBe(true);
    expect(errorMock).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
