import "server-only";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";

/** Shared user-facing message when the re-auth password is missing/incorrect. */
export const REAUTH_ERROR = "Incorrect password. Please try again.";

/** True if the user has a password set (i.e. is a credential user). Account
 *  deletion uses this to route OAuth-only users to the provider re-auth flow
 *  instead of the no-op password check. */
export async function userHasPassword(userId: string): Promise<boolean> {
  const { rows } = await query<{ has: boolean }>(
    `select password_hash is not null as has from users where id = $1`,
    [userId],
  );
  return rows[0]?.has ?? false;
}

/** Re-authentication guard for destructive account operations (L3): account
 *  deletion and sign-in-method changes. If the user has a password, the supplied
 *  password must match it — so a hijacked credential session can't silently destroy
 *  or take over the account. OAuth-only users have no password to confirm
 *  server-side; the authenticated, revocation-checked session is the only available
 *  gate for them, so they pass (re-running OAuth would be the stronger control).
 *  Returns true if the caller may proceed. */
export async function confirmPasswordReauth(userId: string, password: string | undefined): Promise<boolean> {
  const { rows } = await query<{ hash: string | null }>(
    `select password_hash as hash from users where id = $1`,
    [userId],
  );
  const hash = rows[0]?.hash ?? null;
  if (!hash) return true; // OAuth-only (or missing row): nothing to confirm
  if (!password) return false;
  return verifyPassword(password, hash);
}
