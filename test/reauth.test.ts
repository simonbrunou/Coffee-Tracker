import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const verifyMock = vi.fn();
vi.mock("@/lib/passwords", () => ({ verifyPassword: (...a: unknown[]) => verifyMock(...a) }));

import { confirmPasswordReauth } from "@/lib/reauth";

beforeEach(() => {
  queryMock.mockReset();
  verifyMock.mockReset();
});

describe("confirmPasswordReauth", () => {
  it("passes an OAuth-only user (no password hash) with no second factor to confirm", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ hash: null }] });
    expect(await confirmPasswordReauth("u-oauth", undefined)).toBe(true);
    expect(verifyMock).not.toHaveBeenCalled();
  });
  it("rejects a credential user who supplies no password", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ hash: "$2b$..." }] });
    expect(await confirmPasswordReauth("u-cred", undefined)).toBe(false);
    expect(verifyMock).not.toHaveBeenCalled();
  });
  it("rejects a credential user whose password does not match", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ hash: "$2b$..." }] });
    verifyMock.mockResolvedValueOnce(false);
    expect(await confirmPasswordReauth("u-cred", "wrong")).toBe(false);
  });
  it("allows a credential user with the correct password", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ hash: "$2b$..." }] });
    verifyMock.mockResolvedValueOnce(true);
    expect(await confirmPasswordReauth("u-cred", "right")).toBe(true);
    expect(verifyMock).toHaveBeenCalledWith("right", "$2b$...");
  });
  it("treats a missing user row as no password (defensive)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await confirmPasswordReauth("u-gone", undefined)).toBe(true);
  });
});
