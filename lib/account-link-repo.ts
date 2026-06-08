import "server-only";
import { query } from "@/lib/db";

/** The user's live sign-in methods, for the Settings UI. */
export async function getAuthMethods(userId: string): Promise<{ hasPassword: boolean; providers: string[] }> {
  const [u, a] = await Promise.all([
    query<{ has: boolean }>(`select password_hash is not null as has from users where id = $1`, [userId]),
    query<{ provider: string }>(`select provider from accounts where user_id = $1 order by provider`, [userId]),
  ]);
  return { hasPassword: u.rows[0]?.has ?? false, providers: a.rows.map((r) => r.provider) };
}
