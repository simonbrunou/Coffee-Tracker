import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUserId = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUserId: (...a: unknown[]) => requireUserId(...a) }));
const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
const sendVerificationEmail = vi.fn();
vi.mock("@/lib/verify-email", () => ({ sendVerificationEmail: (...a: unknown[]) => sendVerificationEmail(...a) }));

import { resendVerification } from "@/app/verify-actions";

beforeEach(() => {
  requireUserId.mockClear(); requireUserId.mockResolvedValue("u-me");
  checkRateLimit.mockReset(); checkRateLimit.mockResolvedValue(true);
  sendVerificationEmail.mockReset();
});

describe("resendVerification", () => {
  it("rate-limits then re-sends for the current user", async () => {
    await resendVerification();
    expect(requireUserId).toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith(expect.stringContaining("verify:user:u-me"), expect.any(Number));
    expect(sendVerificationEmail).toHaveBeenCalledWith("u-me");
  });
  it("does NOT send when rate-limited (neutral)", async () => {
    checkRateLimit.mockResolvedValueOnce(false);
    await resendVerification();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});
