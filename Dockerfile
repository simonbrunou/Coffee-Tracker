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
# The inline placeholder only suppresses a next-auth build warning; the build is
# force-dynamic, needs no DB and no real secret. Inlined on RUN (not an ENV layer)
# so it never persists in the image — the real AUTH_SECRET is injected at runtime.
RUN AUTH_SECRET=ci-build-placeholder-not-a-secret npm run build

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
