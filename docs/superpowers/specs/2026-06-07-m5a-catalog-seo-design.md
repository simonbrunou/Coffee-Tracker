# M5·A — Catalog SEO & Social Cards — Design

**Date:** 2026-06-07
**Branch:** `feat/m5a-catalog-seo`
**Status:** Approved design (catalog-only scope), pressure-tested by the 4-lens model-diverse `m5a-design-council`.

## Goal

Make Cortado's public, **non-personal** catalog — bean and roaster pages — fully indexable and shareable: per-page metadata, canonical URLs, `robots`, `sitemap`, JSON-LD structured data, and Open Graph / Twitter images. No personal data is exposed or indexed.

## Scope decision (why catalog-only)

The brainstorming council found that a public profile route is **(a)** a ground-up feature (the existing `ProfileScreen` is client-only, reads the *current* user via context, and redirects to `/login` — not reusable server-side) and **(b)** a real privacy/consent change: there is no "private review" concept, so a public profile aggregates a user's **entire** brew history + free-text notes at a stable, logged-out URL, and indexing it makes that **permanently googleable against their real name** — beyond what the shipped privacy policy discloses. Therefore **public profiles are deferred to their own milestone** (with a consent/indexing design). M5·A ships only catalog SEO, which is uncontroversial and fast because bean/roaster pages are already server components.

**Revised M5 roadmap:** M5·A (catalog SEO, this doc) → **Public Profiles** (new milestone) → Accessibility → PWA & polish.

## Hard constraints honored

- **Every route is `force-dynamic`** (root layout cascades) because the strict per-request nonce CSP (`middleware.ts`) blanks any statically-rendered route. All SEO work is compatible with per-request dynamic rendering.
- **`next build` runs with no DB** (dummy env). Nothing added here may hit Postgres at build time.
- **No PII**: only bean/roaster (catalog) data is read; no user/profile/email/inventory fields.

## Foundations

### `getPublicBaseUrl()` — one public-origin source of truth
A shared helper (e.g. `lib/public-url.ts`) returns the absolute public origin from `process.env.AUTH_URL`, falling back to `http://localhost:3000` only in dev/test. Used by `metadataBase`, canonical URLs, OG absolute URLs, `robots`, `sitemap`, and refactored into `lib/verify-email.ts` (which currently inlines the same `AUTH_URL ?? localhost` pattern).

**Production fail-fast:** extend `lib/env.ts` `validateEnv` so a missing/invalid `AUTH_URL` **throws in production** (joining `AUTH_SECRET`/`DATABASE_URL`). Rationale: a silent `localhost` fallback would emit `localhost` canonicals + OG image URLs that crawlers can't fetch — a silent SEO/social breakage. Document `AUTH_URL` as **required for production** in `.env.example`.

### Query layer
- **`React.cache`-wrap the read queries used by both `generateMetadata` and the page body.** Raw `pg` has no `fetch`-based request memoization, so `generateMetadata` calling `getBean(uid,id)` and the page calling `getBean(uid,id)` would be two SQL round-trips. Export cached wrappers (mirroring how `getCurrentUserId` already uses `React.cache`) and call the *same* cached function from both. A test asserts the wrapping.
- **Add `getRoasterById(currentUserId, id)`** to `lib/queries.ts` (the roaster page currently has no server-side roaster identity — `RoasterClient` resolves it from the client provider). Same projection as `getRoasters`, `WHERE r.id = $1`. Used by `generateMetadata`, JSON-LD, and the OG route; also passed into `RoasterClient` so the page no longer depends on the provider for identity. `notFound()` when null.
- **Bounded sitemap enumeration queries.** `getRoasters` is currently unbounded (full scan). Add dedicated bounded queries returning just `{id, createdAt?}` for beans and `{id}` for roasters, with an explicit `LIMIT` (50,000 — the per-sitemap URL cap) ordered by `created_at`/`id`. (Beans can reuse the keyset helper in `lib/pagination.ts`; a single sitemap suffices at current scale — see *Deferred*.)

### `metadataBase`
Set `metadata.metadataBase = new URL(getPublicBaseUrl())` in the root layout so all relative OG/canonical URLs resolve to absolute. The home `/` page is a client component and inherits root metadata (no per-page metadata possible there without a server wrapper — out of scope).

## Cut 1 — SEO foundation

- `lib/public-url.ts` (`getPublicBaseUrl`); refactor `lib/verify-email.ts` to use it.
- `lib/env.ts`: production fail-fast on missing `AUTH_URL`; `.env.example` doc.
- `React.cache`-wrapped `getBean`; add `getRoasterById` (cached); bounded sitemap queries.
- Root `metadataBase` + a sensible default `openGraph`/`twitter` block (site name, default title/description).
- **`app/robots.ts`** (MetadataRoute.Robots): `rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/settings', '/login', '/signup', '/profile', '/journal'] }`, `sitemap: ${base}/sitemap.xml`, `host: base`.
- **`app/sitemap.ts`** (MetadataRoute.Sitemap): static entries (`/`, `/discover`, `/privacy`, `/terms`, `/cookies`) + all `bean/[id]` (lastModified = `created_at`) + all `roaster/[id]` (no lastModified — roasters have no timestamp). Bounded queries. **No `/u/…`, `/profile`, `/journal`, `/settings`, auth pages.**

*(`robots.ts`/`sitemap.ts` are MetadataRoute handlers, not page segments; they serve `/robots.txt` and `/sitemap.xml`, which the middleware matcher already excludes from CSP. Being DB-backed, `sitemap.ts` is inherently dynamic — no build-time DB hit.)*

## Cut 2 — Per-page metadata + JSON-LD

- **`generateMetadata`** on `app/(app)/bean/[id]/page.tsx` and `roaster/[id]/page.tsx`, using the cached `getBean`/`getRoasterById`:
  - Bean: title `"{name} — {roasterName} | Cortado"`, description from origin/process/flavors, `alternates.canonical: /bean/{id}`, `openGraph`/`twitter` (type article, the dynamic OG image). `notFound()` already handled in body; metadata returns minimal on null.
  - Roaster: title `"{name} — Roaster | Cortado"`, description from city/blurb, canonical `/roaster/{id}`, OG/twitter.
- **JSON-LD** (server-rendered `<script type="application/ld+json">`, **with the per-request nonce** read via `headers().get("x-nonce")` — defensive against the strict `script-src`; verified in-browser):
  - Bean → `Product` + `AggregateRating` (`ratingValue`=avgRating, `ratingCount`=ratings); include an `offers` node **only when `price` is non-null** (no `$null`).
  - Roaster → `Organization` (name, address locality from city).
  - Both → `BreadcrumbList`.
- **`noindex`** via `robots` metadata on `/login` and `/signup` (server components); a descriptive title on `/discover`.

## Cut 3 — OG images (static-first)

- **Static default**: a site-wide `app/opengraph-image.*` (branded 1200×630) — immediate sharing value for all non-detail pages.
- **Dynamic** `opengraph-image.tsx` for `bean/[id]` and `roaster/[id]` via `next/og` `ImageResponse` (tailored card: name + roaster/locality + ★rating on brand background); `twitter-image.tsx` mirrors. Council-mandated specifics:
  - **Bundled TTF font** (the brand display font, e.g. Spectral) committed to the repo — satori cannot read the app's self-hosted **woff2**; read via `fs.readFileSync(path.join(process.cwd(), …))`. (Acceptable v1 fallback: `@vercel/og`'s default Noto if bundling balloons.)
  - **`export const dynamic = "force-dynamic"`** in each OG route — OG routes static-optimize by default and would hit the DB at build otherwise.
  - **nodejs runtime** (default; do **not** set `edge` — `pg` is node-only).
  - **Dockerfile**: add `COPY --from=build /app/public ./public` (and the font path if under `public/`) to the runner stage so font bytes exist at runtime.
  - OG routes read the bean/roaster via the cached query; source only catalog fields (no PII).

## Testing

**Unit / structural (Vitest):**
- `getPublicBaseUrl` resolves `AUTH_URL`; `lib/env.ts` throws in production when `AUTH_URL` is unset.
- `getBean`/`getRoasterById` are `React.cache`-wrapped (the shared cached export is used by metadata + page).
- `robots.ts` allows `/`, `/bean/`, `/roaster/`, `/discover`, legal; disallows `/api/`, `/settings`, `/login`, `/signup`, `/profile`, `/journal`; references the sitemap.
- `sitemap.ts` includes bean + roaster URLs and **excludes** `/profile`, `/u/`, `/settings`, auth pages; queries are bounded (LIMIT present).
- `generateMetadata` returns expected title/canonical/OG for a mocked bean & roaster; null record → minimal/notFound-safe.
- JSON-LD builder: valid `Product`+`AggregateRating` (no `offers` when price null), `Organization`, `BreadcrumbList`.
- OG routes export `force-dynamic`, declare no `edge` runtime, and (smoke) return `image/png`.

**Live verification (controller-driven):**
- `/robots.txt` and `/sitemap.xml` serve with correct content; sitemap lists beans/roasters, no personal routes.
- A bean and a roaster link unfurl with correct title/description/image (OG debugger or curl of the OG route → PNG).
- JSON-LD passes Google Rich Results / schema validation; no `$null`.
- No CSP console violations on bean/roaster pages (JSON-LD nonce works); dark/light unaffected.
- Green gate: full suite, build (proves **no build-time DB hit** for OG/sitemap), lint, typecheck, drift-clean.

## Risks & mitigations (from the council)

| Risk | Mitigation |
|---|---|
| `generateMetadata` double-fetches (raw `pg`, no fetch-dedup) | `React.cache`-wrap `getBean`/`getRoasterById`; same fn in metadata + page; test asserts it |
| `AUTH_URL` unset in prod → `localhost` canonicals/OG | `getPublicBaseUrl()` + **prod fail-fast** in `lib/env.ts` |
| OG routes static-optimize → build-time DB hit | `force-dynamic` per OG route; build verifies no DB query |
| satori can't read woff2 | bundle a TTF; Dockerfile copies `public/`; nodejs runtime |
| OG route on edge can't use `pg` | default nodejs runtime; never declare `edge` |
| JSON-LD blocked by strict `script-src` | attach per-request nonce; verify in-browser |
| Handle/profile/PII exposure | out of scope — no profile route, no user queries, no PII fields in catalog queries |
| Sitemap unbounded scan | bounded queries with LIMIT |

## Out of scope / deferred
- **Public profiles** (`/u/[handle]`) — own milestone with consent/indexing design.
- `updated_at` columns on beans/roasters/users (sitemap uses `created_at`; cosmetic for ranking).
- Sitemap **index** (multi-file) — only needed beyond 50,000 URLs.
- Per-screen skeletons, a11y pass, PWA manifest/icons — later M5 milestones.

## Owner inputs
- **`AUTH_URL` must be set to the production origin** (now enforced at boot). Optionally a distinct `SITE_URL` if the SEO origin should differ from the auth origin (not needed today).
- A brand display **TTF** font file for OG images (or accept the Noto fallback for v1).
