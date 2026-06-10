import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks declared via vi.hoisted so they are initialized BEFORE the hoisted
// vi.mock factories + the static SUT import run. A bare `const x = vi.fn()`
// referenced directly inside a factory throws a TDZ ReferenceError under
// vitest's hoisting ("Cannot access 'x' before initialization").
const { requireUserId, signOut, signIn, bumpSessionVersion, deleteUserWithPii, withTransaction, poolQuery, confirmPasswordReauth, userHasPassword, createLinkToken, cookieSet } = vi.hoisted(() => ({
  requireUserId: vi.fn(async () => "u-me"),
  signOut: vi.fn(async () => {}),
  signIn: vi.fn(async () => {}),
  bumpSessionVersion: vi.fn(async () => {}),
  deleteUserWithPii: vi.fn(async () => {}),
  withTransaction: vi.fn(),
  poolQuery: vi.fn(async (): Promise<{ rows: unknown[] }> => ({ rows: [] })),
  confirmPasswordReauth: vi.fn(async () => true),
  userHasPassword: vi.fn(async () => true),
  createLinkToken: vi.fn(async () => "raw-nonce"),
  cookieSet: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUserId }));
vi.mock("@/auth", () => ({ signOut, signIn }));
vi.mock("@/lib/reauth", () => ({ confirmPasswordReauth, userHasPassword, REAUTH_ERROR: "Incorrect password. Please try again." }));
vi.mock("@/lib/users-repo", () => ({ bumpSessionVersion, deleteUserWithPii }));
vi.mock("@/lib/link-tokens", () => ({ createLinkToken }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: cookieSet }) }));
vi.mock("@/lib/db", () => ({ pool: { query: poolQuery }, withTransaction, query: vi.fn() }));

import { signOutAllDevices, deleteAccount, startDeleteReauth } from "@/app/account-actions";

beforeEach(() => {
  requireUserId.mockClear();
  requireUserId.mockResolvedValue("u-me");
  signOut.mockClear();
  signIn.mockClear();
  bumpSessionVersion.mockClear();
  deleteUserWithPii.mockClear();
  withTransaction.mockReset();
  confirmPasswordReauth.mockReset();
  confirmPasswordReauth.mockResolvedValue(true);
  userHasPassword.mockReset();
  userHasPassword.mockResolvedValue(true);
  createLinkToken.mockClear();
  cookieSet.mockClear();
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

  it("rejects an OAuth-only (password-less) user — they must use the provider re-auth flow", async () => {
    userHasPassword.mockResolvedValueOnce(false);
    const r = await deleteAccount();
    expect(r.error).toMatch(/connected account/i);
    expect(confirmPasswordReauth).not.toHaveBeenCalled(); // never reaches the no-op password check
    expect(withTransaction).not.toHaveBeenCalled();
    expect(deleteUserWithPii).not.toHaveBeenCalled();
  });
});

describe("startDeleteReauth (OAuth re-auth before delete)", () => {
  // OAuth-only user (no password) with the provider linked.
  function oauthOnlyLinked() {
    userHasPassword.mockResolvedValueOnce(false);
    poolQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }); // accounts row exists
  }
  it("mints a reauth_delete nonce, sets the per-provider cookie, then starts OAuth", async () => {
    oauthOnlyLinked();
    await startDeleteReauth("google");
    expect(createLinkToken).toHaveBeenCalledWith(expect.anything(), "u-me", "google", "reauth_delete");
    expect(cookieSet).toHaveBeenCalledWith("reauth_delete_google", "raw-nonce", expect.objectContaining({ httpOnly: true, sameSite: "lax", maxAge: 600 }));
    expect(signIn).toHaveBeenCalledWith("google", { redirectTo: "/settings" });
    // the cookie is set BEFORE signIn so its Set-Cookie rides the OAuth 302
    expect(cookieSet.mock.invocationCallOrder[0]).toBeLessThan(signIn.mock.invocationCallOrder[0]);
  });
  it("rejects an unsupported provider before minting anything", async () => {
    await expect(startDeleteReauth("myspace")).rejects.toThrow(/unsupported/i);
    expect(createLinkToken).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });
  it("rejects a credential user — they must delete via password, not the OAuth path", async () => {
    userHasPassword.mockResolvedValueOnce(true);
    await expect(startDeleteReauth("google")).rejects.toThrow(/password/i);
    expect(createLinkToken).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });
  it("rejects a provider the user hasn't actually linked", async () => {
    userHasPassword.mockResolvedValueOnce(false);
    poolQuery.mockResolvedValueOnce({ rows: [] }); // no linked accounts row
    await expect(startDeleteReauth("google")).rejects.toThrow(/connected/i);
    expect(createLinkToken).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });
});
