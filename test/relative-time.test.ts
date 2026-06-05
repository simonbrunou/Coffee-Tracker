import { describe, it, expect } from "vitest";
import { relativeTime } from "@/lib/relative-time";

const now = Date.UTC(2026, 5, 5, 12, 0, 0); // fixed "now"
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

describe("relativeTime", () => {
  it("returns 'just now' under a minute", () => {
    expect(relativeTime(iso(30_000), now)).toBe("just now");
  });
  it("minutes", () => expect(relativeTime(iso(5 * 60_000), now)).toBe("5m"));
  it("hours", () => expect(relativeTime(iso(3 * 3_600_000), now)).toBe("3h"));
  it("days", () => expect(relativeTime(iso(2 * 86_400_000), now)).toBe("2d"));
  it("weeks", () => expect(relativeTime(iso(14 * 86_400_000), now)).toBe("2w"));
  it("falls back to a date past ~1y", () => {
    expect(relativeTime(iso(400 * 86_400_000), now)).toMatch(/2025/);
  });
});
