import "server-only";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import type { Queryable } from "@/lib/users-repo";

const TTL = "24 hours";

function hashToken(raw: string): string {
  // HMAC-bind to AUTH_SECRET so a DB-only leak (the stored hash) can't forge a token.
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(raw).digest("hex");
}

/** A 256-bit url-safe token + its at-rest hash. */
export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/** One live link per user: drop prior tokens, insert a fresh one, return the raw token. */
export async function createVerificationToken(db: Queryable, userId: string, email: string): Promise<string> {
  const { raw, hash } = generateToken();
  await db.query(`delete from verification_tokens where user_id = $1`, [userId]);
  await db.query(
    `insert into verification_tokens (id, user_id, email, token_hash, expires_at)
     values ($1, $2, $3, $4, now() + $5::interval)`,
    [`vt-${randomUUID()}`, userId, email, hash, TTL],
  );
  // Opportunistic prune (~1%) of globally-expired rows so abandoned signups don't
  // accumulate (mirrors lib/rate-limit.ts). Fire-and-forget; never affects the result.
  if (Math.random() < 0.01) {
    Promise.resolve(db.query(`delete from verification_tokens where expires_at < now()`)).catch(() => {});
  }
  return raw;
}

/** Atomic single-use consume: returns the userId or null. */
export async function consumeVerificationToken(db: Queryable, raw: string): Promise<{ userId: string } | null> {
  const { rows } = await db.query(
    `delete from verification_tokens where token_hash = $1 and expires_at > now() returning user_id`,
    [hashToken(raw)],
  );
  const row = rows[0] as { user_id: string } | undefined;
  return row ? { userId: row.user_id } : null;
}
