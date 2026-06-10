import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("proxy security headers", () => {
  it("sets a nonce CSP + static headers on the response (https)", () => {
    const req = new NextRequest(new URL("http://localhost/"), {
      headers: { "x-forwarded-proto": "https", host: "x.test" },
    });
    const res = proxy(req);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/_-]+={0,2}' 'strict-dynamic'/);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age=/);
  });
  it("does not emit HSTS over plain http", () => {
    const req = new NextRequest(new URL("http://localhost/"), { headers: { "x-forwarded-proto": "http" } });
    const res = proxy(req);
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });
});
