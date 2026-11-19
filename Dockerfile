# syntax=docker/dockerfile:1

# --- base: the one node:24-alpine image every stage starts from, pinned by digest
# so a rebuild gets the same base. Renovate's digest PRs move the pin. ---
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS base

# --- deps: install all deps (dev deps are needed to build) ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build: compile the Next.js app ---
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The inline placeholder only suppresses a next-auth build warning; the build is
# force-dynamic, needs no DB and no real secret. Inlined on RUN (not an ENV layer)
# so it never persists in the image — the real AUTH_SECRET is injected at runtime.
# `npm run build` also runs the `postbuild` script (scripts/postbuild-standalone.mjs),
# which fills .next/standalone with .next/static, public/, drizzle/,
# scripts/migrate.mts and drizzle-orm.
RUN AUTH_SECRET=ci-build-placeholder-not-a-secret npm run build

# --- runner: the standalone server, with no build-stage node_modules ---
FROM base AS runner
WORKDIR /app
# HOSTNAME: Docker sets it to the container ID, and server.js binds to it, so
# pin it to all interfaces. server.js reads PORT and defaults to 3000.
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
# server.js, its traced node_modules, the static assets, public/ (the PWA icons the
# manifest pins), drizzle/ and the migration runner. Root owns them, so the app
# cannot rewrite its own code; only .next/cache, where Next writes at runtime, is
# the app user's.
COPY --from=build /app/.next/standalone ./
RUN mkdir -p .next/cache && chown nextjs:nodejs .next/cache
USER nextjs
EXPOSE 3000
# Apply pending migrations, then replace the shell with the server so it gets
# Docker's SIGTERM. A failed migration stops the container before the server starts.
CMD ["sh", "-c", "node scripts/migrate.mts && exec node server.js"]
