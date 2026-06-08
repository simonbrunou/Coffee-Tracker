# M5·C — PWA & Polish — Design

**Date:** 2026-06-08
**Branch:** `feat/m5c-pwa-polish`
**Status:** Approved design (full installable PWA + code-generated icons), pressure-tested by the 4-lens `m5c-design-council`.

## Goal

Make Cortado an installable PWA (manifest + complete icon set + pre-paint theme-color) and replace the generic loading spinner with screen-faithful skeletons — the last M5 launch-polish milestone. Additive only (no schema/auth changes).

## Constraints honored
- Every route is `force-dynamic` (root cascade) for the nonce CSP; the build runs with **no DB**. Metadata files (`manifest`, `icon`, `apple-icon`) are **separate route segments** — the page-level `dynamic` export does NOT cascade to them, and `force-static` on `next/og` icon routes prerenders at build (proven by the existing `app/opengraph-image.tsx`).
- **Icons drawn with hardcoded hex, text-free** — satori (next/og) cannot resolve `var(--*)`, reuse the `Logo` component, or render `<text>`/emoji/the app's woff2.

## A. Theme colors (single source of truth)

`lib/theme-colors.ts` exports `THEME_LIGHT = "#f8f3eb"` and `THEME_DARK = "#18130e"` — the **true sRGB conversions** of `--cream` light `oklch(0.965 0.012 78)` / dark `oklch(0.19 0.012 64)` (the existing `#f4ece1`/`#1b1610` in `app-provider.tsx` drift from the real tokens). Imported by the viewport, the manifest, and the app-provider sync so all three can never desync.

**Pre-paint theme-color:** add `viewport.themeColor = THEME_LIGHT` (a **single** value, no `prefers-color-scheme` media array) to the root layout. Rationale: next-themes here is `enableSystem={false} defaultTheme="light"`, so the app is light by default regardless of OS — a single static light value is the correct pre-JS tint and avoids the duplicate-meta race (the app-provider effect uses `querySelector`, which patches only the first of multiple metas). The existing `app-provider.tsx` client effect stays as the post-hydration source of truth for the in-app toggle; update it to use `THEME_LIGHT`/`THEME_DARK`.

## B. Code-generated icons

- **Keep `app/icon.svg`** (crisp SVG favicon, served at `/icon.svg`, already middleware-excluded).
- **`app/apple-icon.tsx`** — `next/og` `ImageResponse`, 180×180, `export const dynamic = "force-static"`, **no DB import**. Draws the bean with hex literals from `icon.svg` (rounded-rect `#3a2a1e` bg, ellipse `#c08a45` rx/ry rotate 35, white crease) on a full-bleed background. Next auto-injects the apple-touch-icon `<link>` (hash in the link is fine).
- **`scripts/gen-icons.mjs`** (committed generator, honors "code-generated"): uses `next/og` `ImageResponse` via `React.createElement` (no JSX in the `.mjs`) to render the same bean and **write PNG files** to `public/icons/`: `icon-192.png` (192, bean ~70% of canvas), `icon-512.png` (512, same), `maskable-512.png` (512, bean in the central **~60%** with full-bleed `#3a2a1e` so platform masks don't clip it). Run once during execution; **commit the resulting PNGs** (stable, manifest-referenceable URLs). Added to the eslint `ignores` (`scripts/**` already is).
- **Dockerfile:** add `COPY --from=build /app/public ./public` to the runner stage so `public/icons/*.png` exist at runtime (the M5·A-deferred copy, now required).

*(Why public/ PNGs, not manifest→`/icon`: Next hash-fingerprints `next/og` metadata-route URLs, so the manifest cannot reliably reference them — `public/icons/*.png` are stable paths we own.)*

## C. Web app manifest — `app/manifest.ts`

`MetadataRoute.Manifest`, pure static object (no DB/headers → prerenders, no `dynamic` export needed):
- `name: "Cortado — Coffee Journal"`, `short_name: "Cortado"`, `description`, `id: "/"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `orientation: "portrait"`.
- `background_color: THEME_LIGHT`, `theme_color: THEME_LIGHT`.
- `icons`: `{src:"/icons/icon-192.png", sizes:"192x192", type:"image/png", purpose:"any"}`, `…icon-512…"any"`, `{src:"/icons/maskable-512.png", sizes:"512x512", type:"image/png", purpose:"maskable"}`.
- `categories: ["food", "lifestyle"]`.

Next auto-injects `<link rel="manifest">`. `start_url:"/"` is sound (the feed is public, not a dead-end); `/journal`/`/profile` would be wrong (auth-only).

## D. CSP / middleware
- Add `manifest-src 'self'` to `buildCsp` (`lib/security-headers.ts`) for explicitness (it already falls back to `default-src 'self'`).
- Extend the middleware matcher negative-lookahead to also exclude `manifest.webmanifest`, `apple-icon`, `opengraph-image`, `twitter-image` (the immutable metadata assets) — an overhead cleanup; the per-request CSP on a JSON/PNG response is inert, so this is optimization, not correctness. (`/icon` is hashed → can't literal-exclude; it's inert anyway.)

## E. Skeletons

- **Upgrade `app/(app)/loading.tsx`** from the generic spinner to an **app-shell skeleton** (sidebar/bottom-nav silhouette + content placeholder). This is the **highest-value** change: it's what users see during the slow `getAppData` cold-open (the `(app)` layout fetch), which only this boundary covers; intra-(app) SPA nav preserves the layout so `getAppData` doesn't re-run.
- **Three leaf `loading.tsx`** — `app/(app)/discover/loading.tsx`, `bean/[id]/loading.tsx`, `roaster/[id]/loading.tsx` — these fire on SPA navigation because each page body `await`s the DB (verified). **None** for journal/profile/feed (synchronous/provider-only → no-ops). Each header comment notes "fires because page.tsx awaits the DB".
- **Shared primitives:** a `components/skeleton.tsx` (a `Skeleton` block using a CSS `@keyframes` shimmer + the `--surface-2`/`--cream` tokens). All four fallbacks compose the same primitive so the cold-open→tap transition is visually consistent. Shimmer is a CSS animation → the existing global `@media (prefers-reduced-motion: reduce)` already neutralizes it (no per-skeleton rule).
- **Scroll-restoration guard (real regression risk):** each skeleton must be **sized ≈ the real screen height** (e.g. the discover/roaster grids render ~the initial page count of skeleton cards) so a back/forward `scrollTop` restore (app-provider's layout effect runs on `pathname` flip, before content streams) isn't clamped against a too-short skeleton and lost. Acceptance includes a manual back/forward test on `/discover` and `/bean/[id]` scrolled down.

## F. Standalone polish
- `.mobile-top { padding-top: env(safe-area-inset-top); }` in `globals.css` so the mobile header clears the notch/Dynamic Island in `standalone` mode (it already uses `viewport-fit=cover` + bottom-nav safe-area).
- **Logged-out sign-in CTA in the mobile header** — the desktop sidebar has a "Sign in" button but `mobile-top` (app-provider) has none; add one when `currentUserId` is null, so an installed-app launch in guest mode has an obvious entry.

## G. Out of scope (stated for expectations)
- **Offline / service worker — deferred.** M5·C ships *installability* only; offline shows the browser error page. A service worker under the per-request nonce CSP needs a network-first / nonce-bypass strategy (cached HTML carries a stale nonce → CSP-fails on replay) — its own future milestone.

## Testing
- **Structural:** `manifest.ts` returns `display:"standalone"` + `start_url:"/"` + a `purpose:"maskable"` icon at a `/icons/*.png` path; `apple-icon.tsx` exports `force-static` + imports no DB; `theme-colors.ts` exports both; root `viewport` uses `THEME_LIGHT`; the four `loading.tsx` exist; `public/icons/{icon-192,icon-512,maskable-512}.png` exist (non-zero).
- **Build:** `next build` (no DB) emits prerendered `/icon`, `/apple-icon`, `/manifest.webmanifest`; the route table shows them `○`/static; no DB-connection error.
- **Live:** devtools Application → Manifest valid + installable (no errors), icons render incl. maskable (Application → maskable preview); Lighthouse PWA installability passes; `<link rel="manifest">` + theme-color meta present pre-JS (view-source); chrome tint correct light/dark; the three leaf skeletons + the app-shell skeleton show on throttled navigation and mirror the screens; **back/forward scroll position survives** the skeleton on `/discover` + a bean page; mobile sign-in CTA shows logged out; 0 CSP console violations.

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Manifest can't pin hashed `next/og` URLs | public/icons/ PNGs (stable) + generator script + Dockerfile `COPY public/` |
| satori can't resolve `var(--*)` / text | hex literals, text-free bean (D); apple-icon + generator both |
| theme-color duplicate-meta race / wrong hex | single static light value + shared `theme-colors.ts` true values; client effect unchanged-pattern |
| Skeleton breaks back/forward scroll restore | size skeletons ≈ screen height; back/forward acceptance test |
| Cold-open still shows a bare spinner | upgrade `(app)/loading.tsx` to the app-shell skeleton (the real win) |
| Icons missing in container | Dockerfile `COPY public/` |
