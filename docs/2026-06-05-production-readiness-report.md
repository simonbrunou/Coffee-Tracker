# Cortado — Production-Readiness Report

_Lead-engineer synthesis of a multi-agent audit. Branch `main` @ 2026-06-05. All claims cite `file:line`; the load-bearing ones were re-verified directly against the source._

---

## 1. Executive summary

Cortado is a **high-fidelity prototype with a genuinely well-built spine but a large hollow shell**. The parts that exist are done right: Auth.js v5 (Credentials + Google + GitHub), bcrypt cost-12, transactional OAuth provisioning, a `DUMMY_HASH` anti-enumeration path, and — most importantly — **every write Server Action (`logBrew`, `addBag`, `toggleLike`) is auth-gated via `requireUserId` and carries real per-user / per-row ownership guards in parameterized SQL** (e.g. `logBrew`'s `from beans where id=$3 and user_id=$2`, `app/actions.ts:20`). There is **no IDOR, no SQL injection, no client-leaked secret**, and `getBeans` redacts private bag fields in SQL. That core is the best evidence this can become a real product.

It is **not close to a public launch** (overall readiness: **alpha**). Three classes of blocker dominate:

1. **Data integrity is broken.** The *only* `UPDATE` in the entire app is the `session_version` bump (`lib/users-repo.ts:76`). No action ever touches a denormalized counter, so every rating, like count, "Trending," "Popular" sort, and profile stat is frozen at its seed value plus the viewer's own optimistic `+1`. This produces visible **same-page contradictions** ("3 brews logged" above a ratings line that shows 0).
2. **Core product is faked.** There is no comments system, no follow system, and no save/bookmark persistence — yet the UI ships Follow, "Want to try," Save, Comment, Profile "Edit," and Feed "Following"/"Nearby" tabs as fully-styled controls that toggle local state and silently reset on reload, or do nothing at all.
3. **Production infrastructure is essentially absent.** No `error.tsx`/`global-error.tsx`/`not-found.tsx`/`loading.tsx` anywhere (a DB hiccup in the unguarded `getAppData` crashes the whole shell), no `.github` CI (36 passing tests gate nothing), `next lint` is a phantom gate (ESLint isn't installed), no migration system (`db:setup` destructively `DROP`s all tables), `getAppData` ships the **entire database** with no `LIMIT` into every client on every load, plus no robots/sitemap/OG, no legal pages, no error feedback on failed login, and no real images.

**Fastest credible path:** fix the write path (M1) → resolve the faked social layer (M2) → stand up ops/CI/deploy (M3) → auth hardening & compliance (M4) → a11y/SEO/polish (M5).

---

## 2. What's real vs. placeholder

| Feature | Area | Status | Note |
|---|---|---|---|
| Email/password sign-in | Auth | **real** | `auth.ts:40-57` + bcrypt; but login page swallows `?error=` (no feedback) |
| Google / GitHub sign-in | Auth | **partial** | Providers + transactional provisioning real; secrets blank in `.env.example`; accounts never linked across providers |
| Sign-up | Auth | **real** | `auth-actions.ts:14-40` rate-limit + validate + bcrypt + conflict mapping |
| Sign-out | Auth | **real** | `app-provider.tsx:243-245`; does NOT bump `session_version` |
| Password reset | Auth | **missing** | No route, no token table, no email — forgotten password = permanent lockout |
| Session revocation | Auth | **broken** | `bumpSessionVersion` built + checked on every write but **zero callers** — dead code |
| Log a brew | Core write | **real** | Auth + ownership-guarded; but never bumps counters; fire-and-forget success panel |
| Add a bag | Core write | **partial** | Works, but **no server-side validation**; `scaScore` unclamped; fire-and-forget |
| Like | Social | **partial** | Persists join-table row; **never updates `tastings.likes`** → count wrong everywhere |
| Comment | Social | **missing** | `cards.tsx:140` no onClick; bare int, no table, no UI |
| Follow user | Social | **missing** | Static int counts; no table, no action, no user-follow button |
| Follow roaster / "Want to try" / Save | Social | **placeholder** | Local `useState` only; resets on reload; no tables |
| Search (beans) | Discovery | **real** | `screens.tsx:460-465`, URL-synced `?q=`; client-side, not paginated |
| Search (roasters tab) | Discovery | **broken** | Query never applied; search box stays visible — looks broken |
| Discover / Trending | Discovery | **partial** | "Trending this week" = top-3 by frozen `avgRating`, no time window |
| Feed | Home | **partial** | Real data; "Following"/"Nearby" inert; copy claims "people you follow" |
| Journal | Home | **partial** | Real per-user data; no empty state; no pagination |
| Profile view | Profile | **partial** | Identity + tastings live; Tastings/Followers/Following stats static |
| Profile edit | Profile | **missing** | `detail.tsx:484-486` Edit button has no onClick; no action |
| Bean / roaster detail | Detail | **partial** | Real reads; ratings/radar/brew-count mutually inconsistent; grey placeholders |
| Flavor wheel / SCA | Forms | **real** | Selection persists into `addBag`; a11y gaps on chips |
| Dark mode | Shell | **real** | next-themes + JS theme-color sync |
| Images / photos | Media | **placeholder** | Grey `<Placeholder>` boxes; no column, no upload, no `next/image` |
| Notifications | Shell | **placeholder** | Static decorative nav-dot; no model/page/bell |
| App-shell navigation | Shell | **real** | Sidebar + bottom nav + scroll restoration; uses `router.push`, not `<Link>` |

---

## 3. Prioritized backlog (deduped across all agents)

### P0 — Blocks launch

| # | Item | Cat | Effort | Evidence |
|---|---|---|---|---|
| 1 | **Maintain denormalized counters on write** (`beans.ratings/avg_rating`, `users.tastings`, `tastings.likes`) | correctness | M | Zero `UPDATE` in `app/actions.ts`; only app `UPDATE` is `users-repo.ts:76`. `logBrew` inserts `likes/comments=0` (`actions.ts:19`); `toggleLike` writes only the join table (`actions.ts:70-80`). Displayed/sorted at `cards.tsx:137`, `screens.tsx:78,466`, `detail.tsx:167-173,499`. |
| 2 | **Add `error.tsx`/`global-error.tsx`/`not-found.tsx` + guard `getAppData`** | ops | S | No such files exist (confirmed). `layout.tsx:11` force-dynamic + `:46` awaits unguarded `getAppData` (`queries.ts:72-82`, no try/catch). |
| 3 | **Stand up CI** (tsc + tests on PR/push, branch protection) | ci-cd | S | No `.github` dir (confirmed). 36 tests + clean tsc gate nothing; `.claude/hooks` are agent hooks, not git/CI. |
| 4 | **Adopt a migration system; stop destructive `db:setup`** | ops | L | `schema.sql:8-13` `DROP TABLE CASCADE`; `db:setup`/`db:reset` both run it; `--reset` flag silently ignored (`db-setup.ts` never reads argv). |
| 5 | **Prod DB/env hardening** (pool SSL+timeouts, prod pool caching, fail-fast env validation) | ops | M | `db.ts:9-18` `new Pool({connectionString, max:5})` no ssl/timeouts; `AUTH_SECRET` unvalidated; hardcoded localhost DSN fallback. |
| 6 | **Paginate & server-scope data; stop shipping the whole DB to every client** | perf | L | `queries.ts:21-82` no `LIMIT`/`OFFSET` (confirmed); whole DB into client `DataProvider`; per-card `.find()` → O(n²) feed (`cards.tsx:24-32`). Also leaks all users/tastings to every client. |
| 7 | **Show error feedback on failed login** | ux | S | `app/login/page.tsx` never reads `searchParams.error` (confirmed); Auth.js redirects to `?error=CredentialsSignin`. Mirror `signup-form.tsx:31-33`. |
| 8 | **Legal pages (privacy, terms) + footer** | compliance | M | grep returns only Radix `DialogFooter`. Google OAuth verification requires a published privacy policy URL. |
| 9 | **SEO baseline** (per-page metadata, `metadataBase`, `robots.ts`, `sitemap.ts`, OG/twitter) | seo | M | `layout.tsx:30-34` only title/description; all route pages `"use client"`; no robots/sitemap/metadataBase. |

> Note: items 1, 2, 6 were independently flagged by 4–5 of the 6 subsystem agents and both cross-cutting performance + UX audits — these are the consensus blockers.

### P1 — Must fix before a real public launch

| Item | Cat | Effort | Evidence |
|---|---|---|---|
| Wire `bumpSessionVersion` into logout-all / password-change / delete | security | M | `users-repo.ts:75-77` zero app callers (confirmed); checked at `auth.ts:19`; `signOutAction` only clears cookie. |
| Move rate limiter to a shared store (Postgres/Redis) | security | M | `rate-limit.ts:6` module Map, "PER-INSTANCE ONLY"; gates login/signup only. |
| Server-side validation on write actions (Zod) — trim/require, length & array caps, `scaScore` clamp `[80,92]` | security | M | `actions.ts:30-67` no checks; only client guard `bag-form.tsx:53`; `scaScore` only `Number.isFinite` (`actions.ts:35`). |
| Build **or remove** the faked social layer (follow, comment, save/wishlist) | feature-gap | L | No follows/comments/saves tables; `cards.tsx:28,140,142-155`, `detail.tsx:52,186-192,380,408`. |
| Build profile edit (`updateProfile` action + form) or remove Edit button | feature-gap | M | `detail.tsx:484-486` no onClick; no edit route/action. |
| Fix "Following"/"Nearby" feed tabs + misleading "people you follow" copy | feature-gap | S | `screens.tsx:76-78,84`; default filter "Following" (`page.tsx:10`). |
| Empty states (Feed/Journal/Profile) + new-user onboarding | ux | M | `screens.tsx:110-121,282-327`, `detail.tsx:509-548` no empty branch; `registerUser` redirects to `/`. |
| Security headers (CSP/HSTS/X-Frame-Options/nosniff) + HTTPS origin | security | S | `next.config.ts:1-9` no `headers()`; Secure cookies depend on HTTPS. |
| Observability + `/health` + deploy config + node pin + backups | ops | M | No monitoring/health/Dockerfile/vercel/CI-CD/backups. |
| `loading.tsx` skeletons + in-flight submit state; fix fire-and-forget success panels | ux | M | No `loading.tsx`; `log-sheet.tsx:109-119` & `bag-form.tsx:70-74` `setDone(true)` without awaiting the action. |
| Install real lint (eslint + eslint-config-next), add `typecheck` script, wire into CI | ci-cd | M | `package.json:10` `next lint` but no eslint installed (confirmed) → interactive wizard. |
| Nav via `<Link>` not `router.push`; visible `:focus-visible` on hand-rolled controls | a11y | M | `app-provider.tsx:218,236,267,279,285`; `globals.css:151` button reset, no focus rule (confirmed). |
| Tests for `addBag`/`toggleLike` + integration tests vs real Postgres | ci-cd | L | No tests reference them; redaction verified by regex over source, not query results. |
| Per-page OG image + PWA manifest + favicon/apple-icon set | seo | S | Only `app/icon.svg`; no `public/`, manifest, apple-icon, opengraph-image. |

### P2 — Important, not strictly blocking

- **Edit/delete bags & brews; decrement `remaining`** (`actions.ts:47` hard-sets `remaining=1`, shown as a ring but never decremented).
- **`revalidatePath` after writes** (zero in repo; corrected counts won't surface without manual reload).
- **FK `ON DELETE CASCADE` on `tastings.user_id` & `likes.user_id`; missing indexes; delete-account path** (`schema.sql:87,102` vs `:48,80`; no GDPR erasure).
- **Real image strategy** (columns + storage/CDN + `next/image`; render `users.image`).
- **ARIA radiogroup / `aria-pressed`** on toggle/flavor/color chips (`log-sheet.tsx:212-227`, `flavor-wheel.tsx:124-147`).
- **`prefers-reduced-motion` + skip-to-content + `aria-hidden` on decorative SVGs + `color-scheme`**.
- **Validate numeric brew params** (`'abc'->'abcg'` persists; `schema.sql:91-93` text columns).
- **Real timestamps from `created_at`** instead of literal `'now'` (`actions.ts:19`).
- **Coverage reporting + e2e (Playwright) + CD pipeline**.

### P3 — Polish / nice-to-have

- OAuth cross-provider account linking UX; remove dead UI primitives (`tabs`/`separator`/`toggle-group`); `optimizePackageImports`; configurable session length / remember-me (`auth.ts:34` 30-min rolling); i18n scaffolding (or accept English-only).

---

## 4. Roadmap to launch

**M1 — Data integrity & core write path.** Make every number true and every write durable/validated. Counters in-transaction (`withTransaction` already exists, `db.ts:46`), Zod validation, in-flight/awaited submit, `revalidatePath`, real timestamps, edit/delete, numeric param parsing.

**M2 — Resolve the faked social/product layer.** Build or visibly remove Follow / Comment / Save / "Want to try"; ship profile edit; fix the Feed tabs + copy; add empty states + onboarding; fix Roasters-tab search; real images.

**M3 — Ops, data access & CI/CD.** Error boundaries + guarded `getAppData`; CI (tsc+tests, branch protection) + real lint + typecheck script; migration system; DB/env/pool hardening; pagination & server-scoping; observability/health/deploy/backups; mutation + integration + e2e tests; FK cascades, indexes, delete-account.

**M4 — Auth hardening & compliance.** Login error feedback; wire `bumpSessionVersion`; shared rate limiter; security headers; legal pages; password reset; OAuth account linking.

**M5 — SEO, a11y & launch polish.** Per-page metadata/robots/sitemap/OG; manifest/favicons; `<Link>` + focus-visible; ARIA radiogroups; reduced-motion/skip-link/aria-hidden/color-scheme; cleanup; i18n.

---

## 5. Bottom line

The **authorization and write-ownership model is production-grade** — that is the hard part and it's already right. What remains is largely **filling in the deliberately-left placeholders** (counters, social features, images) and **building the production envelope** (error handling, CI, migrations, pagination, SEO, legal) that a prototype never needed. None of it is research-grade hard, but it is broad: roughly **9 P0 + 14 P1** items stand between the current alpha and a defensible public launch. Do **not** ship until at least M1–M3 are complete; M1 alone is what stops the product from visibly lying to its users.