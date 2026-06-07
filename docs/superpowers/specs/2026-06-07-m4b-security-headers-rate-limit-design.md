# M4·B — Security Headers + Shared Rate Limiter — Design

**Status:** Approved (design) — pending spec review
**Date:** 2026-06-07
**Milestone:** M4 (auth hardening & compliance), sub-project B.
**Branch (to create):** `feat/m4b-security-hardening`

## Goal

Two independent production-hardening cuts: (A) add HTTP **security headers** including a **nonce-based strict Content-Security-Policy** to every response, and (B) replace the **in-memory, per-instance rate limiter** with a **Postgres-backed** one that works across horizontally-scaled instances — and fix a pre-existing IP-trust bug while we're in there.

## Background — current state (verified)

- **No security headers.** `next.config.ts` has no `headers()`; there is **no `middleware.ts`**. Verified against `next@15.5.19` source: Next reads the nonce from the *request* `Content-Security-Policy` header and auto-tags its own bootstrap/flight/chunk-loader scripts; `next-themes@0.4.6` applies a `nonce` prop to its pre-paint inline `<script>`.
- **Root layout is `force-dynamic`** (`app/layout.tsx:11`) → per-request nonces are viable with no rendering penalty. The app uses inline `style={{}}` attributes pervasively (~365 across 15 files) → `style-src` must allow `'unsafe-inline'` (nonces/hashes can't cover style *attributes*).
- **`next-themes`** injects a pre-paint inline `<script>` (`ThemeProvider attribute="class"`); under `strict-dynamic` it needs the nonce or it's blocked → theme flash + console errors.
- **Rate limiter** (`lib/rate-limit.ts`): synchronous in-memory `Map`, fixed-window 10/15 min, `__resetRateLimit()` + injectable `clock` for tests. Called at `auth.ts:49-50` (login: `login:email:` + `login:ip:`) and `app/auth-actions.ts:18-19` (signup: `signup:email:` + `signup:ip:`). **IP is derived from `x-forwarded-for.split(",")[0]`** — the *left-most, client-claimed* hop.
- **Deployment** (`docs/DEPLOY.md`): Coolify (self-hosted PaaS) → Traefik reverse proxy → `next start` on :3000, horizontal scaling possible. Single trusted proxy in front of the app.

## Decisions (locked by product owner)

1. **Nonce-based strict CSP**, **enforced** immediately (not Report-Only), **with a violation-reporting endpoint** so breaks are visible, gated by a thorough live browser verification before merge.
2. **Postgres-backed fixed-window** rate limiter, **fail-open** on store error.
3. **Fix the XFF hop** (trust the right-most/Traefik-appended IP) **and soften the per-email key** (higher threshold than per-IP) so a known email can't be cheaply weaponized into an account lockout.

## Architecture

### Cut A — Security headers + nonce CSP

**`middleware.ts`** (new) runs on every non-asset request:
- Generate a per-request nonce: `Buffer.from(crypto.randomUUID()).toString("base64")` (Edge-runtime safe; must match Next's `^'nonce-([A-Za-z0-9+/_-]+={0,2})'$` token shape).
- Build the CSP string and set it on **both** the forwarded **request** headers (`NextResponse.next({ request: { headers } })` — this is what makes Next nonce its own scripts) **and** the **response** headers, plus `x-nonce` on the request for the layout to read.
- CSP directives:
  - `default-src 'self'`
  - `script-src 'self' 'nonce-<X>' 'strict-dynamic'` — **plus `'unsafe-eval'` only when `NODE_ENV==='development'`** (React Refresh).
  - `style-src 'self' 'unsafe-inline'` — **nonce-free** (a style nonce would cancel `'unsafe-inline'` and break inline style attributes).
  - `img-src 'self' data:` · `font-src 'self'` · `connect-src 'self'`
  - `base-uri 'self'` · `form-action 'self'` · `object-src 'none'` · `frame-ancestors 'none'`
  - `report-uri <origin>/api/csp-report` + `report-to csp-endpoint`, with an **absolute** `Reporting-Endpoints` response header (relative report URLs are ignored by browsers, silently killing `report-to`). The middleware derives `<origin>` from the request host + proto.
  - `upgrade-insecure-requests` only when serving HTTPS (gate on `x-forwarded-proto`).
- Static headers (all responses): `Strict-Transport-Security: max-age=15552000; includeSubDomains` (**no `preload`** initially; set only when `x-forwarded-proto === 'https'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`.
- **Matcher** excludes static assets: `['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)']`. `/api/*` stays in scope (gets the static headers; the nonce is harmless there).

**`app/layout.tsx`** — read the nonce and pass it to the theme provider:
```ts
const nonce = (await headers()).get("x-nonce") ?? undefined;
// ...
<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange nonce={nonce}>
```
`components/theme-provider.tsx` already spreads `...props`, so `nonce` passes through unchanged. `global-error.tsx` renders its own `<html>` but Next still nonces its scripts from the request header; its inline styles are covered by `style-src 'unsafe-inline'`.

**`app/api/csp-report/route.ts`** (new) — a POST handler that reads the violation report body and logs it via `lib/logger` (`logger.warn("csp_violation", …)`), returning `204`. Bounded body read (ignore/῾truncate oversized). This makes enforced-mode breaks visible.

### Cut B — Postgres-backed rate limiter

**Migration 0003** — a Drizzle `pgTable`:
```ts
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
}, (t) => [ index("rate_limits_reset_at_idx").on(t.resetAt) ]);
```
`drizzle-kit generate` → `0003_rate_limits.sql` (single `CREATE TABLE` + index). Commit `.sql` + meta snapshot together (drift check).

**`lib/rate-limit.ts`** (rewrite) — `checkRateLimit(key: string, limit = RL_DEFAULT_LIMIT): Promise<boolean>`:
- One atomic statement (window-reset-or-increment in a single `ON CONFLICT`), `RETURNING count`; `allowed = count <= limit`:
```sql
INSERT INTO rate_limits (key, count, reset_at)
VALUES ($1, 1, now() + $2::interval)
ON CONFLICT (key) DO UPDATE
  SET count    = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= now() THEN now() + $2::interval ELSE rate_limits.reset_at END
RETURNING count
```
  Called with `[key, '15 minutes']`. PK row-lock makes this race-safe across instances; `now()` is statement-stable so the reset is atomic.
- **Fail-open:** wrap in try/catch → `logger.error("rate_limit_db_error", {err, key})` → return `true`.
- **Bound the query:** wrap the upsert in a 1s `Promise.race` timeout (`connectionTimeoutMillis` only bounds connection *acquisition*, not execution) so a hung query rejects → fail-open, keeping the auth path responsive.
- **Cleanup (bound table growth from the user-controlled key space):** opportunistic prune — a low-probability (`~1%`) `DELETE FROM rate_limits WHERE reset_at < now()` on the write path, so stale rows from email/IP enumeration don't accumulate without a cron.
- Remove `__resetRateLimit` and the `clock` seam (time now comes from Postgres).

**Limits (soften per-email):**
```ts
export const RL_IP_LIMIT = 10;     // primary control — trusted IP, 10/15min
export const RL_EMAIL_LIMIT = 20;  // higher: a known email can't be cheaply locked out
export const RL_DEFAULT_LIMIT = RL_IP_LIMIT;
```
With the XFF fix, the per-IP limit is trustworthy and is the chokepoint; the per-email limit at `20` still catches sustained single-account attacks but requires an attacker to spread across ≥2 distinct *real* IPs (each capped at 10) to lock one email — removing the cheap forge-one-header lockout.

**`lib/request-ip.ts`** (new, small + unit-testable) — `clientIp(xff, trustedHops = 1): string`:
- Returns the `trustedHops`-th-from-right `x-forwarded-for` entry (the hop Traefik appends = the real client IP under a single trusted proxy), or `"unknown"` when XFF is absent/too short. `TRUSTED_PROXY_HOPS` (env, default 1) lets a future CDN/extra-proxy topology bump the trusted hop in one place. **Call sites skip the per-IP check when the IP is `"unknown"`** — never block on a shared bucket (an XFF misconfig must not lock everyone out).

**Call sites** (both already `async`):
- `auth.ts:48-50`: `const ip = clientIp(request?.headers?.get("x-forwarded-for") ?? null);` then `if (!(await checkRateLimit(\`login:email:${email}\`, RL_EMAIL_LIMIT))) return null;` and `if (!(await checkRateLimit(\`login:ip:${ip}\`, RL_IP_LIMIT))) return null;`
- `app/auth-actions.ts:17-19`: same shape with `signup:email:`/`signup:ip:` and the `{error}` return.

## Data flow

- **Every request:** middleware → nonce + CSP (request+response) + static headers → RSC render reads `x-nonce` → theme script + Next scripts carry the nonce → browser enforces CSP; violations POST to `/api/csp-report` → logged.
- **Login/signup attempt:** derive trusted IP → `await checkRateLimit(email-key, 20)` then `(ip-key, 10)` → atomic Postgres upsert → allowed/blocked; store error → logged + fail-open (allowed).

## Error handling
- Limiter: DB error/timeout → log + fail-open. The auth attempt then proceeds but still needs the DB to succeed, so no usable brute-force window opens.
- CSP: enforced; breaks surface in the console (live verification) and via `/api/csp-report` in production. HSTS only emitted over HTTPS so local HTTP dev is unaffected.

## Testing
**Unit:**
- `clientIp`: right-most hop chosen; forged left-most XFF does **not** change the result; empty/missing → `"unknown"`.
- `checkRateLimit` (mock `@/lib/db`): SQL shape (`/insert into rate_limits/i`, `on conflict`, `returning count`); allowed when `count <= limit`, blocked when `count > limit`, at both `RL_IP_LIMIT` and `RL_EMAIL_LIMIT` boundaries; **fail-open** when `query` throws (returns `true` + `logger.error` called).
- middleware/CSP: the built CSP string contains `script-src … 'strict-dynamic'`, a base64 nonce token, `style-src 'unsafe-inline'` (no nonce), `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`, `frame-ancestors 'none'`; static headers present; HSTS only when `x-forwarded-proto=https`.

**Integration (real Postgres, `test/integration/`):**
- Apply migrations 0000–0003 (extend the `allMigrations()` helper). 10 allowed then 11th blocked at limit 10; window reset by `UPDATE rate_limits SET reset_at = now() - interval '1s'`; two concurrent callers (two pool connections, `Promise.all`) never exceed the limit (final count == limit, all-but-overflow allowed); independent keys isolated.

**Live browser pass (controller-driven):**
- Network: document response carries the CSP with a per-request nonce (different on reload); `curl -I` shows HSTS/X-Frame-Options/nosniff/Referrer-Policy/Permissions-Policy.
- Console: **zero** CSP violations; theme script runs (no FOUC); theme toggle produces no style violation; a Server Action (like / log brew) succeeds (confirms `connect-src`/`form-action`).
- Rate limiter: drive login failures to the IP limit → blocked; confirm a forged `X-Forwarded-For` left-most value does not change which key is hit.

## Out of scope (M4·B)
- Sliding-window / token-bucket algorithm (fixed-window is sufficient — YAGNI).
- A dedicated limiter connection pool (statement_timeout + fail-open is enough at this scale).
- CAPTCHA / progressive backoff.
- HSTS `preload` (deferred until all subdomains are HTTPS-confirmed).
- `report-to` analytics beyond logging the violation.
- Email verification / account linking / legal pages — those are M4·C / M4·D.

## Risks
- **Nonce mis-wiring** is the top risk: if the CSP isn't set on the *request* header or the nonce isn't base64, Next's scripts get blocked under `strict-dynamic` → blank page. Mitigated by following the verified pattern + the live console check (the canary: blank page = request-header/nonce bug; theme flash only = ThemeProvider nonce missing).
- **`global-error.tsx`** is an easy blind spot — verify it renders (styled, scripts run) during the live pass, not just happy-path routes.
- **Trusted-proxy assumption:** the XFF fix assumes one proxy (Coolify/Traefik). `TRUSTED_PROXY_HOPS` (env, default 1) makes adding a CDN a one-line config change rather than a silent regression; and `clientIp` returning `"unknown"` makes callers **skip** the per-IP check rather than share one bucket (fail-safe, not a global lockout).
- **Cookie posture (adjacent):** confirm during live verification that the Auth.js session cookie is `Secure; HttpOnly; SameSite=Lax` behind HTTPS (depends on Traefik forwarding `X-Forwarded-Proto: https`). Not changed by this work, but the headers pass is a good moment to verify.
