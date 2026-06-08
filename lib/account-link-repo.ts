import "server-only";
import { randomUUID } from "node:crypto";
import { query, withTransaction } from "@/lib/db";

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
