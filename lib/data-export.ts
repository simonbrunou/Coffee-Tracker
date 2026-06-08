import "server-only";
import { query } from "@/lib/db";
import { getMyTastings, getMyShelf, getSavedTastings, getWishlistBeans } from "@/lib/queries";

// A high bound for the export getters (vs the UI's 200 cap) so a right-of-access
// export is effectively complete while still guarding against a pathological row
// count blowing up memory.
const EXPORT_LIMIT = 100_000;

/** Gather the caller's data for a self-service export (DSAR / right-to-access).
 *  Scoped entirely to `userId` — no other user's private data. Excludes secrets
 *  (password_hash, session_version, OAuth tokens). Collections are bounded at
 *  EXPORT_LIMIT rows (far above any real account). */
export async function getDataExport(userId: string): Promise<Record<string, unknown>> {
  const [profile, brews, bags, saved, wishlist, comments, followUsers, followRoasters, providers] = await Promise.all([
    query(
      `select id, name, handle, email, bio,
              (email_verified is not null) as email_verified,
              (password_hash is not null) as has_password,
              discoverable, created_at
       from users where id = $1`,
      [userId],
    ),
    getMyTastings(userId, EXPORT_LIMIT),
    getMyShelf(userId, EXPORT_LIMIT),
    getSavedTastings(userId, EXPORT_LIMIT),
    getWishlistBeans(userId, EXPORT_LIMIT),
    query(`select id, tasting_id, body, created_at, updated_at from comments where user_id = $1 order by created_at`, [userId]),
    query<{ followee_id: string }>(`select followee_id from user_follows where follower_id = $1`, [userId]),
    query<{ roaster_id: string }>(`select roaster_id from roaster_follows where user_id = $1`, [userId]),
    query(`select provider, created_at from accounts where user_id = $1 order by provider`, [userId]),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile: profile.rows[0] ?? null,
    signInMethods: { providers: providers.rows },
    brews,
    bags,
    savedBrews: saved,
    wishlist,
    comments: comments.rows,
    following: {
      users: followUsers.rows.map((r) => r.followee_id),
      roasters: followRoasters.rows.map((r) => r.roaster_id),
    },
  };
}
