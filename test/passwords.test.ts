import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, DUMMY_HASH } from "@/lib/passwords";

describe("passwords", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("hunter2-correct-horse");
    expect(hash).not.toBe("hunter2-correct-horse");
    expect(await verifyPassword("hunter2-correct-horse", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("right-password-123");
    expect(await verifyPassword("wrong-password-123", hash)).toBe(false);
  });

  it("DUMMY_HASH is a valid bcrypt hash that never matches realistic input", async () => {
    expect(DUMMY_HASH).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword("anything-at-all", DUMMY_HASH)).toBe(false);
  });
});
