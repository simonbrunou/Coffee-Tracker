import { describe, it, expect } from "vitest";
import { clientIp } from "@/lib/request-ip";

describe("clientIp", () => {
  it("returns the right-most (trusted proxy-appended) hop", () => {
    expect(clientIp("1.1.1.1, 2.2.2.2, 3.3.3.3")).toBe("3.3.3.3");
  });
  it("ignores a forged left-most client value", () => {
    // attacker sent 9.9.9.9; Traefik appended the real client IP on the right
    expect(clientIp("9.9.9.9, 10.0.0.5")).toBe("10.0.0.5");
  });
  it("handles a single hop", () => {
    expect(clientIp("10.0.0.5")).toBe("10.0.0.5");
  });
  it("with 2 trusted hops (e.g. CDN + Traefik), takes the 2nd-from-right", () => {
    expect(clientIp("9.9.9.9, 10.0.0.5, 172.16.0.1", 2)).toBe("10.0.0.5");
  });
  it("returns 'unknown' when there are fewer hops than trusted proxies", () => {
    expect(clientIp("10.0.0.5", 2)).toBe("unknown");
  });
  it("returns 'unknown' for null/empty/garbage", () => {
    expect(clientIp(null)).toBe("unknown");
    expect(clientIp("")).toBe("unknown");
    expect(clientIp("  ,  ")).toBe("unknown");
  });
});
