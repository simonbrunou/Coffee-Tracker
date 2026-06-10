# M3·D — Pagination & Server-Scoping (targeted, scoped & correct) — Design

**Date:** 2026-06-06
**Status:** Phased. **D·1 — Implemented (2026-06-06), PR #16**: denormalized author+bean fields on tasting/comment rows (cards render standalone), keyset cursor infra + composite `(created_at,id)` index, `getFeedPage` (Recent/Following keyset, Popular top-N), `loadMoreFeed` + `useLoadMore`, feed paginated — all **additive** (`getAppData` still returns globals; green throughout). Live spike passed (feed denormalized, 20 → Load more → 25, no dupes); 112 tests; security + code-quality reviews ship-ready (cross-tab race fixed). **D·2 — Pending**: slim `getAppData` (drop global beans/tastings/users), split route pages into server-fetch + client-render, scope journal/profile/discover/detail, retire the fidelity gate. (Plan §"Deferred to D·2".)
**Branch:** `feat/m3d-pagination` (off `main` @ `607d914`, the M3·C merge)
**Milestone:** M3·D, the last of M3's four sub-projects (A=CI ✅, B=Ops ✅, C=Migrations ✅, **D=Pagination**). Completes M3.
**Approach (owner-locked, post-council):** **Targeted "cap the feeds", scoped & correct.** Bound the unbounded global surfaces (home feed + Discover) with keyset cursor pagination, and slim `getAppData` so it no longer loads all tastings/beans/users — each screen reads exactly the server-scoped data it needs. **No data-fetching library**; keep the single-provider pattern, `useOptimistic`, and `revalidatePath`. This deliberately avoids the full-TanStack re-architecture's dual-cache "coexistence window" the council flagged as the central risk.
**Council:** the broader M3·D architecture was pressure-tested by a 3-member model-diverse council (TanStack/Next — Opus; pagination/SQL — Sonnet; contrarian/risk — Opus). This scoped-no-library approach is the contrarian's recommended path; the council's pagination-correctness findings (keyset, composite index, Popular top-N, cursor validation, scroll/animation) are folded in below.

---

## Goal

Stop `getAppData` from loading **all** roasters/users/beans/tastings into the client on every load. Bound the two genuinely unbounded global surfaces — the **home feed** (Recent/Following) and **Discover beans** — with keyset cursor pagination + "load more", and give every other screen a **server-scoped** query for exactly its data. Correct at any data scale, with no new dependency and no two-source-of-truth window.

## Context (the coupling that drives the scope)

Today `app/layout.tsx` → `getAppData()` loads ALL roasters/users/beans/tastings into the persistent `AppProvider` (`components/app-provider.tsx`), and every screen slices the in-memory arrays via `useData()`:
- **Feed** (`screens.tsx`): `D.TASTINGS` (Recent), follow-filtered (Following), `[...D.TASTINGS].sort(by likes)` (Popular).
- **Journal/Profile**: `D.TASTINGS.filter(t => t.userId === me)`, `D.shelf()`, saved/wishlist filters.
- **Discover**: `D.BEANS` list, `[...D.BEANS].sort(by avgRating).slice(0,3)` (trending), `D.ROASTERS`.
- **Bean/Roaster detail**: `D.TASTINGS.filter(beanId)`, `D.BEANS.filter(roasterId)`.
- **Author lookups**: `TastingCard` resolves the author from `D.users` by `userId`.

Because the global arrays are read by *several* screens, you cannot bound the feed's payload in isolation — removing the globals from `getAppData` forces each reader onto a scoped query. That is the (bounded) blast radius of this work.

Writes stay Server Actions + `useOptimistic` (provider) + `revalidatePath('/','layout')`. M1 already made counts (avg_rating, ratings, likes, commentsCount) **server-computed per row**, so they remain correct under `LIMIT`. The per-row redaction in `getBeans` and `likedByMe/savedByMe` subqueries are per-row and survive pagination.

---

## The load-bearing decisions

### Decision 1 — keyset cursor pagination (not offset)
For time-ordered lists (Recent, Following, Discover-beans, a bean's reviews), paginate by **keyset** on `(created_at, id)`:
```sql
WHERE ($cursor IS NULL OR (t.created_at, t.id) < ($cursorTs::timestamptz, $cursorId))
ORDER BY t.created_at DESC, t.id DESC
LIMIT $limit + 1   -- fetch one extra to compute nextCursor
```
Stable under inserts (a new top row never shifts a page); no duplicate/skip at boundaries because `id` (text PK) is a unique tiebreak. The `+1` row, if present, is dropped and its `(created_at,id)` becomes `nextCursor`.

### Decision 2 — composite index (Drizzle migration)
The current `tastings_created_idx (created_at desc)` is single-column and can't cleanly drive the `(created_at,id)` keyset on timestamp collisions. Add, **via a Drizzle migration** (edit `lib/db/schema.ts`, `drizzle-kit generate`):
- `tastings_created_id_idx (created_at DESC, id DESC)`
- `beans_created_id_idx (created_at DESC, id DESC)`
(Keep or drop the old single-column `*_created_idx`; the composite supersedes them — drop to avoid redundancy.) These ride on a **new** migration `drizzle/0001_*.sql`; the M3·C fidelity gate (which compares the unchanged `0000` baseline to the frozen `db/schema.sql`) is unaffected and still passes, and the CI **drift check** keeps `lib/db/schema.ts` in sync with the migrations.

### Decision 3 — Popular is top-N, not deep-paginated
"Popular" sorts by `likes` — a mutating value, so keyset cursors drift (dupes/skips). Ship Popular as a **single non-paginated top-N** (N=50) ordered by the live likes aggregate: `ORDER BY coalesce(l.likes,0) DESC, t.created_at DESC, t.id DESC LIMIT 50`. No "load more" on Popular. (Document the cap in the UI subtext.)

### Decision 4 — slim `getAppData`; each screen scopes its own data
`getAppData` stops returning global `beans`/`tastings`/`users`. The provider holds only the persistent-shell + bounded per-user data. Every list screen reads a scoped query (below). **One source of truth remains** (server → provider/page props); no client query cache, so the coexistence risk never arises.

### Decision 5 — denormalize the author into tasting rows
With the global `users` array gone, tasting rows must carry their author. Add `authorName`, `authorHandle`, `authorAvatar` to the `Tasting` shape and JOIN `users` in every tasting query. `TastingCard` reads the author from the row instead of `D.users`.

### Decision 6 — "load more" via Server Action, append to local state
No library. A `loadMoreFeed(tab, cursor)` / `loadMoreBeans(filter, cursor)` Server Action returns the next keyset page; the screen appends it to local `useState`. Page 1 is server-provided (SSR, no flash). On a write, `revalidatePath` refreshes page 1 and the appended pages reset — **accepted** (writes are infrequent; the user is typically at the top after a write). This also keeps scroll-restoration simple: a "load more" button (not infinite scroll) means no cross-navigation page cache to reconcile.

---

## Components

### 1. DB — composite indexes (`lib/db/schema.ts` + generated migration)
Add the two composite indexes (Decision 2); `drizzle-kit generate --name pagination_indexes`; `db:setup` applies it. Drop the superseded single-column created indexes.

### 2. Cursor helpers (`lib/pagination.ts`)
- `encodeCursor({ ts, id }): string` — base64 of JSON.
- `decodeCursor(s: string | null): { ts: string; id: string } | null` — parse + validate (ISO ts, non-empty id); return null / throw a 400-able error on garbage.
- `clampLimit(raw): number` — default 20, max 100.
- A small `Page<T>` shape: `{ rows: T[]; nextCursor: string | null }`.

### 3. Query layer (`lib/queries.ts`)
Refactor/add (all keep the existing compute-on-read + redaction + `likedByMe/savedByMe`, now with author JOIN):
- `getFeedPage(currentUserId, { tab, cursor, limit })` → Recent (all), Following (followed authors), Popular (top-N). Returns `Page<Tasting>` (Popular: `nextCursor` always null).
- `getDiscoverBeansPage(currentUserId, { filter, cursor, limit })` → catalog beans, keyset.
- `getTrendingBeans(currentUserId)` → top-N beans by avg_rating (its own query; replaces the client-side `.sort().slice(0,3)`).
- `getMyTastings(userId)`, `getMyShelf(userId)`, `getSavedTastings(userId)`, `getWishlistBeans(userId)` — bounded per-user (no pagination needed initially; cap defensively).
- `getBeanReviewsPage(beanId, currentUserId, { cursor, limit })`, `getRoasterBeansPage(roasterId, currentUserId, { cursor, limit })`.
- `getBean(id, currentUserId)`, `getRoaster(id)` — single-entity fetches for detail pages.
- `getAppData()` slims to: `roasters`, `currentUserId`, `me`, the four toggle ID sets, `myTastings`, `myShelf`, and the **feed page 1 (Recent)** for instant home SSR.

### 4. Server Actions (`app/actions.ts`)
- `loadMoreFeed(tab, cursor)` and `loadMoreBeans(filter, cursor)` and `loadMoreBeanReviews(beanId, cursor)` / `loadMoreRoasterBeans(roasterId, cursor)` — thin wrappers over the query layer, returning `Page<…>`. Validate inputs (tab/filter allowlist, cursor decode, limit clamp).
- Existing write actions unchanged (still `revalidatePath`).

### 5. Provider + data-context (`app-provider.tsx`, `data-context.tsx`)
- Drop global `beans`/`tastings`/`users` from `DataProvider`. Keep `roasters`, `currentUserId`, `me`, the toggle Sets, `myTastings`, `myShelf`. (The `useOptimistic` write-path now re-bases the per-user arrays + the feed page 1; the feed/discover appended pages live in screen-local state.)
- Keep scroll restoration (simpler now — list pages re-render from page 1 on navigation).

### 6. Screens
- **Feed** (`screens.tsx` + `app/page.tsx`): render server page 1; a `useLoadMore` hook appends `loadMoreFeed` pages; "Load more" button (hidden when `nextCursor === null`); Popular shows top-N with no button. Read author from the row.
- **Discover**: paginated beans + "Load more"; trending from `getTrendingBeans`; roasters from provider.
- **Journal/Profile**: read `myTastings`/`myShelf`/saved/wishlist scoped data.
- **Bean/Roaster detail** (`detail.tsx`, `app/bean/[id]`, `app/roaster/[id]`): single-entity fetch + paginated reviews/beans.
- **Animation fix**: `TastingCard`/bean-card `delay={i*50}` must not re-stagger appended pages — cap the delay (e.g. `Math.min(i,10)*50`) or only animate the first page. (Council finding.)

### 7. A reusable `useLoadMore<T>` hook (`components/use-load-more.ts`)
Holds `rows` (seeded from server page 1), `cursor`, `loading`; `loadMore()` calls the provided Server Action, appends, updates cursor. Re-seeds when the server page-1 prop changes (after `revalidatePath`).

---

## What is NOT in scope
- No TanStack/SWR or any data-fetching library.
- No infinite-scroll-on-scroll (explicit "Load more" button; simpler + scroll-safe).
- No deep pagination of Popular (top-N) or of the small per-user lists (bounded; capped defensively).
- M4/M5 work.

## Testing strategy
- **Unit (vitest):** `lib/pagination.ts` (encode/decode round-trip, reject garbage, clampLimit); allowlist/validation in the load-more actions.
- **Integration (real PG, the M3·C lane):** keyset correctness — seed >N rows, page through, assert no dupes/skips and stable order across a concurrent insert; Popular top-N ordering; per-row counts/redaction correct under `LIMIT`; the composite index is used (`EXPLAIN` contains the index) — optional.
- **Source/behavior:** the existing source-grep tests on `getBeans/getTastings` will change (queries gain keyset/author) — update them to assert the new shape (author JOIN present; keyset clause present) or convert to integration assertions.
- **Live (controller):** seed a throwaway dataset (>N brews/beans), load the feed → page 1 + "Load more" reveals older brews, no dupes; Following/Popular tabs; Discover paginates + trending shows; journal shows the user's own brews (scoped); a bean detail paginates reviews; log a brew → appears at top of feed + journal (revalidate); confirm the network payload of the initial load is bounded (not all rows).
- **Gate:** `tsc` + `npm test` (both lanes) + `eslint` + `build` + CI green.

## Risks / open items
- **`revalidatePath` resets appended pages.** Accepted (infrequent writes; user at top post-write). Documented in the `useLoadMore` hook.
- **Author denormalization** touches the `Tasting` type + every tasting query + `TastingCard` — mechanical but broad; the type change will surface all call sites via `tsc`.
- **Scope size.** This is a medium-large single PR (getAppData reshape + query layer + provider + 5 screens + index + types). If it proves too large mid-build, split into "feed+index+cursor foundation" then "discover + per-user scoping + slim getAppData".
- **Old source-grep tests** assert the pre-pagination SQL; they must be updated in lockstep.

## File-change summary
**Create:** `lib/pagination.ts`, `components/use-load-more.ts`, integration tests under `test/integration/`, a Drizzle migration `drizzle/NNNN_pagination_indexes.sql`.
**Modify:** `lib/db/schema.ts` (composite indexes), `lib/queries.ts` (scoped + paginated queries, author JOIN, slim getAppData), `lib/types.ts` (Tasting author fields; `Page<T>`), `app/actions.ts` (load-more actions), `components/app-provider.tsx` + `components/data-context.tsx` (slim provider), `components/screens.tsx` (feed/discover/journal/profile), `components/detail.tsx` (+ `app/bean/[id]`, `app/roaster/[id]`), `components/cards.tsx` (author from row; animation cap), affected tests.
**Unchanged on purpose:** the write actions' ownership guards + validation; `lib/db.ts`; auth.
