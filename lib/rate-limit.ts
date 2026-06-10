import "server-only";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { redactKey } from "@/lib/redact";

// Trusted IP is the primary chokepoint; the per-email limit is higher so a known
// email can't be cheaply weaponized into an account lockout. Crucially, only
// FAILED attempts are recorded (recordAttempt) and a successful login clears the
// email window (clearAttempts), so an attacker can no longer wedge a victim out by
// spending the victim's own legitimate logins against the cap.
export const RL_IP_LIMIT = 10;
export const RL_EMAIL_LIMIT = 20;
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

const COUNT_SQL = `select count from rate_limits where key = $1 and reset_at > now()`;
const CLEAR_SQL = `delete from rate_limits where key = $1`;

/** Reject if `p` doesn't settle within `ms`, so a hung query (lock contention, DB
 *  pressure) trips fail-open instead of stalling the auth request. The pool's
 *  connectionTimeoutMillis only bounds connection ACQUISITION, not execution. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error("rate_limit_query_timeout")), ms);
    (t as { unref?: () => void }).unref?.(); // don't keep the event loop alive
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

/** Read-only check: is the live window already at/over `limit` recorded attempts?
 *  Does NOT record anything (callers record only on failure). Fail-OPEN (false) on
 *  any store error/timeout — the auth attempt still needs the DB to succeed, so an
 *  open window here grants no usable brute-force advantage. */
export async function isRateLimited(key: string, limit: number): Promise<boolean> {
  try {
    const { rows } = await withTimeout(query<{ count: number }>(COUNT_SQL, [key]), QUERY_TIMEOUT_MS);
    return (rows[0]?.count ?? 0) >= limit;
  } catch (err) {
    logger.error("rate_limit_db_error", { err: String(err), key: redactKey(key) });
    return false; // fail-open
  }
}

/** Record one FAILED attempt against `key` (the atomic fixed-window upsert).
 *  Best-effort: a store error is logged (with the email redacted) and swallowed so
 *  it never turns a failed login into a 500. */
export async function recordAttempt(key: string): Promise<void> {
  try {
    await withTimeout(query<{ count: number }>(RATE_LIMIT_SQL, [key, WINDOW]), QUERY_TIMEOUT_MS);
    // Opportunistic, best-effort cleanup so the user-controlled key space can't bloat
    // the table without a cron. Promise.resolve guards a non-promise return (e.g. a
    // test mock) so a stray cleanup can never throw into the call path.
    if (Math.random() < 0.01) {
      Promise.resolve(query(`delete from rate_limits where reset_at < now()`)).catch(() => {});
    }
  } catch (err) {
    logger.error("rate_limit_db_error", { err: String(err), key: redactKey(key) });
  }
}

/** Clear the window for `key` after a successful auth, so a legitimate login can
 *  never be locked out by prior failures (the core of the M1 lockout fix). Clear
 *  ONLY the email key on success — never the IP key, or one valid credential would
 *  reset an in-progress password-spray counter. Best-effort. */
export async function clearAttempts(key: string): Promise<void> {
  try {
    await query(CLEAR_SQL, [key]);
  } catch (err) {
    logger.error("rate_limit_db_error", { err: String(err), key: redactKey(key) });
  }
}

/** Check-and-record throttle for endpoints where EVERY attempt should count
 *  (signup, verification resend) — there's no third party whose success the
 *  counter could be weaponized against, so the lockout concern that drives the
 *  login flow's failures-only design doesn't apply. Returns true if allowed (and
 *  records the attempt); false if the window is already full (records nothing). */
export async function throttle(key: string, limit: number): Promise<boolean> {
  if (await isRateLimited(key, limit)) return false;
  await recordAttempt(key);
  return true;
}

let warnedUnknownIp = false;
/** Surface (once) a production misconfig where X-Forwarded-For isn't forwarded, so
 *  per-IP rate limiting is silently disabled (callers skip the per-IP check on
 *  an "unknown" IP). Lets an operator catch a broken reverse-proxy config. */
export function warnIfUnknownIp(ip: string): void {
  if (ip === "unknown" && !warnedUnknownIp && process.env.NODE_ENV === "production") {
    warnedUnknownIp = true;
    logger.warn("rate_limit_unknown_ip", {
      hint: "X-Forwarded-For absent — per-IP rate limiting is disabled; check the reverse-proxy config",
    });
  }
}
