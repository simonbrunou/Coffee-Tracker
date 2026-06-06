"use server";
import { signOut } from "@/auth";
import { pool, withTransaction } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { bumpSessionVersion } from "@/lib/users-repo";

// Match the repo's Queryable wrapper pattern (see app/auth-actions.ts).
const poolDb = { query: (text: string, params?: unknown[]) => pool.query(text, params) };

/** "Sign out everywhere": bump the session_version so EVERY device's frozen JWT
 *  is stale on its next request (reads via getCurrentUserId, writes via
 *  requireUserId), then sign out this device. Bump must precede signOut. */
export async function signOutAllDevices(): Promise<void> {
  const userId = await requireUserId();
  await bumpSessionVersion(poolDb, userId);
  await signOut({ redirectTo: "/" }); // redirect throws — last statement
}

/** Hard-delete the account. DELETE FROM users cascades to every user-owned row
 *  (accounts, beans→tastings→likes/saves/comments, the user's own tastings/likes,
 *  follows, saves, wishlist, comments). Runs in a tx; signOut is last because its
 *  redirect throws. next-auth writes the session-clearing cookie BEFORE the
 *  redirect throw and JWT signOut needs no DB, so the user is logged out on this
 *  same response; read-path revocation (row gone → getSessionVersion null →
 *  getCurrentUserId null) is a backstop only if signOut fails before that write. */
export async function deleteAccount(): Promise<void> {
  const userId = await requireUserId();
  await withTransaction((c) => c.query("delete from users where id = $1", [userId]));
  await signOut({ redirectTo: "/" }); // redirect throws — last statement
}
