import { describe, it, expect } from "vitest";
import { mapRegisterError } from "@/lib/register-errors";

describe("mapRegisterError", () => {
  it("maps the email unique index to a friendly message", () => {
    const e = Object.assign(new Error("dup"), { code: "23505", constraint: "users_email_lower_uq" });
    expect(mapRegisterError(e)).toBe("That email is already registered.");
  });
  it("maps a handle collision to a retryable message", () => {
    const e = Object.assign(new Error("dup"), { code: "23505", constraint: "users_handle_key" });
    expect(mapRegisterError(e)).toMatch(/try again/i);
  });
  it("rethrows non-23505 errors", () => {
    expect(() => mapRegisterError(new Error("other"))).toThrow("other");
  });
});
