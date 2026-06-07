import "server-only";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

// Trusted IP is the primary chokepoint; the per-email limit is higher so a known
// email can't be cheaply weaponized into an account lockout (it needs >=2 distinct
// real IPs, each capped at RL_IP_LIMIT, to reach RL_EMAIL_LIMIT).
export const RL_IP_LIMIT = 10;
export const RL_EMAIL_LIMIT = 20;
export const RL_DEFAULT_LIMIT = RL_IP_LIMIT;
const WINDOW = "15 minutes";
const QUERY_TIMEOUT_MS = 1000;

/** Atomic fixed-window upsert: resets an expired window or increments, in one
 *  statement. PK row-lock serializes concurrent callers across instances; now()
 *  is statement-stable so the reset is atomic. Returns the post-increment count. */
export const RATE_LIMIT_SQL = `insert into rate_limits (key, count, reset_at)
       values ($1, 1, now() + $2::interval)
       on conflict (key) do update
         set count = case when rate_limits.reset_at <= now() then 1 else rate_limits.count + 1 end,
             reset_at = case when rate_limits.reset_at <= now() then now() + $2::interval else rate_limits.reset_at end
       returning count`;

/** Reject if `p` doesn't settle within `ms`, so a hung query (lock contention, DB
 *  pressure) trips fail-open instead of stalling the auth request. The pool's
 *  connectionTimeoutMillis only bounds connection ACQUISITION, not execution. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error("rate_limit_query_timeout")), ms);
      (t as { unref?: () => void }).unref?.(); // don't keep the event loop alive
    }),
  ]);
}

/** Fixed-window limiter backed by Postgres (shared across instances). Returns true
 *  if allowed (and records the attempt). Fail-OPEN on any store error/timeout: the
 *  auth attempt still needs the DB to succeed, so this opens no usable brute-force
 *  window. Callers skip the per-IP check when the IP is "unknown" (see request-ip). */
export async function checkRateLimit(key: string, limit: number = RL_DEFAULT_LIMIT): Promise<boolean> {
  try {
    const { rows } = await withTimeout(query<{ count: number }>(RATE_LIMIT_SQL, [key, WINDOW]), QUERY_TIMEOUT_MS);
    // Opportunistic, best-effort cleanup so the user-controlled key space can't bloat
    // the table without a cron. Promise.resolve guards a non-promise return (e.g. a
    // test mock) so a stray cleanup can never throw into the decision path.
    if (Math.random() < 0.01) {
      Promise.resolve(query(`delete from rate_limits where reset_at < now()`)).catch(() => {});
    }
    return rows[0].count <= limit;
  } catch (err) {
    logger.error("rate_limit_db_error", { err: String(err), key });
    return true; // fail-open
  }
}
