import { describe, it, expect } from "vitest";
import { validateSignup } from "@/lib/signup-validation";

describe("validateSignup", () => {
  it("accepts a good signup and normalizes email", () => {
    const r = validateSignup({ name: "  Theo ", email: "Theo@Example.COM", password: "longenough1", handle: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe("theo@example.com");
      expect(r.value.name).toBe("Theo");
    }
  });

  it("rejects a short password", () => {
    const r = validateSignup({ name: "Theo", email: "t@e.com", password: "short", handle: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects a password over 72 bytes", () => {
    const r = validateSignup({ name: "Theo", email: "t@e.com", password: "a".repeat(73), handle: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects a malformed email and an invalid handle", () => {
    expect(validateSignup({ name: "T", email: "nope", password: "longenough1", handle: "" }).ok).toBe(false);
    expect(validateSignup({ name: "T", email: "t@e.com", password: "longenough1", handle: "Bad Handle" }).ok).toBe(false);
  });
});
