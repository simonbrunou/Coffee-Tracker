import "server-only";
import { randomUUID } from "node:crypto";
import { query, withTransaction } from "@/lib/db";

/** The userId that owns a given (provider, providerAccountId), or null. Used by
 *  the reauth-delete flow to verify the OAuth identity completing the step-up is
 *  the SAME account that requested deletion — so a different person's Google/GitHub
 *  can't confirm someone else's delete. */
export async function accountOwner(provider: string, providerAccountId: string): Promise<string | null> {
  const { rows } = await query<{ user_id: string }>(
    `select user_id from accounts where provider = $1 and provider_account_id = $2`,
    [provider, providerAccountId],
  );
  return rows[0]?.user_id ?? null;
}

/** The user's live sign-in methods, for the Settings UI. */
export async function getAuthMethods(userId: string): Promise<{ hasPassword: boolean; providers: string[] }> {
  const [u, a] = await Promise.all([
    query<{ has: boolean }>(`select password_hash is not null as has from users where id = $1`, [userId]),
    query<{ provider: string }>(`select provider from accounts where user_id = $1 order by provider`, [userId]),
  ]);
  return { hasPassword: u.rows[0]?.has ?? false, providers: a.rows.map((r) => r.provider) };
}

/** Link (provider, providerAccountId) to userId. Returns "linked" | "already" | "taken".
 *  `unique(provider, provider_account_id)` is the real guard — the pre-check is
 *  advisory; a racing INSERT 23505 is re-read to decide idempotent-vs-reject. The
 *  caller passes the real account.type (oidc for Google), matching the signup path. */
export async function linkAccount(
  provider: string,
  providerAccountId: string,
  userId: string,
  type: string,
): Promise<"linked" | "already" | "taken"> {
  return withTransaction(async (c) => {
    const existing = await c.query(
      `select user_id from accounts where provider = $1 and provider_account_id = $2`,
      [provider, providerAccountId],
    );
    if (existing.rows.length) {
      return (existing.rows[0] as { user_id: string }).user_id === userId ? "already" : "taken";
    }
    try {
      await c.query(
        `insert into accounts (id, user_id, type, provider, provider_account_id)
         values ($1, $2, $3, $4, $5)`,
        [`acc-${randomUUID()}`, userId, type, provider, providerAccountId],
      );
      return "linked";
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
      const row = await c.query(`select user_id from accounts where provider = $1 and provider_account_id = $2`, [provider, providerAccountId]);
      return (row.rows[0] as { user_id: string } | undefined)?.user_id === userId ? "already" : "taken";
    }
  });
}

/** Remove an OAuth method iff ≥1 method remains. Returns true if removed.
 *  R2: SELECT ... FOR UPDATE on the users row serializes concurrent removals so
 *  two racing unlinks of DIFFERENT providers can't both pass and drop to zero. */
export async function unlinkAccount(userId: string, provider: string): Promise<boolean> {
  return withTransaction(async (c) => {
    await c.query(`select id from users where id = $1 for update`, [userId]);
    const { rowCount } = await c.query(
      `delete from accounts where user_id = $1 and provider = $2
         and ((select count(*) from accounts where user_id = $1) > 1
              or (select password_hash is not null from users where id = $1))`,
      [userId, provider],
    );
    return (rowCount ?? 0) > 0;
  });
}

/** Add a password to an OAuth-only account. Returns "" on success, else a
 *  user-facing error. The UPDATE is self-guarded (`where password_hash is null`)
 *  so a self-race can't double-write; the partial users_email_lower_uq fires when
 *  password_hash flips non-null → 23505 mapped to a friendly message. */
export async function setUserPassword(userId: string, passwordHash: string): Promise<string> {
  const { rows } = await query<{ has: boolean; email: string | null; verified: boolean }>(
    `select password_hash is not null as has, email, email_verified is not null as verified from users where id = $1`,
    [userId],
  );
  const u = rows[0];
  if (!u) return "Account not found.";
  if (u.has) return "You already have a password.";
  if (!u.email) return "Add an email to your account before setting a password.";
  if (!u.verified) return "Verify your email before adding a password.";
  try {
    const { rowCount } = await query(
      `update users set password_hash = $2 where id = $1 and password_hash is null`,
      [userId, passwordHash],
    );
    if ((rowCount ?? 0) === 0) return "You already have a password.";
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return "An account with that email already has a password.";
    throw e;
  }
  return "";
}

/** Remove the password iff ≥1 OAuth method remains. Returns true if removed. */
export async function removeUserPassword(userId: string): Promise<boolean> {
  return withTransaction(async (c) => {
    await c.query(`select id from users where id = $1 for update`, [userId]);
    const { rowCount } = await c.query(
      `update users set password_hash = null
       where id = $1 and password_hash is not null
         and (select count(*) from accounts where user_id = $1) > 0`,
      [userId],
    );
    return (rowCount ?? 0) > 0;
  });
}
