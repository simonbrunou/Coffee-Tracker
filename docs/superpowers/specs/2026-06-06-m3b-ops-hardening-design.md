# M3·B — Ops / Deploy Hardening — Design

**Date:** 2026-06-06
**Status:** Implemented (2026-06-06). 12 commits on `feat/m3-ops-hardening`. Live spike PASSED: DB-down → styled `global-error` boundary (browser-confirmed "Something spilled") while `/api/health` stayed 200; the pool `'error'` handler logged idle-client drops as structured JSON instead of crashing the process; the app recovered on its own when the DB returned; env-validation fail-fast refused to boot naming both missing vars; the Docker image (`node:24-alpine`, `next start`) ran against Postgres with `/api/health` 200 and `/` 200. 94 tests green; tsc + eslint + build clean. Two fixes the live spike surfaced: log-level-spoofing hardening (security review) and `onRequestError` now surfaces `AggregateError` causes. (Node bumped 20→24.)
**Branch:** `feat/m3-ops-hardening` (off `main` @ `df08c94`, the M3·A CI merge)
**Milestone:** M3·B, the second of M3's four sub-projects (A=CI ✅ merged, **B=Ops**, C=Migrations, D=Pagination)
**Scope decision (locked by owner):** Full scope — core hardening **+** structured-logging seam **+** env-driven SSL **+** a committed Dockerfile.

---

## Goal

Make Cortado **not crash on a transient DB hiccup**, **fail loud-and-honest when misconfigured**, and **genuinely deployable to Coolify**. One PR. No migrations, no pagination (those are M3·C / M3·D).

## Context & current state

- Root layout (`app/layout.tsx`) is `export const dynamic = "force-dynamic"` and calls `const initialData = await getAppData()` at line 46 with **no try/catch**. A DB error here throws inside the *root layout* render. **This is the crash surface.**
- There are **no** App Router boundary files: no `error.tsx`, `global-error.tsx`, `not-found.tsx`, `loading.tsx`. A thrown error today is an unstyled Next error / raw 500.
- `lib/db.ts`: `new Pool({ connectionString, max: 5 })` — **no SSL, no timeouts, no `keepAlive`, no pool `'error'` handler** (an idle-client error currently crashes the process). `connectionString` defaults to localhost; overridable via `DATABASE_URL`.
- `getCurrentUserId()` (`lib/auth.ts:7`) resolves from `auth()` → the **JWT cookie**, not the DB. So during a DB blip the user is still authenticated — which is exactly why an empty-`AppData` fallback would be a lie (see Decision 1).
- No `instrumentation.ts`. No `/health`. No Dockerfile/.dockerignore.
- CI (M3·A) enforces `tsc → vitest → eslint → build` on every PR, no DB service, dummy `AUTH_SECRET`. **Whatever we add must keep CI green** — in particular, **nothing may throw at module-eval time during `next build`.**

---

## The four load-bearing decisions (council-pressure-tested)

### Decision 1 — `getAppData` THROWS to a boundary; **no empty-data fallback**

The tempting "fix" is to `try/catch` in `getAppData` and return empty `roasters/users/beans/tastings` so the shell still renders. **We will not do this.** Because `currentUserId` comes from the cookie, an empty-`AppData` fallback renders a *logged-in* user as **signed-out with zero data** — indistinguishable from "the app deleted everything I own." That is the single change most likely to make users believe they lost their data.

Instead: **`getAppData` stays as-is (it throws naturally on DB error)**, and the new error boundaries catch the throw and show an honest, recoverable "something went wrong — retry" screen. Loud beats silent-and-wrong.

### Decision 2 — `DATABASE_URL` localhost-default vs fail-fast: resolved by environment

`lib/db.ts` keeps its `?? localhost` default (dev convenience). In **production**, the startup validator (Decision 3) **requires** `DATABASE_URL` and refuses to boot without it. So the localhost default is only ever *effective* in dev; prod can never silently fall back to localhost. One mechanism, no contradiction — we don't ship two conflicting behaviors.

### Decision 3 — env validation runs at **server start**, never at build

Validation lives in `instrumentation.ts`'s `register()`, which Next 15 runs **once when a server instance starts — not during `next build`**. It is guarded `if (process.env.NEXT_RUNTIME !== "nodejs") return;` and only *enforces* in production. The actual checks live in a **pure `lib/env.ts:validateEnv(env)`** (unit-testable); `register()` just calls it. **No validation at module top-level** anywhere — that would run during `next build` and break CI.

### Decision 4 — SSL is env-driven and **defaults OFF**; never ship `rejectUnauthorized:false` as the default

Coolify-internal Postgres shares the Docker network → **no SSL needed**. So SSL defaults off and is opt-in via a single env var (`DATABASE_SSL`). We pick the **env-var mechanism, not `sslmode` in the URL** (node-postgres footgun: a `sslmode` in the connection string *replaces the entire `ssl` object*, silently undoing programmatic config). `rejectUnauthorized:false` exists only as a documented, explicit escape hatch (`DATABASE_SSL=no-verify`) that **logs a warning when used** — it is never the default.

---

## Components

### 1. App Router boundaries (4 files)

| File | Catches | Notes |
|------|---------|-------|
| `app/global-error.tsx` | **Root-layout** crash — i.e. `getAppData()` throwing in `layout.tsx` | `"use client"`. **Must render its own `<html>` and `<body>`** (it replaces the root layout). Only fires in a **production** build (dev shows the Next overlay). Friendly copy + "Try again" `reset()` button. |
| `app/error.tsx` | Any **page/segment** crash below the root layout (e.g. a detail page's data fetch) | `"use client"`. Friendly copy + `reset()`. Does **not** catch the root-layout throw — that's `global-error`'s job. |
| `app/not-found.tsx` | 404s | Styled "not found" with a link home. |
| `app/loading.tsx` | Suspense fallback during navigation | Minimal skeleton/spinner consistent with the app's look. |

Server-side error **logging** does not happen in these client components — it happens in `onRequestError` (below).

### 2. Structured logging — `lib/logger.ts` (+ `onRequestError` seam)

A **minimal** structured logger (≈30 lines, not a transport framework — honoring the contrarian's YAGNI caution while delivering "structured logging now"):

```ts
// lib/logger.ts
type Level = "debug" | "info" | "warn" | "error";
function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  const line = JSON.stringify({ level, msg, ...ctx, ts: new Date().toISOString() });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}
export const logger = {
  debug: (m: string, c?: Record<string, unknown>) => emit("debug", m, c),
  info:  (m: string, c?: Record<string, unknown>) => emit("info", m, c),
  warn:  (m: string, c?: Record<string, unknown>) => emit("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => emit("error", m, c),
};
```

The **Sentry-ready seam** is `instrumentation.ts`'s `onRequestError(err, request, context)` — Next 15's official hook for server-side errors. It logs via `logger.error(...)`; a one-line comment marks exactly where `Sentry.captureException(err)` slots in later. (`new Date().toISOString()` is fine in app runtime — the `Date.now()` ban is a workflow-script constraint, not a Next.js one.)

### 3. `instrumentation.ts` (root)

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnv } = await import("@/lib/env");
  validateEnv(process.env); // throws with a clear message in prod if misconfigured
}
export async function onRequestError(err: unknown, request: unknown) {
  const { logger } = await import("@/lib/logger");
  logger.error("request_error", {
    err: err instanceof Error ? err.message : String(err),
    // Sentry seam: Sentry.captureException(err) goes here.
  });
}
```

Dynamic `import()` inside the hooks keeps the module top-level bare (build-safe).

### 4. `lib/env.ts` — pure, unit-tested

```ts
export function validateEnv(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return; // dev: localhost default + auto-secret are fine
  const missing: string[] = [];
  if (!env.AUTH_SECRET) missing.push("AUTH_SECRET");
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s) in production: ${missing.join(", ")}. ` +
        `See .env.example.`,
    );
  }
}
```

### 5. `lib/db.ts` hardening

- Extract a pure **`resolveSslConfig(env)`** in its own file `lib/db-ssl.ts` (unit-tested):
  - `DATABASE_SSL` unset / `"disable"` → `undefined` (no SSL — Coolify-internal default)
  - `"require"` → `{ rejectUnauthorized: true }` (the recommended setting for an external managed Postgres)
  - `"no-verify"` → `{ rejectUnauthorized: false }` **and `logger.warn(...)`** that cert verification is disabled. This is a **discouraged, last-resort escape hatch** for a self-signed cert you can't add to the trust store — disabling verification exposes the connection to MITM. The warning log and `.env.example` comment both say "prefer `DATABASE_SSL=require` with the CA added to the trust store." It is never the default and never recommended in `docs/DEPLOY.md`.
- Pool options become:
  ```ts
  new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    ssl: resolveSslConfig(process.env),
  })
  ```
- Add a pool error handler so an idle-client error logs instead of crashing the process:
  ```ts
  pool.on("error", (err) => logger.error("pg_pool_error", { err: err.message }));
  ```
- `connectionString` keeps the localhost default (Decision 2).

### 6. `/health` liveness endpoint — `app/api/health/route.ts`

```ts
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ ok: true });
}
```

**Liveness only — no DB `select 1`.** A DB-readiness probe wired to Coolify's healthcheck would restart-loop/flap on a transient blip and turn a 5-second hiccup into a full outage. Liveness answers "is the Node process up?" — which is what an orchestrator restart should key on.

### 7. Deploy config — Dockerfile + `.dockerignore` (+ deploy notes)

**No `output: "standalone"`** (council-cut footgun: it breaks asset serving unless `.next/static`/`public` are hand-copied exactly, and it conflicts with `next start`). The Dockerfile uses plain **`next start`**, matching the existing `npm start` script.

**`Dockerfile`** — multi-stage, `node:24-alpine` (matches `.nvmrc` = 24, bumped to Active LTS in commit `a1b0bd7`), non-root runtime:
- `deps` stage: `npm ci`
- `build` stage: copy deps + source, `AUTH_SECRET=ci-build-placeholder npm run build` (placeholder only suppresses the next-auth build warning; build is force-dynamic, no DB needed)
- `runner` stage: `NODE_ENV=production`, copy `node_modules` + `.next` + `public`(if present) + `package.json` + `next.config.ts`, non-root `node` user, `EXPOSE 3000`, `CMD ["npm","start"]`

**`.dockerignore`** mirrors the vendored/transient excludes: `node_modules`, `.next`, `.git`, `.agents`, `.claude`, `.playwright-mcp`, `docs`, `*.local.env`, `.env*.local`, test artifacts.

**Deploy notes** (in spec + a short `docs/DEPLOY.md`): target is **Coolify + Railpack** per owner; flag that **Railpack is beta** and Coolify's *default* buildpack is **Nixpacks** (proven fallback), that **Coolify does not inject `PORT`** (Next defaults to 3000), set `AUTH_SECRET` + `DATABASE_URL` (+ `AUTH_URL`, OAuth creds) in Coolify env, and that Coolify-internal Postgres needs `DATABASE_SSL` unset.

---

## What we are explicitly NOT doing (council-cut)

- `output: "standalone"` — asset-serving footgun. Use `next start`.
- **DB-readiness** as the Coolify healthcheck — flapping/restart-loop risk. Liveness only.
- A pluggable/transport logger framework — minimal structured JSON now; Sentry slots into the `onRequestError` seam later.
- Migrations (M3·C) and pagination (M3·D).

---

## Testing strategy

**Unit (vitest, must stay green in CI):**
- `lib/env.ts` `validateEnv` — throws in prod when `AUTH_SECRET`/`DATABASE_URL` missing; lists all missing; no-ops in dev; passes when present.
- `resolveSslConfig` — each `DATABASE_SSL` value → correct ssl object; unset → `undefined`; `no-verify` warns.
- `lib/logger.ts` — emits parseable JSON with `level`/`msg`/`ts`; `warn`/`error` → stderr, else stdout.
- `/health` `GET()` — returns `{ ok: true }`, status 200.

**Build/type (CI):** `tsc --noEmit`, `eslint .`, `next build` all green — proves boundaries, instrumentation, and db wiring compile and the build doesn't invoke `register()`.

**Live verification (I drive — not a subagent):**
1. `npm run build && npm start` (production mode, so `global-error` is active).
2. `curl /api/health` → `200 {"ok":true}`.
3. **DB-down test:** stop `coffee-pg` Docker container, load `/` → see the styled **global-error** boundary (NOT a raw stack, NOT an empty signed-out shell); server stdout shows a structured JSON `request_error` line.
4. Restart `coffee-pg`, click "Try again" → app recovers with real data.
5. **Env-validation test:** start prod with `AUTH_SECRET` unset → clear startup error naming the missing var; with it set → boots.
6. **Docker test:** `docker build` the image, `docker run` it against the DB → app boots, `/api/health` → 200, a logged-in flow works.

---

## File-change summary

**Create:** `app/global-error.tsx`, `app/error.tsx`, `app/not-found.tsx`, `app/loading.tsx`, `app/api/health/route.ts`, `instrumentation.ts`, `lib/env.ts`, `lib/logger.ts`, `lib/db-ssl.ts`, `Dockerfile`, `.dockerignore`, `docs/DEPLOY.md`, plus tests under `test/`.
**Modify:** `lib/db.ts` (pool options + `'error'` handler + `resolveSslConfig`), `.env.example` (document `DATABASE_SSL`), possibly `next.config.ts` (only if a config flag proves needed — default: untouched, NO `standalone`).
**Unchanged on purpose:** `app/layout.tsx` / `getAppData` (Decision 1 — it keeps throwing; the boundary catches it).
