import { describe, it, expect } from "vitest";
import { resolveUserOrThrow, isLiveSession } from "@/lib/auth-guard";

describe("resolveUserOrThrow", () => {
  it("throws when there is no session", () => {
    expect(() => resolveUserOrThrow(null, 0)).toThrow();
  });
  it("throws when the session_version is stale", () => {
    expect(() => resolveUserOrThrow({ id: "u-1", sv: 1 }, 3)).toThrow();
  });
  it("throws when the user no longer exists (live version null)", () => {
    expect(() => resolveUserOrThrow({ id: "u-1", sv: 1 }, null)).toThrow();
  });
  it("returns the id when versions match", () => {
    expect(resolveUserOrThrow({ id: "u-1", sv: 3 }, 3)).toBe("u-1");
  });
});

describe("isLiveSession", () => {
  it("is true only when both are numbers and equal", () => {
    expect(isLiveSession(3, 3)).toBe(true);
  });
  it("is false when the live version is stale", () => {
    expect(isLiveSession(3, 5)).toBe(false);
  });
  it("is false when the user no longer exists (live null)", () => {
    expect(isLiveSession(3, null)).toBe(false);
  });
  it("is false when the session version is missing (undefined)", () => {
    expect(isLiveSession(undefined, 0)).toBe(false);
  });
  it("is false when both are absent", () => {
    expect(isLiveSession(undefined, null)).toBe(false);
  });
});
