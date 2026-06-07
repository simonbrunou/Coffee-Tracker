import { describe, it, expect, vi, beforeEach } from "vitest";

const warnMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { warn: (...a: unknown[]) => warnMock(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/csp-report/route";

beforeEach(() => warnMock.mockReset());

describe("POST /api/csp-report", () => {
  it("logs the violation and returns 204", async () => {
    const res = await POST(new Request("http://localhost/api/csp-report", {
      method: "POST",
      body: JSON.stringify({ "csp-report": { "violated-directive": "script-src" } }),
    }));
    expect(res.status).toBe(204);
    expect(warnMock).toHaveBeenCalledWith("csp_violation", expect.objectContaining({ report: expect.any(String) }));
  });
  it("still returns 204 on a malformed body", async () => {
    const bad = { text: async () => { throw new Error("boom"); } } as unknown as Request;
    const res = await POST(bad);
    expect(res.status).toBe(204);
  });
});
