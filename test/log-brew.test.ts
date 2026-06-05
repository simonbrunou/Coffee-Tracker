import { describe, it, expect, vi, beforeEach } from "vitest";

// getCurrentUserId is included because lib/queries imports it (transitive import
// of app/actions) — omitting it can trip a "no known export" error under Vitest.
vi.mock("@/lib/auth", () => ({
  requireUserId: vi.fn(async () => "u-me"),
  getCurrentUserId: vi.fn(async () => "u-me"),
}));
const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { logBrew } from "@/app/actions";

const input = { beanId: "b-1", rating: 4, brew: "V60", note: "", dose: "15g", ratio: "1:16", temp: "94°C" };

describe("logBrew ownership guard", () => {
  beforeEach(() => queryMock.mockReset());

  it("throws when the guarded insert affects no rows (bean not owned/found)", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(logBrew(input)).rejects.toThrow();
  });

  it("returns the tasting when the bean is owned (insert returns a row)", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: "t-1", userId: "u-me", beanId: "b-1" }] });
    const t = await logBrew(input);
    expect(t.id).toBe("t-1");
    // the guarded statement filters by owner: bean id and user id are both params
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(params).toContain("b-1");
    expect(params).toContain("u-me");
    // and the SQL must carry the ownership guard (catches a refactor that drops it)
    expect(sql).toMatch(/from beans where id = \$3 and user_id = \$2/i);
  });
});
