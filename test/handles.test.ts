import { describe, it, expect } from "vitest";
import { generateHandle, isValidHandle } from "@/lib/handles";

describe("handles", () => {
  it("generates user_ + 10 base36 chars", () => {
    const h = generateHandle();
    expect(h).toMatch(/^user_[0-9a-z]{10}$/);
  });

  it("generates distinct handles across calls", () => {
    const set = new Set(Array.from({ length: 50 }, () => generateHandle()));
    expect(set.size).toBe(50);
  });

  it("validates user-supplied handles", () => {
    expect(isValidHandle("theo_brews")).toBe(true);
    expect(isValidHandle("ab")).toBe(false);            // too short
    expect(isValidHandle("Has Spaces")).toBe(false);
    expect(isValidHandle("nope!")).toBe(false);
  });
});
