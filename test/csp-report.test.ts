import { describe, it, expect, vi, beforeEach } from "vitest";

const warnMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { warn: (...a: unknown[]) => warnMock(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
const throttleMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ recordAndCheck: (...a: unknown[]) => throttleMock(...a) }));
vi.mock("@/lib/request-ip", () => ({ clientIp: () => "1.2.3.4", TRUSTED_PROXY_HOPS: 1 }));

import { POST } from "@/app/api/csp-report/route";

const CSP_CT = "application/csp-report";
function cspReq(body: string, contentType = CSP_CT) {
  return new Request("http://localhost/api/csp-report", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

beforeEach(() => {
  warnMock.mockReset();
  throttleMock.mockReset();
  throttleMock.mockResolvedValue(true);
});

describe("POST /api/csp-report", () => {
  it("logs the violation and returns 204 for a valid report content-type", async () => {
    const res = await POST(cspReq(JSON.stringify({ "csp-report": { "violated-directive": "script-src" } })));
    expect(res.status).toBe(204);
    expect(warnMock).toHaveBeenCalledWith("csp_violation", expect.objectContaining({ report: expect.any(String) }));
  });
  it("accepts the reports+json content-type too", async () => {
    const res = await POST(cspReq("[]", "application/reports+json"));
    expect(res.status).toBe(204);
    expect(warnMock).toHaveBeenCalled();
  });
  it("L4: rejects an unexpected content-type without logging (415)", async () => {
    const res = await POST(cspReq("not a report", "text/plain"));
    expect(res.status).toBe(415);
    expect(warnMock).not.toHaveBeenCalled();
  });
  it("L4: rejects a content-type that merely CONTAINS the token (exact media-type match)", async () => {
    const res = await POST(cspReq("not a report", "text/plain; x=application/csp-report"));
    expect(res.status).toBe(415);
    expect(warnMock).not.toHaveBeenCalled();
  });
  it("accepts the report type with a trailing charset param", async () => {
    const res = await POST(cspReq("{}", "application/csp-report; charset=utf-8"));
    expect(res.status).toBe(204);
    expect(warnMock).toHaveBeenCalled();
  });
  it("L4: rate-limits by IP — a throttled caller is dropped (429) without logging", async () => {
    throttleMock.mockResolvedValueOnce(false);
    const res = await POST(cspReq("{}"));
    expect(res.status).toBe(429);
    expect(warnMock).not.toHaveBeenCalled();
  });
  it("still returns 204 on a malformed body", async () => {
    const bad = {
      headers: { get: () => CSP_CT },
      text: async () => { throw new Error("boom"); },
    } as unknown as Request;
    const res = await POST(bad);
    expect(res.status).toBe(204);
  });
});
