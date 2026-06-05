import { describe, it, expect } from "vitest";
import { resolveUserOrThrow } from "@/lib/auth-guard";

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
