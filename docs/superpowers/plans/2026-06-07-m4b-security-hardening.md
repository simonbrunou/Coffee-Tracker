# M4·B — Security Headers + Shared Rate Limiter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add nonce-based strict CSP + security headers to every response, and replace the in-memory per-instance rate limiter with a Postgres-backed one (fixing the X-Forwarded-For trust bug and softening the per-email key).

**Architecture:** Cut B (rate limiter) lands first — it's self-contained backend with no rendering risk. Cut A (headers/CSP) lands last so the higher-risk CSP work happens against a stable base and gets a focused live browser pass. Pure logic (IP parsing, CSP/header strings) lives in small testable modules; `middleware.ts` is a thin wrapper.

**Tech Stack:** Next.js 15 App Router (middleware, `headers()`, `force-dynamic`), React 19, Postgres (raw `pg`), Drizzle migrations, next-themes, Vitest (unit + integration).

**Spec:** `docs/superpowers/specs/2026-06-07-m4b-security-headers-rate-limit-design.md`
**Branch:** `feat/m4b-security-hardening` (created; spec committed at `3db9c81`).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `lib/request-ip.ts` | Derive the trusted client IP from XFF | Create |
| `lib/db/schema.ts` | Drizzle schema | Modify: add `rateLimits` table |
| `drizzle/0003_rate_limits.sql` + meta | Generated migration | Create (drizzle-kit) |
| `lib/rate-limit.ts` | Postgres fixed-window limiter | Rewrite (sync→async) |
| `auth.ts` / `app/auth-actions.ts` | Rate-limit call sites | Modify: `clientIp` + `await` + per-key limits |
| `test/integration/_db.ts` | Integration helpers | Modify: add `allMigrationsSql()` |
| `test/integration/account-deletion.test.ts` | Existing cascade test | Modify: use shared `allMigrationsSql()` |
| `lib/security-headers.ts` | Pure CSP + header builders | Create |
| `middleware.ts` | Per-request nonce + headers | Create |
| `app/layout.tsx` | Pass nonce to ThemeProvider | Modify |
| `app/api/csp-report/route.ts` | Log CSP violations | Create |
| Tests | `test/request-ip.test.ts`, `test/rate-limit.test.ts` (rewrite), `test/integration/rate-limit.test.ts`, `test/security-headers.test.ts`, `test/middleware.test.ts`, `test/csp-report.test.ts` | Create/rewrite |

---

## CUT B — Postgres rate limiter

### Task 1: `clientIp` — trust the right-most XFF hop

**Files:** Create `lib/request-ip.ts`; Test `test/request-ip.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/request-ip.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clientIp } from "@/lib/request-ip";

describe("clientIp", () => {
  it("returns the right-most (trusted proxy-appended) hop", () => {
    expect(clientIp("1.1.1.1, 2.2.2.2, 3.3.3.3")).toBe("3.3.3.3");
  });
  it("ignores a forged left-most client value", () => {
    // attacker sent 9.9.9.9; Traefik appended the real client IP on the right
    expect(clientIp("9.9.9.9, 10.0.0.5")).toBe("10.0.0.5");
  });
  it("handles a single hop", () => {
    expect(clientIp("10.0.0.5")).toBe("10.0.0.5");
  });
  it("with 2 trusted hops (e.g. CDN + Traefik), takes the 2nd-from-right", () => {
    expect(clientIp("9.9.9.9, 10.0.0.5, 172.16.0.1", 2)).toBe("10.0.0.5");
  });
  it("returns 'unknown' when there are fewer hops than trusted proxies", () => {
    expect(clientIp("10.0.0.5", 2)).toBe("unknown");
  });
  it("returns 'unknown' for null/empty/garbage", () => {
    expect(clientIp(null)).toBe("unknown");
    expect(clientIp("")).toBe("unknown");
    expect(clientIp("  ,  ")).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/request-ip.test.ts`
Expected: FAIL — cannot resolve `@/lib/request-ip`.

- [ ] **Step 3: Implement**

Create `lib/request-ip.ts`:

```ts
const DEFAULT_TRUSTED_HOPS = 1;

/** Client IP from X-Forwarded-For. The reverse proxy appends the real client IP
 *  as the right-most hop, so the left-most entries are attacker-controlled. With
 *  `trustedHops` proxies in front (1 = just Traefik/Coolify; set 2 if a CDN like
 *  Cloudflare is added), the real client IP is the `trustedHops`-th from the right.
 *  Returns "unknown" when XFF is absent or shorter than trustedHops — callers MUST
 *  NOT treat "unknown" as a shared rate-limit bucket (skip the per-IP check). */
export function clientIp(xff: string | null, trustedHops: number = DEFAULT_TRUSTED_HOPS): string {
  if (!xff) return "unknown";
  const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
  const idx = parts.length - trustedHops;
  return idx >= 0 && parts[idx] ? parts[idx] : "unknown";
}

/** Trusted reverse-proxy hop count (1 = Traefik/Coolify only). Override via the
 *  TRUSTED_PROXY_HOPS env var if a CDN/extra proxy is ever added in front. */
export const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1;
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run --project unit test/request-ip.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/request-ip.ts test/request-ip.test.ts
git commit -m "$(cat <<'EOF'
feat(security): clientIp trusts the right-most XFF hop (m4b)

Single-trusted-proxy (Coolify/Traefik) IP derivation: the proxy appends
the real client IP on the right, so the left-most (client-claimed) hop is
attacker-controlled. Fixes the per-IP rate-limit bypass + IP-forgery lockout.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migration 0003 — `rate_limits` table

**Files:** Modify `lib/db/schema.ts`; Create `drizzle/0003_rate_limits.sql` + meta (generated)

- [ ] **Step 1: Add the table to the Drizzle schema**

At the end of `lib/db/schema.ts` (the `text`, `integer`, `timestamp`, `index` imports already exist), add:

```ts
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_reset_at_idx").on(t.resetAt)],
);
```

- [ ] **Step 2: Generate the migration**

Run:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coffee_tracker" npx drizzle-kit generate --name rate_limits
```

Expected: creates `drizzle/0003_rate_limits.sql` + `drizzle/meta/0003_snapshot.json` + updates `_journal.json`.

- [ ] **Step 3: Verify the generated SQL**

Read `drizzle/0003_rate_limits.sql`. It MUST contain a single `CREATE TABLE "rate_limits"` (columns `key` PK, `count`, `reset_at`) and a `CREATE INDEX "rate_limits_reset_at_idx"`, and **no other table changes**. If it touches any other table, STOP and investigate.

- [ ] **Step 4: Apply + drift check**

```bash
npm run db:setup
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coffee_tracker" npx drizzle-kit generate
```

Expected: setup applies `0003_rate_limits` with no errors; the second generate prints `No schema changes, nothing to migrate`.

> Fallback: `db:setup` runs drizzle's `migrate()`, which expects the dev DB's `__drizzle_migrations` journal to match the committed migrations. If it errors with an "already exists" or hash-mismatch (e.g. the local DB drifted from earlier integration runs), run `npm run db:reset` (drops public+drizzle schemas, re-applies 0000–0003, re-seeds), then re-run the drift check. This is a local-env recovery, not a logic error in 0003.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "$(cat <<'EOF'
feat(db): rate_limits table for the shared rate limiter (m4b)

Migration 0003: rate_limits(key pk, count, reset_at) + reset_at index for
cleanup. Backs the Postgres fixed-window limiter. Drift check clean.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Rewrite `lib/rate-limit.ts` (Postgres, async, fail-open)

**Files:** Rewrite `lib/rate-limit.ts`; Rewrite `test/rate-limit.test.ts`

- [ ] **Step 1: Rewrite the unit test**

Replace the entire contents of `test/rate-limit.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const errorMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { error: (...a: unknown[]) => errorMock(...a), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { checkRateLimit, RL_IP_LIMIT, RL_EMAIL_LIMIT, RATE_LIMIT_SQL } from "@/lib/rate-limit";

beforeEach(() => {
  // mockResolvedValue (persistent) so a stray opportunistic-cleanup call also gets a
  // thenable — never undefined — keeping the suite deterministic regardless of the 1% gate.
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ count: 1 }] });
  errorMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("checkRateLimit (Postgres-backed)", () => {
  it("returns a Promise (the async contract the call sites await)", () => {
    expect(checkRateLimit("k")).toBeInstanceOf(Promise);
  });
  it("runs the atomic upsert and allows when count <= limit", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: 3 }] });
    const ok = await checkRateLimit("login:ip:1.2.3.4");
    expect(ok).toBe(true);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe(RATE_LIMIT_SQL); // shape-only: pins that the impl uses the shared SQL const
    expect(sql).toMatch(/insert into rate_limits/i);
    expect(sql).toMatch(/on conflict \(key\) do update/i);
    expect(sql).toMatch(/returning count/i);
    expect(params).toEqual(["login:ip:1.2.3.4", "15 minutes"]);
  });
  it("blocks when the returned count exceeds the limit", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT + 1 }] });
    expect(await checkRateLimit("login:ip:x")).toBe(false);
  });
  it("allows exactly at the limit boundary", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT }] });
    expect(await checkRateLimit("login:ip:x")).toBe(true);
  });
  it("honors a higher per-email limit (softened lockout)", async () => {
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT + 5 }] }); // 15
    expect(await checkRateLimit("login:email:a@b.com", RL_EMAIL_LIMIT)).toBe(true); // 15 <= 20
  });
  it("fires the opportunistic cleanup without affecting the decision", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // force the cleanup branch
    queryMock.mockResolvedValue({ rows: [{ count: RL_IP_LIMIT + 1 }] });
    expect(await checkRateLimit("login:ip:x")).toBe(false); // decision unaffected
    expect(queryMock.mock.calls.some(([sql]) => /delete from rate_limits/i.test(sql as string))).toBe(true);
  });
  it("fails OPEN and logs when the store errors", async () => {
    queryMock.mockReset();
    queryMock.mockRejectedValueOnce(new Error("db down"));
    expect(await checkRateLimit("login:ip:x")).toBe(true);
    expect(errorMock).toHaveBeenCalled();
  });
  it("fails OPEN if the query exceeds the timeout", async () => {
    vi.useFakeTimers();
    queryMock.mockReset();
    queryMock.mockReturnValueOnce(new Promise(() => {})); // never settles
    const p = checkRateLimit("login:ip:x");
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toBe(true);
    expect(errorMock).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/rate-limit.test.ts`
Expected: FAIL — the old in-memory impl never calls `query` (so `queryMock.mock.calls[0]` is undefined) and the new exports (`RATE_LIMIT_SQL`, `RL_IP_LIMIT`) resolve to `undefined`. (Against the old sync impl `await checkRateLimit(...)` still returns true, so the allow-path fails on the missing `query` call, not on the boolean.)

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `lib/rate-limit.ts`:

```ts
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
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run --project unit test/rate-limit.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/rate-limit.ts test/rate-limit.test.ts
git commit -m "$(cat <<'EOF'
feat(security): Postgres-backed fixed-window rate limiter (m4b)

Replaces the in-memory per-instance Map with an atomic ON CONFLICT upsert
that works across instances. Async; fail-open on store error (logged);
per-key limits (RL_IP_LIMIT=10, RL_EMAIL_LIMIT=20); opportunistic cleanup.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Migrate the call sites (login + signup)

**Files:** Modify `auth.ts`; Modify `app/auth-actions.ts`

- [ ] **Step 1: Update `auth.ts` imports**

In `auth.ts`, change the rate-limit import line (currently `import { checkRateLimit } from "@/lib/rate-limit";`) to:

```ts
import { checkRateLimit, RL_IP_LIMIT, RL_EMAIL_LIMIT } from "@/lib/rate-limit";
import { clientIp, TRUSTED_PROXY_HOPS } from "@/lib/request-ip";
```

- [ ] **Step 2: Update the login authorize block**

In `auth.ts`, replace the IP derivation + the two checks (currently lines ~48-50):

```ts
        const ip = (request?.headers?.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
        if (!checkRateLimit(`login:email:${email.toLowerCase()}`)) return null;
        if (!checkRateLimit(`login:ip:${ip}`)) return null;
```

with:

```ts
        const ip = clientIp(request?.headers?.get("x-forwarded-for") ?? null, TRUSTED_PROXY_HOPS);
        if (!(await checkRateLimit(`login:email:${email.toLowerCase()}`, RL_EMAIL_LIMIT))) return null;
        // Skip the per-IP check when the IP is unknown — never block on a shared
        // "unknown" bucket (an XFF misconfig would otherwise lock out everyone).
        if (ip !== "unknown" && !(await checkRateLimit(`login:ip:${ip}`, RL_IP_LIMIT))) return null;
```

- [ ] **Step 3: Update `app/auth-actions.ts` imports**

Change `import { checkRateLimit } from "@/lib/rate-limit";` to:

```ts
import { checkRateLimit, RL_IP_LIMIT, RL_EMAIL_LIMIT } from "@/lib/rate-limit";
import { clientIp, TRUSTED_PROXY_HOPS } from "@/lib/request-ip";
```

- [ ] **Step 4: Update the signup block**

In `app/auth-actions.ts`, replace (currently lines ~17-19):

```ts
  const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!checkRateLimit(`signup:email:${input.email.toLowerCase()}`)) return { error: "Too many attempts, try again later." };
  if (!checkRateLimit(`signup:ip:${ip}`)) return { error: "Too many attempts, try again later." };
```

with:

```ts
  const ip = clientIp(hdrs.get("x-forwarded-for"), TRUSTED_PROXY_HOPS);
  if (!(await checkRateLimit(`signup:email:${input.email.toLowerCase()}`, RL_EMAIL_LIMIT))) return { error: "Too many attempts, try again later." };
  // Skip the per-IP check when the IP is unknown (see auth.ts rationale).
  if (ip !== "unknown" && !(await checkRateLimit(`signup:ip:${ip}`, RL_IP_LIMIT))) return { error: "Too many attempts, try again later." };
```

- [ ] **Step 5: Typecheck + full unit suite**

Run: `npm run typecheck && npm run test`
Expected: tsc clean; all unit tests pass (only `test/rate-limit.test.ts` referenced the limiter; no other test mocks it).

- [ ] **Step 6: Commit**

```bash
git add auth.ts app/auth-actions.ts
git commit -m "$(cat <<'EOF'
feat(security): wire login/signup to the async limiter + trusted IP (m4b)

Both call sites now derive the IP via clientIp (right-most hop), await the
Postgres limiter, and pass per-key limits (email=20, ip=10).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Integration tests + shared migrations helper

**Files:** Modify `test/integration/_db.ts`; Modify `test/integration/account-deletion.test.ts`; Create `test/integration/rate-limit.test.ts`

- [ ] **Step 1: Add a shared `allMigrationsSql()` to `_db.ts`**

In `test/integration/_db.ts`, add the imports `readFileSync, readdirSync` from `node:fs` and `join` from `node:path` (if not present) and append:

```ts
/** Concatenate every drizzle/*.sql migration in order — one raw SQL batch for a
 *  scratch DB. Auto-includes new migrations (no hardcoded list to maintain). */
export function allMigrationsSql(): string {
  const dir = join(process.cwd(), "drizzle");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}
```

- [ ] **Step 2: Point `account-deletion.test.ts` at the shared helper**

In `test/integration/account-deletion.test.ts`, delete its local `allMigrations()` function and the now-unused `readFileSync`/`join` imports, import `allMigrationsSql` from `./_db`, and change the `client()` helper to call `freshDbWithSql(DB, allMigrationsSql())`.

- [ ] **Step 3: Run the existing integration suite (no regression)**

Run: `npm run test:integration`
Expected: PASS — account-deletion + constraints + scoped-queries + pagination + smoke still green (now applying 0000–0003).

- [ ] **Step 4: Write the rate-limit integration test**

Create `test/integration/rate-limit.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import { freshDbWithSql, dropDb, allMigrationsSql, urlForDb } from "./_db";
import { RATE_LIMIT_SQL } from "@/lib/rate-limit";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("rate_limits (Postgres fixed-window)", () => {
  const DB = "cortado_rate_limit";
  afterAll(() => dropDb(DB));

  // Run the REAL limiter SQL against a given client; returns allowed (count<=limit).
  async function hit(c: { query: (t: string, p?: unknown[]) => Promise<{ rows: { count: number }[] }> }, key: string, limit = 10) {
    const { rows } = await c.query(RATE_LIMIT_SQL, [key, "15 minutes"]);
    return rows[0].count <= limit;
  }

  it("allows up to the limit then blocks; resets after the window", async () => {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    try {
      for (let i = 0; i < 10; i++) expect(await hit(c, "k:reset")).toBe(true);
      expect(await hit(c, "k:reset")).toBe(false); // 11th
      // expire the window and confirm a fresh one opens
      await c.query(`update rate_limits set reset_at = now() - interval '1 second' where key = 'k:reset'`);
      expect(await hit(c, "k:reset")).toBe(true);
    } finally { await c.end(); }
  });

  it("tracks keys independently", async () => {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    try {
      for (let i = 0; i < 10; i++) await hit(c, "k:a");
      expect(await hit(c, "k:a")).toBe(false);
      expect(await hit(c, "k:b")).toBe(true);
    } finally { await c.end(); }
  });

  it("is atomic under concurrency — no lost updates across connections", async () => {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    const pool = new Pool({ connectionString: urlForDb(DB), max: 6 });
    try {
      // 12 concurrent hits on one key (limit 10) from a multi-connection pool.
      const results = await Promise.all(
        Array.from({ length: 12 }, () => hit(pool, "k:concurrent", 10)),
      );
      // Exactly 10 should have been allowed (count 1..10); 2 blocked (11,12).
      expect(results.filter(Boolean).length).toBe(10);
      const { rows } = await pool.query(`select count from rate_limits where key='k:concurrent'`);
      expect(rows[0].count).toBe(12); // every increment landed → no lost updates
    } finally { await pool.end(); await c.end(); }
  });
});
```

- [ ] **Step 5: Run it — confirm it ran (not skipped)**

Run: `npm run test:integration -- test/integration/rate-limit.test.ts`
Expected: output shows **3 passed** (NOT skipped). If it shows skipped, `DATABASE_URL` isn't set — fix before treating as green.

- [ ] **Step 6: Commit**

```bash
git add test/integration/_db.ts test/integration/account-deletion.test.ts test/integration/rate-limit.test.ts
git commit -m "$(cat <<'EOF'
test(integration): rate_limits limiter (atomic, reset, concurrency) (m4b)

Real-DB proof of the shared limiter SQL: limit-then-block, window reset,
and no lost updates under concurrent multi-connection hits. Shared
allMigrationsSql() helper (auto-includes new migrations).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## CUT A — Security headers + nonce CSP

### Task 6: `lib/security-headers.ts` — pure builders

**Files:** Create `lib/security-headers.ts`; Test `test/security-headers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/security-headers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateNonce, buildCsp, staticSecurityHeaders } from "@/lib/security-headers";

describe("generateNonce", () => {
  it("is a base64 token matching Next's nonce regex, unique per call", () => {
    const n = generateNonce();
    expect(n).toMatch(/^[A-Za-z0-9+/_-]+={0,2}$/);
    expect(generateNonce()).not.toBe(n);
  });
});

const O = "https://x.test"; // absolute origin the middleware supplies

describe("buildCsp", () => {
  const csp = buildCsp("NONCE", { isDev: false, isHttps: true, origin: O });
  it("uses nonce + strict-dynamic for scripts and NO unsafe-inline in script-src", () => {
    expect(csp).toMatch(/script-src 'self' 'nonce-NONCE' 'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
  it("allows inline styles via unsafe-inline with NO style nonce", () => {
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'/);
    expect(csp).not.toMatch(/style-src[^;]*nonce/);
  });
  it("includes the bypass-closing directives", () => {
    for (const d of ["default-src 'self'", "base-uri 'self'", "form-action 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
      expect(csp).toContain(d);
    }
  });
  it("points reporting at an ABSOLUTE /api/csp-report URL", () => {
    expect(csp).toContain(`report-uri ${O}/api/csp-report`);
    expect(csp).toMatch(/report-to csp-endpoint/);
  });
  it("adds unsafe-eval only in dev", () => {
    expect(buildCsp("N", { isDev: true, isHttps: true, origin: O })).toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(buildCsp("N", { isDev: false, isHttps: true, origin: O })).not.toMatch(/'unsafe-eval'/);
  });
  it("adds upgrade-insecure-requests only over https", () => {
    expect(buildCsp("N", { isDev: false, isHttps: true, origin: O })).toMatch(/upgrade-insecure-requests/);
    expect(buildCsp("N", { isDev: false, isHttps: false, origin: O })).not.toMatch(/upgrade-insecure-requests/);
  });
});

describe("staticSecurityHeaders", () => {
  it("includes the standard headers (absolute Reporting-Endpoints); HSTS only over https", () => {
    const https = new Map(staticSecurityHeaders({ isDev: false, isHttps: true, origin: O }));
    expect(https.get("X-Frame-Options")).toBe("DENY");
    expect(https.get("X-Content-Type-Options")).toBe("nosniff");
    expect(https.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(https.get("Permissions-Policy")).toMatch(/camera=\(\)/);
    expect(https.get("Reporting-Endpoints")).toBe(`csp-endpoint="${O}/api/csp-report"`);
    expect(https.get("Strict-Transport-Security")).toMatch(/max-age=/);
    expect(new Map(staticSecurityHeaders({ isDev: false, isHttps: false, origin: O })).has("Strict-Transport-Security")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/security-headers.test.ts`
Expected: FAIL — cannot resolve `@/lib/security-headers`.

- [ ] **Step 3: Implement**

Create `lib/security-headers.ts`:

```ts
export interface HeaderOpts {
  isDev: boolean;
  isHttps: boolean;
  /** Absolute origin (e.g. "https://cortado.example.com"), from the request, for the
   *  report endpoints. Reporting-Endpoints requires an ABSOLUTE URL or browsers ignore
   *  it (which would silently kill the modern report-to channel). */
  origin: string;
}

/** Per-request nonce. base64 of a UUID — satisfies Next's nonce token regex
 *  (^'nonce-([A-Za-z0-9+/_-]+={0,2})'$) so Next tags its own scripts. */
export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/** Build the CSP string. script-src is nonce + strict-dynamic (no unsafe-inline);
 *  style-src is unsafe-inline (NO nonce — inline style attributes can't carry one,
 *  and a style nonce would cancel unsafe-inline). */
export function buildCsp(nonce: string, opts: HeaderOpts): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (opts.isDev) scriptSrc.push("'unsafe-eval'"); // React Refresh in dev only
  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `report-uri ${opts.origin}/api/csp-report`,
    `report-to csp-endpoint`,
  ];
  if (opts.isHttps) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Static (non-CSP) security headers. HSTS only over HTTPS (never in HTTP dev). */
export function staticSecurityHeaders(opts: HeaderOpts): Array<[string, string]> {
  const headers: Array<[string, string]> = [
    ["X-Frame-Options", "DENY"],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
    ["Reporting-Endpoints", `csp-endpoint="${opts.origin}/api/csp-report"`],
  ];
  if (opts.isHttps) {
    headers.push(["Strict-Transport-Security", "max-age=15552000; includeSubDomains"]);
  }
  return headers;
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run --project unit test/security-headers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/security-headers.ts test/security-headers.test.ts
git commit -m "$(cat <<'EOF'
feat(security): pure CSP + security-header builders (m4b)

generateNonce (base64, matches Next's regex), buildCsp (nonce+strict-dynamic
script-src, unsafe-inline style-src, base-uri/form-action/object-src/
frame-ancestors, reporting), staticSecurityHeaders (HSTS https-only).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `middleware.ts` — wire nonce + headers

**Files:** Create `middleware.ts`; Test `test/middleware.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/middleware.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

describe("middleware security headers", () => {
  it("sets a nonce CSP + static headers on the response (https)", () => {
    const req = new NextRequest(new URL("http://localhost/"), {
      headers: { "x-forwarded-proto": "https", host: "x.test" },
    });
    const res = middleware(req);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/_-]+={0,2}' 'strict-dynamic'/);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age=/);
  });
  it("does not emit HSTS over plain http", () => {
    const req = new NextRequest(new URL("http://localhost/"), { headers: { "x-forwarded-proto": "http" } });
    const res = middleware(req);
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });
});
```

> Note: the adversarial review verified this test runs in the vitest `unit` (node) project — `NextRequest` constructs and `NextResponse.next()` round-trips headers. Do NOT delete it; it is the only automated check that the request+response wiring actually emits the headers. `middleware()` is synchronous (returns a `NextResponse`, not a Promise), so the un-awaited `const res = middleware(req)` is correct.

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/middleware.test.ts`
Expected: FAIL — cannot resolve `@/middleware` (or, per the note above, a NextRequest construction error → drop the file).

- [ ] **Step 3: Implement**

Create `middleware.ts` (repo root):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { generateNonce, buildCsp, staticSecurityHeaders } from "@/lib/security-headers";

// NOTE: this strict nonce CSP requires every route to be DYNAMICALLY rendered (the
// root layout's force-dynamic cascades). If a route ever opts back into static
// rendering (force-static / ISR), Next stops applying per-request nonces and the
// enforced CSP will blank that route — move such a route to a hash-based CSP.
export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === "development";
  // Behind Traefik, x-forwarded-proto reflects the public scheme; default to https
  // in prod (TLS-terminated) and http in dev.
  const isHttps = (request.headers.get("x-forwarded-proto") ?? (isDev ? "http" : "https")) === "https";
  const host = request.headers.get("host") ?? "localhost";
  const origin = `${isHttps ? "https" : "http"}://${host}`;
  const opts = { isDev, isHttps, origin };
  const csp = buildCsp(nonce, opts);

  // Next reads the nonce from the REQUEST Content-Security-Policy header and
  // applies it to its own injected scripts — so set it on the forwarded request.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  for (const [k, v] of staticSecurityHeaders(opts)) response.headers.set(k, v);
  return response;
}

export const config = {
  // Run on pages + API for the headers; skip static assets, metadata files, and
  // router PREFETCHes (a prefetch render gets a different nonce than the real nav,
  // which can blank the page — per the official Next CSP matcher).
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run --project unit test/middleware.test.ts`
Expected: PASS (or file removed per the Step 1 note).

- [ ] **Step 5: Commit**

```bash
git add middleware.ts test/middleware.test.ts
git commit -m "$(cat <<'EOF'
feat(security): middleware sets per-request nonce CSP + headers (m4b)

Generates a base64 nonce, sets the full CSP on BOTH the forwarded request
headers (so Next nonces its own scripts) and the response, plus the static
security headers. Matcher excludes static assets.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Pass the nonce to `ThemeProvider`

**Files:** Modify `app/layout.tsx`

- [ ] **Step 1: Import `headers` and read the nonce**

In `app/layout.tsx`, add to the imports:

```ts
import { headers } from "next/headers";
```

In `RootLayout`, after `const initialData = await getAppData();`, add:

```ts
  const nonce = (await headers()).get("x-nonce") ?? undefined;
```

- [ ] **Step 2: Pass it to ThemeProvider**

Change the `<ThemeProvider ...>` opening tag to include `nonce={nonce}`:

```tsx
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange nonce={nonce}>
```

(`components/theme-provider.tsx` types props as `React.ComponentProps<typeof NextThemesProvider>`, which already includes `nonce` — no change needed there.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors (`nonce` is a valid next-themes prop).

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(security): pass per-request nonce to next-themes (m4b)

Root layout reads x-nonce (set by middleware) and forwards it to
ThemeProvider so the pre-paint theme script is allowed under strict-dynamic.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `/api/csp-report` endpoint

**Files:** Create `app/api/csp-report/route.ts`; Test `test/csp-report.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/csp-report.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const warnMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { warn: (...a: unknown[]) => warnMock(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST } from "@/app/api/csp-report/route";

beforeEach(() => warnMock.mockReset());

describe("POST /api/csp-report", () => {
  it("logs the violation and returns 204", async () => {
    const res = await POST(new Request("http://localhost/api/csp-report", {
      method: "POST",
      body: JSON.stringify({ "csp-report": { "violated-directive": "script-src" } }),
    }));
    expect(res.status).toBe(204);
    expect(warnMock).toHaveBeenCalledWith("csp_violation", expect.objectContaining({ report: expect.any(String) }));
  });
  it("still returns 204 on a malformed body", async () => {
    const bad = { text: async () => { throw new Error("boom"); } } as unknown as Request;
    const res = await POST(bad);
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/csp-report.test.ts`
Expected: FAIL — cannot resolve `@/app/api/csp-report/route`.

- [ ] **Step 3: Implement**

Create `app/api/csp-report/route.ts`:

```ts
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Receives CSP violation reports (report-uri/report-to). Logs a bounded snippet
 *  via the structured logger so enforced-mode breaks are visible in production. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.text();
    logger.warn("csp_violation", { report: body.slice(0, 2000) });
  } catch {
    // Malformed/oversized report — ignore; never fail the report endpoint.
  }
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run --project unit test/csp-report.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/csp-report/route.ts test/csp-report.test.ts
git commit -m "$(cat <<'EOF'
feat(security): /api/csp-report logs CSP violations (m4b)

Makes enforced-mode CSP breaks visible: logs a bounded report snippet via
the structured logger, returns 204. Wired by the CSP report-uri/report-to.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Full verification + finish branch

**Files:** none (verification only)

- [ ] **Step 1: Full local pre-flight**

```bash
npm run typecheck
npm run test
npm run test:integration
npm run lint
npm run build
```

Expected: all green; `npm test` includes the new unit suites; `test:integration` includes `rate-limit` (confirm not skipped).

- [ ] **Step 2: Drift check**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coffee_tracker" npx drizzle-kit generate`
Expected: `No schema changes, nothing to migrate`. `git status` clean.

- [ ] **Step 3: Live browser pass (controller-driven) — CSP**

Start dev (`PORT=<free> npm run dev`), open the app, and verify against the council's checklist:
1. `curl -I http://127.0.0.1:<port>/` shows `Content-Security-Policy` (with a nonce), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. (HSTS appears only with `x-forwarded-proto: https`; dev http won't show it — expected.)
2. Browser console on `/` has **zero** CSP violation errors → confirms Next + next-themes scripts are nonced.
3. View-source: the Next bootstrap `<script nonce="…">` and the next-themes `<script nonce="…">` share the same nonce; a reload shows a **different** nonce.
4. No theme flash on hard reload; toggling dark/light produces no console style violation.
5. A Server Action works (sign in, then like a brew / log a brew) → confirms `connect-src`/`form-action`.
6. **global-error hydration (highest-risk path):** force `global-error` (in a production build, stop Postgres so `getAppData()` throws; dev shows the Next overlay instead) → it must render styled AND the "Try again" button must **work when clicked** (proves its bootstrap scripts hydrated under the nonce, not just painted). View-source: its `<script>` tags carry a nonce.
7. **Reporting works:** trigger a deliberate violation → confirm exactly one `csp_violation` line is logged via `/api/csp-report` (not a storm, not zero — proves the absolute report URL is honored).
8. **OAuth (if configured locally):** a Google/GitHub sign-in round-trip is not blocked by the headers. If OAuth isn't set up in the test env, note it unverified (credentials sign-in is covered by item 5).

- [ ] **Step 4: Live verification — rate limiter + trusted IP**

1. Attempt login with a wrong password 10× for one IP → the 11th is rate-limited (returns the login error, not a password check). Confirm a `rate_limits` row exists: `docker exec coffee-pg psql -U postgres -d coffee_tracker -tAc "select key,count from rate_limits;"`.
2. Confirm a forged left-most `X-Forwarded-For` does not change the IP key (the right-most/real hop is used). (Unit test already pins `clientIp`; spot-check the stored key reflects the connection IP, not a forged header.)

- [ ] **Step 5: Finish the branch**

Announce and use **superpowers:finishing-a-development-branch** → push + open PR against `main`. Then run code review (in-harness security-reviewer + pr-review-toolkit:code-reviewer over `git diff main...HEAD`, since CodeRabbit CLI is broken) and post the summary comment.

---

## Self-Review

**1. Spec coverage:**
- Nonce CSP via middleware (request+response, base64 nonce) → Tasks 6, 7. ✓
- All CSP directives incl. base-uri/form-action/object-src/default-src/frame-ancestors + reporting → Task 6. ✓
- Static headers (HSTS https-only/no-preload, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) → Task 6. ✓
- Nonce → ThemeProvider → Task 8. ✓
- `/api/csp-report` → Task 9. ✓
- Matcher excludes assets, keeps /api → Task 7. ✓
- dev `unsafe-eval`, https-gated HSTS/upgrade → Tasks 6/7. ✓
- Postgres rate_limits table (migration 0003) → Task 2. ✓
- Atomic upsert, fail-open, per-key limits, cleanup → Task 3. ✓
- XFF right-most hop (`clientIp`) → Task 1. ✓
- Soften per-email (RL_EMAIL_LIMIT=20 > RL_IP_LIMIT=10) → Tasks 3, 4. ✓
- Call-site sync→async migration → Task 4. ✓
- Unit + integration + live tests → Tasks 1/3/5/6/7/9/10. ✓

**2. Placeholder scan:** No TBD/TODO; every code step is complete; every run step has a command + expected result. The one conditional (middleware test fallback if NextRequest won't construct) is explicit, not a placeholder.

**3. Type/name consistency:** `clientIp(xff: string|null)` signature identical in Tasks 1/4. `checkRateLimit(key, limit?)` + `RL_IP_LIMIT`/`RL_EMAIL_LIMIT`/`RATE_LIMIT_SQL` consistent across Tasks 3/4/5. `buildCsp(nonce, {isDev,isHttps})` + `staticSecurityHeaders` + `generateNonce` consistent across Tasks 6/7. `allMigrationsSql()` defined in Task 5 Step 1, used in Steps 2/4. Migration `0003_rate_limits` consistent across Tasks 2/5/10.

**Query-timeout approach:** the spec calls for bounding the limiter query so store pressure can't hang the auth path. `connectionTimeoutMillis` only bounds connection *acquisition*, not execution — so the limiter wraps the upsert in `withTimeout` (a 1s `Promise.race`): a hung query rejects → fail-open fires. This bounds the auth-request latency with no extra DB round-trips on the happy path (a server-side `SET LOCAL statement_timeout` would cost ~4× round-trips per check; the race degrades to pool-exhaustion fail-open under sustained pressure, acceptable at this scale).

**Adversarial review fixes folded in (review `wf_333ed3ae`):** `clientIp` skip-on-`"unknown"` at the call sites (no shared-bucket lockout) + configurable `TRUSTED_PROXY_HOPS`; absolute report URLs (a relative `Reporting-Endpoints` is ignored by browsers, which would kill `report-to`); `Promise.resolve`-guarded cleanup + deterministic / forced-cleanup / timeout unit tests; prefetch-excluding matcher; the middleware test is kept (the review verified it runs); a `db:reset` fallback for a dirty local journal; a stronger `global-error` hydration live-check.
