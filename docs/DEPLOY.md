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
  the trust store. Avoid `no-verify` (it disables cert verification → MITM risk).

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
