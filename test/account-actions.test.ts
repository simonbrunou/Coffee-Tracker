import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks declared via vi.hoisted so they are initialized BEFORE the hoisted
// vi.mock factories + the static SUT import run. A bare `const x = vi.fn()`
// referenced directly inside a factory throws a TDZ ReferenceError under
// vitest's hoisting ("Cannot access 'x' before initialization").
const { requireUserId, signOut, bumpSessionVersion, deleteUserWithPii, withTransaction, poolQuery, confirmPasswordReauth } = vi.hoisted(() => ({
  requireUserId: vi.fn(async () => "u-me"),
  signOut: vi.fn(async () => {}),
  bumpSessionVersion: vi.fn(async () => {}),
  deleteUserWithPii: vi.fn(async () => {}),
  withTransaction: vi.fn(),
  poolQuery: vi.fn(async () => ({ rows: [] })),
  confirmPasswordReauth: vi.fn(async () => true),
}));

vi.mock("@/lib/auth", () => ({ requireUserId }));
vi.mock("@/auth", () => ({ signOut }));
vi.mock("@/lib/reauth", () => ({ confirmPasswordReauth, REAUTH_ERROR: "Incorrect password. Please try again." }));
vi.mock("@/lib/users-repo", () => ({ bumpSessionVersion, deleteUserWithPii }));
vi.mock("@/lib/db", () => ({ pool: { query: poolQuery }, withTransaction, query: vi.fn() }));

import { signOutAllDevices, deleteAccount } from "@/app/account-actions";

beforeEach(() => {
  requireUserId.mockClear();
  requireUserId.mockResolvedValue("u-me");
  signOut.mockClear();
  bumpSessionVersion.mockClear();
  deleteUserWithPii.mockClear();
  withTransaction.mockReset();
  confirmPasswordReauth.mockReset();
  confirmPasswordReauth.mockResolvedValue(true);
});

describe("signOutAllDevices", () => {
  it("requires auth, bumps the session version, THEN signs out", async () => {
    await signOutAllDevices();
    expect(requireUserId).toHaveBeenCalled();
    expect(bumpSessionVersion).toHaveBeenCalledWith({ query: expect.any(Function) }, "u-me");
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
    expect(bumpSessionVersion.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });
});

describe("deleteAccount", () => {
  it("requires auth, deletes the user + purges PII inside a tx, THEN signs out", async () => {
    const innerQuery = vi.fn(async () => ({ rows: [] }));
    withTransaction.mockImplementation(async (fn: (c: unknown) => unknown) =>
      fn({ query: innerQuery }),
    );
    await deleteAccount("my-password");
    expect(requireUserId).toHaveBeenCalled();
    // L3: re-auth is confirmed before any destructive work.
    expect(confirmPasswordReauth).toHaveBeenCalledWith("u-me", "my-password");
    // deleteAccount delegates to deleteUserWithPii (delete user + purge email-keyed
    // rate_limits) inside the transaction, then signs out.
    expect(deleteUserWithPii).toHaveBeenCalledWith({ query: expect.any(Function) }, "u-me");
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
    expect(deleteUserWithPii.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });

  it("L3: aborts with an error (no delete) when re-auth fails", async () => {
    confirmPasswordReauth.mockResolvedValueOnce(false);
    const r = await deleteAccount("wrong");
    expect(r.error).toMatch(/password/i);
    expect(withTransaction).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("aborts before deleting if the auth gate throws (revoked/unauth)", async () => {
    requireUserId.mockRejectedValueOnce(new Error("Session revoked"));
    await expect(deleteAccount("pw")).rejects.toThrow(/revoked/i);
    expect(withTransaction).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
