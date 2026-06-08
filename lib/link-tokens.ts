import "server-only";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import type { Queryable } from "@/lib/users-repo";

const TTL = "10 minutes";

function hashToken(raw: string): string {
  // HMAC-bind to AUTH_SECRET so a DB-only leak (the stored hash) can't forge a token.
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(raw).digest("hex");
}

/** Mint a single-use link nonce for (userId, provider); drop any prior one for that
 *  pair (one live link attempt per provider). Returns the raw token (goes in the cookie). */
export async function createLinkToken(db: Queryable, userId: string, provider: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.query(`delete from link_tokens where user_id = $1 and provider = $2`, [userId, provider]);
  await db.query(
    `insert into link_tokens (id, user_id, provider, token_hash, expires_at)
     values ($1, $2, $3, $4, now() + $5::interval)`,
    [`lt-${randomUUID()}`, userId, provider, hashToken(raw), TTL],
  );
  // Opportunistic prune (~1%) of globally-expired rows (mirrors verification-tokens).
  if (Math.random() < 0.01) {
    Promise.resolve(db.query(`delete from link_tokens where expires_at < now()`)).catch(() => {});
  }
  return raw;
}

/** Atomic single-use consume, scoped to provider. Returns the userId or null. */
export async function consumeLinkToken(db: Queryable, raw: string, provider: string): Promise<{ userId: string } | null> {
  const { rows } = await db.query(
    `delete from link_tokens where token_hash = $1 and provider = $2 and expires_at > now() returning user_id`,
    [hashToken(raw), provider],
  );
  const row = rows[0] as { user_id: string } | undefined;
  return row ? { userId: row.user_id } : null;
}
