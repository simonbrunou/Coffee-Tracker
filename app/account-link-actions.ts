"use server";
import { cookies } from "next/headers";
import { signIn, unstable_update } from "@/auth";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { confirmPasswordReauth, REAUTH_ERROR } from "@/lib/reauth";
import { hashPassword } from "@/lib/passwords";
import { validatePassword } from "@/lib/signup-validation";
import { bumpSessionVersion } from "@/lib/users-repo";
import { createLinkToken } from "@/lib/link-tokens";
import { unlinkAccount, removeUserPassword, setUserPassword } from "@/lib/account-link-repo";

const poolDb = { query: (text: string, params?: unknown[]) => pool.query(text, params) };
const LINKABLE = new Set(["google", "github"]);

const LAST_METHOD = "You must keep at least one sign-in method.";

/** Revoke OTHER devices (bump session_version) but keep THIS session live:
 *  unstable_update re-issues the current JWT, and the jwt update-trigger
 *  re-stamps sv from the AUTHORITATIVE DB value (the just-bumped one). */
async function bumpAndKeepCurrent(userId: string): Promise<void> {
  await bumpSessionVersion(poolDb, userId);
  await unstable_update({});
}

/** Begin linking `provider` to the caller's account: mint a single-use link
 *  nonce + set the per-provider cookie, then start the OAuth flow. The OAuth
 *  callback's signIn branch (auth.ts) consumes the nonce and links. */
export async function linkOAuthStart(provider: string): Promise<void> {
  const uid = await requireUserId();
  if (!LINKABLE.has(provider)) throw new Error("Unsupported provider");
  const raw = await createLinkToken(poolDb, uid, provider);
  // Set-cookie MUST be the statement immediately before signIn (no try/catch):
  // its Set-Cookie rides the one 302 to the provider; SameSite=Lax survives the
  // top-level OAuth redirect back to /api/auth/callback. secure only in prod (a
  // Secure cookie is dropped over http localhost → the link would silently merge).
  (await cookies()).set(`link_nonce_${provider}`, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  await signIn(provider, { redirectTo: "/settings" }); // redirect throws — last statement
}

/** Disconnect an OAuth provider (keeps ≥1 method; revokes other devices).
 *  Credential users must re-confirm their password first (L3). */
export async function unlinkOAuth(provider: string, confirmPassword?: string): Promise<{ error: string }> {
  const uid = await requireUserId();
  if (!(await confirmPasswordReauth(uid, confirmPassword))) return { error: REAUTH_ERROR };
  if (!(await unlinkAccount(uid, provider))) return { error: LAST_METHOD };
  await bumpAndKeepCurrent(uid);
  return { error: "" };
}

/** Remove the password (keeps ≥1 method; revokes other devices). The current
 *  password must be re-confirmed (L3) — removing it is a sign-in-method change a
 *  hijacked session must not make unchallenged. */
export async function removePassword(confirmPassword?: string): Promise<{ error: string }> {
  const uid = await requireUserId();
  if (!(await confirmPasswordReauth(uid, confirmPassword))) return { error: REAUTH_ERROR };
  if (!(await removeUserPassword(uid))) return { error: LAST_METHOD };
  await bumpAndKeepCurrent(uid);
  return { error: "" };
}

/** Add a password to an OAuth-only account. No bump (adding a method). */
export async function setPassword(password: string): Promise<{ error: string }> {
  const uid = await requireUserId();
  const v = validatePassword(password);
  if (!v.ok) return { error: v.error };
  return { error: await setUserPassword(uid, await hashPassword(password)) };
}
