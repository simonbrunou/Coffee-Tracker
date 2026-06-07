import { describe, it, expect } from "vitest";
import { generateNonce, buildCsp, staticSecurityHeaders } from "@/lib/security-headers";

describe("generateNonce", () => {
  it("is a base64 token matching Next's nonce regex, unique per call", () => {
    const n = generateNonce();
    expect(n).toMatch(/^[A-Za-z0-9+/_-]+={0,2}$/);
    expect(generateNonce()).not.toBe(n);
  });
});

const O = "https://x.test"; // absolute origin the middleware supplies

describe("buildCsp", () => {
  const csp = buildCsp("NONCE", { isDev: false, isHttps: true, origin: O });
  it("uses nonce + strict-dynamic for scripts and NO unsafe-inline in script-src", () => {
    expect(csp).toMatch(/script-src 'self' 'nonce-NONCE' 'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
  it("allows inline styles via unsafe-inline with NO style nonce", () => {
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'/);
    expect(csp).not.toMatch(/style-src[^;]*nonce/);
  });
  it("includes the bypass-closing directives", () => {
    for (const d of ["default-src 'self'", "base-uri 'self'", "form-action 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
      expect(csp).toContain(d);
    }
  });
  it("points reporting at an ABSOLUTE /api/csp-report URL", () => {
    expect(csp).toContain(`report-uri ${O}/api/csp-report`);
    expect(csp).toMatch(/report-to csp-endpoint/);
  });
  it("adds unsafe-eval only in dev", () => {
    expect(buildCsp("N", { isDev: true, isHttps: true, origin: O })).toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(buildCsp("N", { isDev: false, isHttps: true, origin: O })).not.toMatch(/'unsafe-eval'/);
  });
  it("adds upgrade-insecure-requests only over https", () => {
    expect(buildCsp("N", { isDev: false, isHttps: true, origin: O })).toMatch(/upgrade-insecure-requests/);
    expect(buildCsp("N", { isDev: false, isHttps: false, origin: O })).not.toMatch(/upgrade-insecure-requests/);
  });
});

describe("staticSecurityHeaders", () => {
  it("includes the standard headers (absolute Reporting-Endpoints); HSTS only over https", () => {
    const https = new Map(staticSecurityHeaders({ isDev: false, isHttps: true, origin: O }));
    expect(https.get("X-Frame-Options")).toBe("DENY");
    expect(https.get("X-Content-Type-Options")).toBe("nosniff");
    expect(https.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(https.get("Permissions-Policy")).toMatch(/camera=\(\)/);
    expect(https.get("Reporting-Endpoints")).toBe(`csp-endpoint="${O}/api/csp-report"`);
    expect(https.get("Strict-Transport-Security")).toMatch(/max-age=/);
    expect(new Map(staticSecurityHeaders({ isDev: false, isHttps: false, origin: O })).has("Strict-Transport-Security")).toBe(false);
  });
});
