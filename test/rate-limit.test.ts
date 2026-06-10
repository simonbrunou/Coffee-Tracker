import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const errorMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { error: (...a: unknown[]) => errorMock(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  isRateLimited,
  recordAttempt,
  clearAttempts,
  throttle,
  RL_IP_LIMIT,
  RL_EMAIL_LIMIT,
  RATE_LIMIT_SQL,
} from "@/lib/rate-limit";

beforeEach(() => {
  // mockResolvedValue (persistent) so a stray opportunistic-cleanup call also gets a
  // thenable — never undefined — keeping the suite deterministic regardless of the 1% gate.
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ count: 0 }] });
  errorMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("isRateLimited (read-only window check)", () => {
  it("returns a Promise (the async contract the call sites await)", () => {
    expect(isRateLimited("k", RL_IP_LIMIT)).toBeInstanceOf(Promise);
  });
  it("reads the current window WITHOUT incrementing (no insert/upsert)", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: 3 }] });
    await isRateLimited("login:ip:1.2.3.4", RL_IP_LIMIT);
    const [sql] = queryMock.mock.calls[0] as [string];
    expect(sql).not.toMatch(/insert into rate_limits/i); // never records on a check
    expect(sql).toMatch(/select count/i);
    expect(sql).toMatch(/reset_at > now\(\)/i); // only counts the live window
  });
  it("allows (false) when recorded attempts are below the limit", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT - 1 }] });
    expect(await isRateLimited("login:ip:x", RL_IP_LIMIT)).toBe(false);
  });
  it("blocks (true) once recorded attempts reach the limit", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT }] });
    expect(await isRateLimited("login:ip:x", RL_IP_LIMIT)).toBe(true);
  });
  it("treats an empty (expired/absent) window as zero attempts → allows", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await isRateLimited("login:ip:x", RL_IP_LIMIT)).toBe(false);
  });
  it("honors the higher per-email limit", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT + 5 }] }); // 15
    expect(await isRateLimited("login:email:a@b.com", RL_EMAIL_LIMIT)).toBe(false); // 15 < 20
  });
  it("fails OPEN (false) and logs a REDACTED key when the store errors", async () => {
    queryMock.mockReset();
    queryMock.mockRejectedValueOnce(new Error("db down"));
    expect(await isRateLimited("login:email:victim@example.com", RL_EMAIL_LIMIT)).toBe(false);
    expect(errorMock).toHaveBeenCalled();
    const ctx = errorMock.mock.calls[0]![1] as { key: string };
    expect(ctx.key).not.toContain("victim@example.com"); // L2: no PII in logs
  });
  it("fails OPEN (false) if the query exceeds the timeout", async () => {
    vi.useFakeTimers();
    queryMock.mockReset();
    queryMock.mockReturnValueOnce(new Promise(() => {})); // never settles
    const p = isRateLimited("login:ip:x", RL_IP_LIMIT);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toBe(false);
    expect(errorMock).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("recordAttempt (counts a failure only)", () => {
  it("runs the atomic upsert with the window interval", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: 1 }] });
    await recordAttempt("login:email:a@b.com");
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe(RATE_LIMIT_SQL);
    expect(params).toEqual(["login:email:a@b.com", "15 minutes"]);
  });
  it("swallows store errors (best-effort) and logs a redacted key", async () => {
    queryMock.mockReset();
    queryMock.mockRejectedValueOnce(new Error("db down"));
    await expect(recordAttempt("login:email:victim@example.com")).resolves.toBeUndefined();
    const ctx = errorMock.mock.calls[0]![1] as { key: string };
    expect(ctx.key).not.toContain("victim@example.com");
  });
});

describe("throttle (count-every-attempt: signup, resend)", () => {
  it("allows and records when the window is below the limit", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: 2 }] });
    expect(await throttle("signup:ip:1.2.3.4", RL_IP_LIMIT)).toBe(true);
    // both a read (count) and a record (upsert) happened
    const sqls = queryMock.mock.calls.map(([s]) => s as string);
    expect(sqls.some((s) => /select count/i.test(s))).toBe(true);
    expect(sqls.some((s) => /insert into rate_limits/i.test(s))).toBe(true);
  });
  it("blocks WITHOUT recording once the window is full", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT }] });
    expect(await throttle("signup:ip:x", RL_IP_LIMIT)).toBe(false);
    const sqls = queryMock.mock.calls.map(([s]) => s as string);
    expect(sqls.some((s) => /insert into rate_limits/i.test(s))).toBe(false); // no new attempt counted
  });
});

describe("clearAttempts (resets the window on success)", () => {
  it("deletes the key so a successful login can't be locked out", async () => {
    await clearAttempts("login:email:a@b.com");
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/delete from rate_limits/i);
    expect(sql).toMatch(/where key = \$1/i);
    expect(params).toEqual(["login:email:a@b.com"]);
  });
  it("swallows store errors (best-effort)", async () => {
    queryMock.mockReset();
    queryMock.mockRejectedValueOnce(new Error("db down"));
    await expect(clearAttempts("login:email:a@b.com")).resolves.toBeUndefined();
  });
});
