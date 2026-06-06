# M3·B — Ops / Deploy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cortado survive a transient DB outage gracefully, fail loud on misconfiguration, and be genuinely deployable to Coolify — without touching migrations or pagination.

**Architecture:** App Router error boundaries catch the `force-dynamic` root-layout crash (`getAppData` keeps throwing — **no empty-data fallback**); a hardened pg pool (timeouts, `keepAlive`, an `'error'` handler) plus env-driven SSL; startup env-validation via `instrumentation.ts` (runs at server start, never at build); a liveness `/health` route; a minimal structured-JSON logger with a Sentry seam at Next's `onRequestError`; and a multi-stage Dockerfile (`next start`, no `output:standalone`).

**Tech Stack:** Next.js 15 App Router + React 19 + TypeScript + Postgres (node `pg`) + Auth.js v5. Tests: vitest (node env) under `test/`. Node 24 (already bumped in `a1b0bd7`).

**Spec:** `docs/superpowers/specs/2026-06-06-m3b-ops-hardening-design.md`

**Prerequisite already landed:** Node 20→24 bump (`.nvmrc`, engines, CI, `@types/node`) — commit `a1b0bd7`.

**Branch:** `feat/m3-ops-hardening` (off `main` @ `df08c94`).

**Build order rationale:** logger (Task 1) → env (2) + db-ssl (3) are leaf modules → db.ts (4) consumes logger+db-ssl → instrumentation (5) consumes env+logger → health (6) → boundaries (7) → Dockerfile/docs (8) → live spike (9).

**Global guardrail (every task):** Nothing may throw at module top-level — `next build` must stay green (no DB, dummy `AUTH_SECRET`). Validation only runs *inside* functions. After each task: `npx tsc --noEmit` clean and `npx vitest run` green.

---

### Task 1: Structured logger

**Files:**
- Create: `lib/logger.ts`
- Test: `test/logger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/logger.test.ts
import { describe, it, expect, vi } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  it("emits one parseable JSON line with level, msg, spread ctx, and ts", () => {
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("hello", { a: 1 });
    expect(out).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(out.mock.calls[0][0] as string);
    expect(parsed).toMatchObject({ level: "info", msg: "hello", a: 1 });
    expect(typeof parsed.ts).toBe("string");
    out.mockRestore();
  });

  it("routes warn/error to console.error and debug/info to console.log", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(log).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalledTimes(2);
    log.mockRestore();
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run test/logger.test.ts`
Expected: FAIL — `Cannot find module '@/lib/logger'`.

- [ ] **Step 3: Implement `lib/logger.ts`**

```ts
// Minimal structured logger: one JSON line per call to stdout/stderr.
// This is the Sentry-ready seam — when Sentry lands, forward error()/warn() here.
type Ctx = Record<string, unknown>;

function emit(level: string, msg: string, ctx?: Ctx) {
  const line = JSON.stringify({ level, msg, ...ctx, ts: new Date().toISOString() });
  if (level === "warn" || level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, ctx?: Ctx) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Ctx) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Ctx) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Ctx) => emit("error", msg, ctx),
};
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run test/logger.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/logger.ts test/logger.test.ts
git commit -m "feat(ops): structured JSON logger (Sentry-ready seam)"
```

---

### Task 2: Env validation (pure)

**Files:**
- Create: `lib/env.ts`
- Test: `test/env.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/env.test.ts
import { describe, it, expect } from "vitest";
import { validateEnv } from "@/lib/env";

const prod = (extra: Record<string, string> = {}) =>
  ({ NODE_ENV: "production", ...extra }) as unknown as NodeJS.ProcessEnv;

describe("validateEnv", () => {
  it("no-ops outside production", () => {
    expect(() => validateEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("throws listing BOTH missing vars in production", () => {
    expect(() => validateEnv(prod())).toThrow(/AUTH_SECRET[\s\S]*DATABASE_URL/);
  });

  it("throws naming only the still-missing var", () => {
    expect(() => validateEnv(prod({ AUTH_SECRET: "x" }))).toThrow(/DATABASE_URL/);
  });

  it("passes when both are present", () => {
    expect(() => validateEnv(prod({ AUTH_SECRET: "x", DATABASE_URL: "y" }))).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run test/env.test.ts`
Expected: FAIL — `Cannot find module '@/lib/env'`.

- [ ] **Step 3: Implement `lib/env.ts`**

```ts
// Fail-fast env check. Called ONLY from instrumentation.register() (server start),
// never at module top-level — so `next build` (no DB, dummy secret) stays green.
export function validateEnv(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;
  const missing: string[] = [];
  if (!env.AUTH_SECRET) missing.push("AUTH_SECRET");
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s) in production: ${missing.join(", ")}. See .env.example.`,
    );
  }
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run test/env.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/env.ts test/env.test.ts
git commit -m "feat(ops): production env validation (AUTH_SECRET + DATABASE_URL)"
```

---

### Task 3: SSL config (pure)

**Files:**
- Create: `lib/db-ssl.ts`
- Test: `test/db-ssl.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/db-ssl.test.ts
import { describe, it, expect, vi } from "vitest";
import { resolveSslConfig } from "@/lib/db-ssl";

const env = (v?: string) => ({ DATABASE_SSL: v }) as unknown as NodeJS.ProcessEnv;

describe("resolveSslConfig", () => {
  it("returns undefined when unset or 'disable'", () => {
    expect(resolveSslConfig(env())).toBeUndefined();
    expect(resolveSslConfig(env("disable"))).toBeUndefined();
  });

  it("requires verified TLS for 'require'", () => {
    expect(resolveSslConfig(env("require"))).toEqual({ rejectUnauthorized: true });
  });

  it("disables verification for 'no-verify' AND warns once", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(resolveSslConfig(env("no-verify"))).toEqual({ rejectUnauthorized: false });
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run test/db-ssl.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db-ssl'`.

- [ ] **Step 3: Implement `lib/db-ssl.ts`**

```ts
import { logger } from "@/lib/logger";

/**
 * Postgres TLS config from the DATABASE_SSL env var. Default OFF — Coolify-internal
 * Postgres shares the Docker network and needs no TLS. We key off this env var, NOT
 * an `sslmode` in the connection string: a URL `sslmode` silently REPLACES the whole
 * `ssl` object, undoing programmatic config. Pick one mechanism — this is it.
 *
 *   unset | "disable" -> no SSL
 *   "require"         -> verified TLS (recommended for an external managed Postgres)
 *   "no-verify"       -> TLS without cert verification (discouraged; MITM risk)
 */
export function resolveSslConfig(env: NodeJS.ProcessEnv): { rejectUnauthorized: boolean } | undefined {
  switch (env.DATABASE_SSL) {
    case "require":
      return { rejectUnauthorized: true };
    case "no-verify":
      logger.warn("database_ssl_no_verify", {
        hint: "TLS certificate verification is DISABLED (MITM risk). Prefer DATABASE_SSL=require with the CA added to the trust store.",
      });
      return { rejectUnauthorized: false };
    default:
      return undefined;
  }
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run test/db-ssl.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db-ssl.ts test/db-ssl.test.ts
git commit -m "feat(ops): env-driven pg SSL config (default off, no-verify discouraged)"
```

---

### Task 4: pg pool hardening

**Files:**
- Modify: `lib/db.ts`

No unit test (constructs a real `Pool`; existing tests mock `@/lib/db`). Verified by `tsc` + `build`.

- [ ] **Step 1: Rewrite the pool section of `lib/db.ts`**

Replace lines 1–18 (imports through the HMR-global assignment) with:

```ts
import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { logger } from "@/lib/logger";
import { resolveSslConfig } from "@/lib/db-ssl";

/**
 * Shared pg connection pool. Defaults to the repo's local Docker Postgres
 * (`coffee-pg`); override with DATABASE_URL. In production the startup validator
 * (instrumentation.ts) guarantees DATABASE_URL is set, so the localhost default
 * is only ever effective in dev.
 */
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/coffee_tracker";

const globalForPool = globalThis as unknown as { __cortadoPool?: Pool };

function createPool(): Pool {
  const p = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    ssl: resolveSslConfig(process.env),
  });
  // An idle client erroring (e.g. the server drops the connection) emits 'error'
  // on the pool; with no handler, node-postgres throws and crashes the process.
  // Attached once per real pool creation (HMR reuse below skips this).
  p.on("error", (err) => logger.error("pg_pool_error", { err: err.message }));
  return p;
}

export const pool = globalForPool.__cortadoPool ?? createPool();

if (process.env.NODE_ENV !== "production") globalForPool.__cortadoPool = pool;
```

Leave the rest of the file (`query`, `makeWithTransaction`, `withTransaction`) unchanged.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full suite (ensure no regression in db-mocked tests)**

Run: `npx vitest run`
Expected: all green — the existing suite plus the new logger/env/db-ssl tests (do not gate on an exact count).

- [ ] **Step 4: Production build smoke**

Run: `AUTH_SECRET=ci-build-placeholder-not-a-secret npm run build`
Expected: build completes successfully (no DB needed — confirms module-eval is build-safe).

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts
git commit -m "feat(ops): harden pg pool (timeouts, keepAlive, error handler, env SSL)"
```

---

### Task 5: instrumentation.ts (env validation + error seam)

**Files:**
- Create: `instrumentation.ts` (repo root)

No unit test (process/runtime hooks). Verified by `tsc` + `build`.

- [ ] **Step 1: Create `instrumentation.ts`**

```ts
// Next.js instrumentation hooks — auto-discovered at the repo root.
// Keep module top-level BARE (no imports, no env/DB reads): register() runs at
// server START, not during `next build`, so CI's secret-less build stays green.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnv } = await import("@/lib/env");
  validateEnv(process.env);
}

// Next 15's official server-error hook — the Sentry-ready seam.
export async function onRequestError(err: unknown) {
  const { logger } = await import("@/lib/logger");
  // Sentry seam: `Sentry.captureException(err)` slots in right here.
  logger.error("request_error", {
    err: err instanceof Error ? err.message : String(err),
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build — proves register() is NOT called at build despite no DATABASE_URL**

Run: `AUTH_SECRET=ci-build-placeholder-not-a-secret npm run build`
Expected: build succeeds (if `register()` ran at build, the missing `DATABASE_URL` would throw — it does not).

- [ ] **Step 4: Commit**

```bash
git add instrumentation.ts
git commit -m "feat(ops): instrumentation — startup env validation + onRequestError log seam"
```

---

### Task 6: /health liveness route

**Files:**
- Create: `app/api/health/route.ts`
- Test: `test/health.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/health.test.ts
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns 200 {ok:true} (liveness only, no DB)", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run test/health.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/health/route'`.

- [ ] **Step 3: Implement `app/api/health/route.ts`**

```ts
// Liveness probe — answers "is the Node process up?" Intentionally does NOT touch
// the DB: a readiness check wired to Coolify's healthcheck would restart-loop on a
// transient blip and turn a 5-second hiccup into a full outage.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run test/health.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add app/api/health/route.ts test/health.test.ts
git commit -m "feat(ops): /api/health liveness endpoint"
```

---

### Task 7: App Router boundaries

**Files:**
- Create: `app/global-error.tsx`, `app/error.tsx`, `app/not-found.tsx`, `app/loading.tsx`

No unit tests (React components). Verified by `tsc` + `eslint` + `build`.

- [ ] **Step 1: Create `app/global-error.tsx`**

```tsx
"use client";

// Catches a crash in the ROOT layout itself (e.g. getAppData() throwing when the
// DB is unreachable). It REPLACES the root layout, so it must render its own
// <html>/<body> and cannot rely on app fonts/Tailwind layers → inline styles.
// Only fires in a production build (dev shows the Next overlay).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          background: "#f7f3ee",
          color: "#2b2420",
        }}
      >
        <main style={{ textAlign: "center", padding: "2rem", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Something spilled.</h1>
          <p style={{ opacity: 0.75, marginBottom: "1.5rem" }}>
            We couldn&rsquo;t load Cortado just now. Your data is safe &mdash; this one&rsquo;s on us.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.6rem 1.2rem",
              borderRadius: "999px",
              border: "none",
              background: "#7a4f2a",
              color: "white",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create `app/error.tsx`**

```tsx
"use client";

// Catches errors thrown in a page/segment BELOW the root layout. (The root-layout
// crash itself is handled by global-error.tsx.) Renders inside the root layout, so
// it can use the app's Tailwind theme tokens.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="mb-2 text-2xl font-semibold">Something went wrong.</h1>
        <p className="mb-6 text-muted-foreground">This page hit a snag. Give it another try.</p>
        <button onClick={() => reset()} className="rounded-full bg-primary px-5 py-2 text-primary-foreground">
          Try again
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create `app/not-found.tsx`**

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="mb-2 text-2xl font-semibold">Page not found</h1>
        <p className="mb-6 text-muted-foreground">That page has wandered off. Let&rsquo;s get you back.</p>
        <Link href="/" className="rounded-full bg-primary px-5 py-2 text-primary-foreground">
          Back to Cortado
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Create `app/loading.tsx`**

```tsx
// Suspense fallback during navigation/data loads at the root.
export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + lint the new files**

Run: `npx tsc --noEmit && npx eslint app/global-error.tsx app/error.tsx app/not-found.tsx app/loading.tsx`
Expected: no type errors; eslint clean (no unescaped-entity or unused-var errors).

- [ ] **Step 6: Build**

Run: `AUTH_SECRET=ci-build-placeholder-not-a-secret npm run build`
Expected: build succeeds; the 4 boundary routes appear in the route manifest.

- [ ] **Step 7: Commit**

```bash
git add app/global-error.tsx app/error.tsx app/not-found.tsx app/loading.tsx
git commit -m "feat(ops): App Router boundaries (global-error, error, not-found, loading)"
```

---

### Task 8: Dockerfile + deploy docs

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docs/DEPLOY.md`
- Modify: `.env.example`

No unit test. `Dockerfile` verified by a real `docker build` in Step 6 (Docker is available locally).

- [ ] **Step 1: Create `Dockerfile`** (multi-stage, `node:24-alpine`, `next start` — no `output:standalone`; **no `public/` COPY** — the repo has no `public/` dir)

```dockerfile
# syntax=docker/dockerfile:1

# --- deps: install all deps (dev deps are needed to build) ---
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build: compile the Next.js app ---
FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder only suppresses a next-auth build warning; build is force-dynamic,
# needs no DB and no real secret.
ENV AUTH_SECRET=ci-build-placeholder-not-a-secret
RUN npm run build

# --- runner: production runtime via `next start` ---
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# Copy the FULL build-stage node_modules (incl. dev deps). `next start` reads
# next.config.ts at runtime and resolves `typescript` to transpile it — do NOT
# later "optimize" with `npm ci --omit=dev` or prune dev deps, or boot will break.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
USER nextjs
EXPOSE 3000
CMD ["npm", "start"]
```

- [ ] **Step 2: Create `.dockerignore`**

```
node_modules
.next
.git
.github
.agents
.claude
.playwright-mcp
.superpowers
docs
test
test-results
coverage
.env
.env*.local
*.local.env
npm-debug.log*
Dockerfile
.dockerignore
README.md
SETUP.md
```

- [ ] **Step 3: Append a `DATABASE_SSL` block to `.env.example`**

Add at the end of `.env.example`:

```
# Postgres TLS (node-postgres). Default OFF — Coolify-internal Postgres needs no TLS.
#   require   = verified TLS (recommended for an EXTERNAL managed Postgres)
#   no-verify = TLS without cert verification (DISCOURAGED — MITM risk; prefer 'require' + CA in trust store)
# Do NOT also put sslmode in DATABASE_URL — a URL sslmode overrides this entirely.
# DATABASE_SSL=require
```

- [ ] **Step 4: Create `docs/DEPLOY.md`**

```markdown
# Deploying Cortado

Target: **Coolify** (self-hosted PaaS) building with **Railpack**.

## Build
- **Railpack** is Coolify's newer buildpack and is currently **beta**. If a build
  misbehaves, switch the Coolify build pack to **Nixpacks** (the stable default) or
  to the committed **Dockerfile** (Build Pack: Dockerfile). All three run `next start`.
- The repo pins **Node 24** (`.nvmrc`, `engines`). Railpack/Nixpacks honor `.nvmrc`.

## Required environment variables (set in Coolify → Environment)
- `AUTH_SECRET` — generate with `npx auth secret`. **Required in production** (the
  app refuses to start without it).
- `DATABASE_URL` — **required in production**.
- `AUTH_URL` — your public origin, e.g. `https://cortado.example.com/`.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — if using OAuth.

## Postgres TLS
- **Coolify-internal Postgres** (same Docker network): leave `DATABASE_SSL` **unset**.
- **External managed Postgres**: set `DATABASE_SSL=require` and add the provider CA to
  the trust store. Avoid `no-verify`.

## Ports & health
- Coolify does **not** inject `PORT`; Next.js listens on **3000**. Point the proxy at 3000.
- Healthcheck path: **`/api/health`** (liveness — returns `{"ok":true}`). Do **not** use a
  DB-readiness check as the orchestrator healthcheck; it would restart-loop on transient blips.

## Dockerfile (optional, committed)
```bash
docker build -t cortado .
# DATABASE_URL must be reachable FROM the container. For a Postgres on the host,
# use --network host (Linux) so localhost resolves to the host; with -p/bridge,
# point DATABASE_URL at a routable host (not localhost).
docker run --network host --env-file .env.local cortado
```
Multi-stage, `node:24-alpine`, non-root, runs `next start` (no `output:standalone`).
```

- [ ] **Step 5: Typecheck + verify nothing else broke**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean / all green (config + docs only).

- [ ] **Step 6: Real Docker build**

Run: `docker build -t cortado:m3b .`
Expected: build succeeds through all three stages (deps → build → runner).

- [ ] **Step 7: Commit**

```bash
git add Dockerfile .dockerignore docs/DEPLOY.md .env.example
git commit -m "feat(ops): Dockerfile (node:24-alpine, next start) + .dockerignore + DEPLOY.md"
```

---

### Task 9: Live verification spike (controller-run, not a subagent)

**Files:** none (procedure). This is an operator checklist the controller runs after Tasks 1–8 — it is the real proof the boundaries, env-validation, pool, health, and Docker image behave. Do **not** delegate it to a subagent.

- [ ] **Step 1: Production boot**

```bash
npm run build && npm start
```
Expected: server starts on `:3000`; stdout shows a structured JSON line, no crash.

- [ ] **Step 2: Liveness**

```bash
curl -s localhost:3000/api/health
```
Expected: `{"ok":true}`.

- [ ] **Step 3: DB-down → global-error boundary (the headline behavior)**

```bash
docker stop coffee-pg
```
Then load `http://localhost:3000/` in the browser.
Expected: the styled **global-error** screen ("Something spilled" + "Try again") — **NOT** a raw stack trace and **NOT** an empty signed-out shell. Server stdout shows a structured `{"level":"error","msg":"request_error",...}` line.

- [ ] **Step 4: Recovery**

```bash
docker start coffee-pg
```
Then click **Try again**.
Expected: app reloads with real data; logged-in state intact.

- [ ] **Step 5: Env-validation fail-fast**

Stop the server, then:
```bash
NODE_ENV=production npm start   # with AUTH_SECRET unset in the shell
```
Expected: process exits/errs at startup with a clear message naming the missing var(s) (`AUTH_SECRET`, `DATABASE_URL`). (Set them and confirm it boots.)

- [ ] **Step 6: Docker image end-to-end**

```bash
docker build -t cortado:m3b .
docker run --rm --env-file .env.local --network host cortado:m3b
```
(Or map `-p 3000:3000` and point `DATABASE_URL` at the host's `coffee-pg`.)
Expected: container boots, `curl localhost:3000/api/health` → `{"ok":true}`, and a logged-in flow works against the DB.

- [ ] **Step 7: Record results** in the PR description (each check + outcome). No code commit.

---

## Self-review checklist (controller, before opening the PR)

- [ ] Spec coverage: 4 boundaries ✓, getAppData unchanged/throws ✓, pool timeouts+keepAlive+error-handler+env-SSL ✓, instrumentation register+onRequestError ✓, liveness /health ✓, logger+Sentry seam ✓, Dockerfile+.dockerignore+DEPLOY.md+.env.example ✓.
- [ ] No module-top-level throw anywhere (env validation only inside `register()`).
- [ ] `npm run typecheck && npm test && npm run lint && npm run build` all green.
- [ ] Live spike (Task 9) completed with results recorded.
- [ ] Run `/code-review` on the PR and post a summary comment (standing project convention).
