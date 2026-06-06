# M3·D·2 — Slim getAppData + Per-Screen Server-Scoping — Design

**Date:** 2026-06-06
**Status:** Implemented (2026-06-06), PR #17. Built as a 3-cut (additive query layer → atomic flip → cleanup). `getAppData` no longer ships global beans/tastings/users; discover/bean/roaster are server-fetch + client-render; journal/profile/log-sheet/comment-thread read the provider's bounded per-user data. Live spike PASSED — `/` payload dropped from all 30 brews to feed page-1 (20); bean-detail server page renders 10 paginated reviews denormalized. 119 tests; security + code-quality reviews ship-ready (one unused-export Minor fixed). Completes M3·D and M3.
**Branch:** `feat/m3d2-scope-getappdata` (off `main` @ `ddd426f`, the M3·D·1 merge)
**Milestone:** M3·D, **phase 2 of 2** (completes M3·D and M3). D·1 (PR #16) made rows self-sufficient + paginated the feed, additively. D·2 removes the unbounded global arrays — the actual payload-reduction win.
**Approach:** the M3·D approach is locked (targeted, **no data-fetching library**, server-fetch pages + client render). The 3-member M3·D council pressure-tested this whole architecture and the D·1 adversarial review mapped D·2's hard parts; this spec executes that analysis — **no new council round** (D·2 is a strict subset of what was reviewed).

---

## Goal

Stop `getAppData` from loading **all** beans/tastings/users on every request. Each screen fetches exactly its server-scoped data; the persistent provider keeps only shell + bounded per-user state. After D·2, the initial payload is bounded regardless of total data size — the M3·D objective.

## What D·1 already did (so D·2 is unblocked)
- Tasting/comment rows carry denormalized author + bean display fields → cards/comments render standalone (no global lookup). **This is what makes removing the globals safe.**
- Keyset `getFeedPage` + `useLoadMore` + composite index; the feed already self-fetches.

## The core change: `"use client"` pages → server-fetch + client-render

Today every route page (`app/{page,discover,journal,profile,bean/[id],roaster/[id]}/page.tsx`) is `"use client"` and reads globals via `useData()`. D·2 converts each into a **server component** that fetches its scoped data and renders a **client** screen child that receives the data as props and still uses `useShell()` for toggles/handlers. The persistent `AppProvider` stays in the layout (shell state survives navigation); only the page *bodies* (children) re-render per navigation with bounded data — which is the point.

---

## Decisions

### Decision 1 — slim `getAppData`
Returns: `roasters`, `currentUserId`, `me`, the four toggle ID Sets, `myTastings`, `myShelf`, and `feed` (Recent page 1). **Drops**: global `beans`, `tastings`, `users`, `followingTastings`. `AppData` shrinks accordingly.

### Decision 2 — `me` via `getUserById` with aggregates (review fix)
ProfileScreen reads `me.tastings`/`me.followers`/`me.following`. `getUserById(id, viewerId)` must reproduce `getUsers`' aggregate columns (the `count(*)` joins + `followedByMe`), not a bare users row.

### Decision 3 — per-screen scoped queries (mostly added in D·1; wire the rest)
- Discover: `getDiscoverBeansPage` (keyset) + `getTrendingBeans` (top-N) + roasters (from provider).
- Journal: `myTastings` + `myShelf` (provider, bounded) + `getSavedTastings(userId)` + `getWishlistBeans(userId)` (server-fetched in the journal page).
- Profile: `me` + `myTastings`.
- Bean detail: `getBean(id, viewer)` + `getBeanReviewsPage(id, viewer, cursor)`.
- Roaster detail: `getRoaster(id)` + `getRoasterBeansPage(id, viewer, cursor)`.
Discover beans + detail reviews/beans paginate via `useLoadMore` (load-more actions).

### Decision 4 — slim the provider
`DataProvider`/`DataApi` drop `BEANS`/`TASTINGS`/`USERS`/`FOLLOWING` and the `bean()`/`user()` helpers (no longer have a global to search). Keep `ROASTERS`, `roaster()`, `currentUserId`, `me`, `myTastings`, `myShelf`, `shelf()` (→ `myShelf`), `feed`, the static `FLAVORS`/`BREW_METHODS`/etc.

### Decision 5 — write-path under slimming
- **Toggle Sets stay in the provider, optimistic + instant** (likes/follows/saves/wishlist — the frequent actions; unchanged from D·1).
- **List writes (log/delete brew, add/edit/delete bag)**: the provider no longer holds the global arrays, so optimism for *list* membership moves to per-screen state or relies on `revalidatePath` re-rendering the (now bounded) server page. Accept revalidate-driven list updates for these less-frequent actions (documented tradeoff from the council). `myTastings`/`myShelf` stay `useOptimistic` in the provider for the journal/profile instant-update path.
- **LogSheet preset (review fix)**: `handleAddBag`'s "& continue → brew" hand-off must pass the new `Bean` (returned by `addBag`) **directly** to the brew preset, not look it up from a global `beans` array. The LogSheet's shelf/preset resolution reads `myShelf` (provider) + the directly-passed bean.

### Decision 6 — retire the fidelity gate
`db/schema.sql` is now meaningfully behind the Drizzle migrations (0001 indexes aren't in it). The M3·C fidelity gate (`test/integration/schema-fidelity.test.ts`, which compares the 0000 baseline to `db/schema.sql`) has served its one-time purpose. **Remove it**, and update `db/schema.sql`'s header to "historical pre-Drizzle snapshot; superseded by drizzle/ — do not use." The **CI drift check** remains the ongoing schema↔migration guard; the constraint smoke tests stay.

---

## Components / file changes
- `lib/queries.ts`: add `getUserById` (aggregates), `getDiscoverBeansPage`, `getTrendingBeans`, `getMyShelf`, `getSavedTastings`, `getWishlistBeans`, `getBean`, `getRoaster`, `getBeanReviewsPage`, `getRoasterBeansPage`; slim `getAppData`. Remove now-unused `getUsers`/`getBeans`/`getTastings`/`getFollowingTastings` (or keep any still referenced) — `tsc` will flag.
- `app/actions.ts`: `loadMoreBeans`, `loadMoreBeanReviews`, `loadMoreRoasterBeans` (validated).
- `lib/types.ts`: slim `AppData` (drop globals; add `me`, `myTastings`, `myShelf`).
- `components/data-context.tsx` + `app-provider.tsx`: slim provider; rework optimistic arrays to `myTastings`/`myShelf`; fix the addBag hand-off.
- `app/{discover,journal,profile,bean/[id],roaster/[id]}/page.tsx`: convert to server components fetching scoped data + rendering client screen children. `app/page.tsx` already feeds from `getAppData.feed`.
- `components/screens.tsx` + `detail.tsx`: screens receive scoped data as props (instead of `useData()` globals) + use `useLoadMore` for the paginated lists.
- `components/log-sheet.tsx`: preset/shelf resolution off `myShelf` + the directly-passed new bean.
- Remove `test/integration/schema-fidelity.test.ts`; update `db/schema.sql` header; update/retire source-grep tests that referenced removed functions.

## Testing
- **Unit:** validation for the new load-more actions; update/remove source-grep tests for removed query functions.
- **Integration (real PG):** scoped-query correctness (a user's `myTastings` returns only theirs; `getSavedTastings` returns saved; redaction in `getBean`; `getUserById` aggregates correct); keyset for discover/detail lists.
- **Live (controller):** the **payload-reduction proof** — DevTools Network: the initial document/RSC payload carries bounded data (page-1 + the user's own), NOT all rows; each screen (feed/discover/journal/profile/bean/roaster) renders + paginates; log a brew → appears (revalidate); the addBag "& continue" hand-off works; toggles instant.
- **Gate:** `tsc` + `npm test` (both lanes) + `eslint` + `build` + CI green.

## Risks / open items
- **Scope size** — this touches the provider + ~5 screens + ~5 pages + the query layer. If it proves too large for one PR, split by entity (tastings-readers together, then beans-readers) per the council's entity-cut advice. `tsc` will be red across the tree until the page/screen conversions complete (the unavoidable cost of removing shared globals) — commit at the green boundary once screens are converted.
- **Write-path optimism** for list membership is reduced to revalidate-driven (accepted; toggles stay instant).
- **Persistent provider + server pages**: confirm a client-provider layout can host server-component page children (it can in the App Router — client components render server children passed as `children`).

## What is NOT in scope
- No data-fetching library (still). No infinite-scroll-on-scroll (explicit Load more). M4/M5.
