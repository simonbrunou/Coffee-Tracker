# Deploying Cortado

Target: **Coolify** (self-hosted PaaS) building the committed **Dockerfile**
(Build Pack: Dockerfile).

## Build
- The `Dockerfile` is the only build definition. Its build stage runs `npm ci` and
  `npm run build`; `next.config.ts` sets `output: "standalone"`, and the `postbuild`
  script (`scripts/postbuild-standalone.mjs`) adds `.next/static`, `public/`,
  `drizzle/`, `scripts/migrate.mts` and `drizzle-orm` to `.next/standalone`.
- The runtime stage copies only `.next/standalone`, so the image carries no
  devDependencies. It starts with `node scripts/migrate.mts && exec node server.js`:
  pending migrations first, then the standalone server. A failed migration stops the
  container before the server starts.
- Every stage uses `node:24-alpine` pinned by digest. Renovate's digest PRs move the
  pin; the repo pins **Node 24** for local work too (`.nvmrc`, `engines`).
- CI's `Docker build (smoke test)` job builds the image on every PR to `main` and every
  push to `main`, boots it against a Postgres and probes `/api/health`, checks that
  every migration in `drizzle/meta/_journal.json` was applied, then fetches a PWA icon
  and a `/_next/static` script.

## Required environment variables (set in Coolify → Environment)
- `AUTH_SECRET` — generate with `npx auth secret`. **Required in production** (the
  app refuses to start without it).
- `DATABASE_URL` — **required in production**. The migrations run against it at
  every start.
- `AUTH_URL` — **required in production**: your public origin, e.g.
  `https://cortado.example.com/`.
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — if using OAuth.

## Postgres TLS
- **Coolify-internal Postgres** (same Docker network): leave `DATABASE_SSL` **unset**.
- **External managed Postgres**: set `DATABASE_SSL=require` and add the provider CA to
  the trust store. Avoid `no-verify` (it disables cert verification → MITM risk).

## Ports & health
- Coolify does **not** inject `PORT`; the image sets `PORT=3000` and
  `HOSTNAME=0.0.0.0`, so the server listens on **3000** on every interface. Point the
  proxy at 3000.
- Healthcheck path: **`/api/health`** (liveness — returns `{"ok":true}`). Do **not** use a
  DB-readiness check as the orchestrator healthcheck; it would restart-loop on transient blips.

## Running the image locally
```bash
docker build -t cortado .
# DATABASE_URL must be reachable FROM the container. For a Postgres on the host,
# use --network host (Linux) so localhost resolves to the host; with -p/bridge,
# point DATABASE_URL at a routable host (not localhost).
docker run --network host --env-file .env.local cortado
```
The container runs as the non-root `nextjs` user. `.env.local` needs the three
production variables above, since the image sets `NODE_ENV=production`.
