import "server-only";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import type { Queryable } from "@/lib/users-repo";

const TTL = "10 minutes";

/** What a single-use OAuth step-up nonce authorizes: connecting a provider
 *  ("link") or re-authenticating to confirm irreversible account deletion
 *  ("reauth_delete"). Scoping create/consume by purpose keeps the two flows from
 *  ever consuming each other's nonce. */
export type TokenPurpose = "link" | "reauth_delete";

function hashToken(raw: string): string {
  // HMAC-bind to AUTH_SECRET so a DB-only leak (the stored hash) can't forge a token.
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(raw).digest("hex");
}

/** Mint a single-use nonce for (userId, provider, purpose); drop any prior one for
 *  that exact triple (one live attempt per purpose) — so minting a reauth_delete
 *  nonce never clobbers a pending link nonce, and vice versa. Returns the raw token
 *  (goes in the cookie). */
export async function createLinkToken(
  db: Queryable,
  userId: string,
  provider: string,
  purpose: TokenPurpose = "link",
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.query(`delete from link_tokens where user_id = $1 and provider = $2 and purpose = $3`, [userId, provider, purpose]);
  await db.query(
    `insert into link_tokens (id, user_id, provider, token_hash, purpose, expires_at)
     values ($1, $2, $3, $4, $5, now() + $6::interval)`,
    [`lt-${randomUUID()}`, userId, provider, hashToken(raw), purpose, TTL],
  );
  // Opportunistic prune (~1%) of globally-expired rows (mirrors verification-tokens).
  if (Math.random() < 0.01) {
    Promise.resolve(db.query(`delete from link_tokens where expires_at < now()`)).catch(() => {});
  }
  return raw;
}

/** Atomic single-use consume, scoped to (provider, purpose). Returns the userId or null. */
export async function consumeLinkToken(
  db: Queryable,
  raw: string,
  provider: string,
  purpose: TokenPurpose = "link",
): Promise<{ userId: string } | null> {
  const { rows } = await db.query(
    `delete from link_tokens where token_hash = $1 and provider = $2 and purpose = $3 and expires_at > now() returning user_id`,
    [hashToken(raw), provider, purpose],
  );
  const row = rows[0] as { user_id: string } | undefined;
  return row ? { userId: row.user_id } : null;
}
