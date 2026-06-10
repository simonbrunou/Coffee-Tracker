"use server";
import { cookies } from "next/headers";
import { signIn, signOut } from "@/auth";
import { pool, withTransaction } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { confirmPasswordReauth, userHasPassword, REAUTH_ERROR } from "@/lib/reauth";
import { bumpSessionVersion, deleteUserWithPii } from "@/lib/users-repo";
import { createLinkToken } from "@/lib/link-tokens";

// Match the repo's Queryable wrapper pattern (see app/auth-actions.ts).
const poolDb = { query: (text: string, params?: unknown[]) => pool.query(text, params) };
const LINKABLE = new Set(["google", "github"]);
const OAUTH_DELETE_HINT = "Confirm deletion with your connected account.";

/** "Sign out everywhere": bump the session_version so EVERY device's frozen JWT
 *  is stale on its next request (reads via getCurrentUserId, writes via
 *  requireUserId), then sign out this device. Bump must precede signOut. */
export async function signOutAllDevices(): Promise<void> {
  const userId = await requireUserId();
  await bumpSessionVersion(poolDb, userId);
  await signOut({ redirectTo: "/" }); // redirect throws — last statement
}

/** Hard-delete the account. deleteUserWithPii deletes the user row — which cascades
 *  to every user-owned row (accounts, beans→tastings→likes/saves/comments, the
 *  user's own tastings/likes, follows, saves, wishlist, comments) — AND purges the
 *  user's email-keyed rate_limits (no FK, so the cascade misses it). The
 *  withTransaction wrapper makes the SELECT-email + delete + purge one atomic unit.
 *  signOut is last because its redirect throws. next-auth writes the
 *  session-clearing cookie BEFORE the
 *  redirect throw and JWT signOut needs no DB, so the user is logged out on this
 *  same response; read-path revocation (row gone → getSessionVersion null →
 *  getCurrentUserId null) is a backstop only if signOut fails before that write.
 *  Requires password re-confirmation for credential users (L3) so a hijacked
 *  session can't irreversibly delete the account; returns {error} on a failed
 *  confirm and only throws the success redirect once the delete has run. */
export async function deleteAccount(confirmPassword?: string): Promise<{ error: string }> {
  const userId = await requireUserId();
  // Credential users confirm with their password. Password-less (OAuth-only) users
  // have no second factor here (confirmPasswordReauth would no-op-pass them), so we
  // REJECT them and route to the provider re-auth flow (startDeleteReauth) — closing
  // the gap where a hijacked OAuth-only session could delete with no challenge.
  if (!(await userHasPassword(userId))) return { error: OAUTH_DELETE_HINT };
  if (!(await confirmPasswordReauth(userId, confirmPassword))) return { error: REAUTH_ERROR };
  await withTransaction((c) => deleteUserWithPii({ query: (t, p) => c.query(t, p) }, userId));
  await signOut({ redirectTo: "/" }); // redirect throws — last statement
  return { error: "" }; // unreachable on success (redirect thrown)
}

/** Begin deleting an OAuth-only account: mint a single-use reauth_delete nonce +
 *  per-provider cookie, then start the OAuth flow. The provider callback (auth.ts)
 *  verifies the returning identity owns this account and performs the deletion —
 *  so the user must prove control of the linked provider, not just hold the
 *  session cookie. Mirrors linkOAuthStart. */
export async function startDeleteReauth(provider: string): Promise<void> {
  const uid = await requireUserId();
  if (!LINKABLE.has(provider)) throw new Error("Unsupported provider");
  const raw = await createLinkToken(poolDb, uid, provider, "reauth_delete");
  // Set-cookie MUST be the statement immediately before signIn (no try/catch) so
  // its Set-Cookie rides the one 302 to the provider; SameSite=Lax survives the
  // top-level OAuth redirect back. secure only in prod (a Secure cookie is dropped
  // over http localhost).
  (await cookies()).set(`reauth_delete_${provider}`, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  await signIn(provider, { redirectTo: "/settings" }); // redirect throws — last statement
}
