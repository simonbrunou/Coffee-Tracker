// Fixed-window in-memory limiter. PER-INSTANCE ONLY — swap to Postgres/KV when
// running multiple instances. 10 attempts per key per 15-minute window.
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 10;

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns true if the action is allowed (and records it); false if rate-limited. */
export function checkRateLimit(key: string, clock: () => number = Date.now): boolean {
  const now = clock();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= LIMIT) return false;
  b.count += 1;
  return true;
}

/** Test-only reset. */
export function __resetRateLimit(): void {
  buckets.clear();
}
