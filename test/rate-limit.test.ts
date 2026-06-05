import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, __resetRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimit());

  it("allows up to the limit then blocks", () => {
    for (let i = 0; i < 10; i++) expect(checkRateLimit("ip:1.2.3.4")).toBe(true);
    expect(checkRateLimit("ip:1.2.3.4")).toBe(false);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("ip:a");
    expect(checkRateLimit("ip:a")).toBe(false);
    expect(checkRateLimit("ip:b")).toBe(true);
  });

  it("resets after the window", () => {
    const now = { t: 0 };
    const clock = () => now.t;
    for (let i = 0; i < 10; i++) checkRateLimit("ip:x", clock);
    expect(checkRateLimit("ip:x", clock)).toBe(false);
    now.t = 15 * 60 * 1000 + 1;
    expect(checkRateLimit("ip:x", clock)).toBe(true);
  });
});
