import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const consumeMock = vi.fn();
vi.mock("@/lib/verification-tokens", () => ({ consumeVerificationToken: (...a: unknown[]) => consumeMock(...a) }));

import { GET } from "@/app/api/verify/route";

beforeEach(() => { queryMock.mockReset(); consumeMock.mockReset(); });

describe("GET /api/verify", () => {
  it("valid token: stamps email_verified and redirects to /?verified=1", async () => {
    consumeMock.mockResolvedValueOnce({ userId: "u-1" });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await GET(new Request("https://x.test/api/verify?token=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/\?verified=1$/);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/update users set email_verified = now\(\) where id = \$1/i);
    expect(params).toEqual(["u-1"]);
  });
  it("invalid/expired token: redirects to /?verified=0 without an UPDATE", async () => {
    consumeMock.mockResolvedValueOnce(null);
    const res = await GET(new Request("https://x.test/api/verify?token=bad"));
    expect(res.headers.get("location")).toMatch(/\/\?verified=0$/);
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("missing token: redirects to /?verified=0", async () => {
    const res = await GET(new Request("https://x.test/api/verify"));
    expect(res.headers.get("location")).toMatch(/\/\?verified=0$/);
  });
});
