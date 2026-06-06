# M3·D·2 — Slim getAppData + Per-Screen Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / subagent-driven-development. Steps use `- [ ]`.

**Goal:** Remove the unbounded global `beans`/`tastings`/`users`/`followingTastings` arrays from `getAppData`; each screen reads bounded per-user data from the provider or server-fetches its scoped/paginated data. Completes M3·D.

**Key simplification (from the usage map):** roasters stay in the provider (all `D.roaster()` keep working); journal + profile stay client components reading bounded per-user lists from the provider; only **discover, bean/[id], roaster/[id]** (the unbounded lists) convert to server-fetch + client-render.

**Spec:** `docs/superpowers/specs/2026-06-06-m3d2-scope-getappdata-design.md`
**Branch:** `feat/m3d2-scope-getappdata` (off `main` @ `ddd426f`).

**New `getAppData` shape:** `{ roasters, currentUserId, me, followedUserIds, followedRoasterIds, savedTastingIds, wishedBeanIds, myTastings, myShelf, savedTastings, wishlistBeans, feed }`. **Dropped:** `beans`, `tastings`, `users`, `followingTastings`.

**Usage map being migrated (grep-confirmed):**
- `screens.tsx`: 194 `D.TASTINGS`→`D.myTastings`; 197 `D.shelf()`→`D.myShelf`/`D.shelf()`; 200 saved→`D.savedTastings`; 201 wishlist→`D.wishlistBeans`; 402 `D.bean`→denormalized row; 565 `D.BEANS`→server prop; 571 trending→server prop; 454/707 `D.roaster` stay.
- `detail.tsx`: 57 `D.bean`→`getBean` prop; 64 reviews→server prop+loadMore; 415 `D.roaster` stays (or `getRoaster`); 418 `D.BEANS.filter`→server prop+loadMore; 492 `D.user`→`D.me`; 493 `D.TASTINGS`→`D.myTastings`; 496 `D.bean`→denormalized row.
- `comment-thread.tsx`: `D.user(currentUserId)`→`D.me`.
- `log-sheet.tsx`: 112 `D.shelf()`→`D.myShelf`; 128 `D.bean`→`D.myShelf` + the directly-passed new bean; 214 `D.roaster` stays.

**Gate (per task):** `npm run typecheck`; `npm test` (both lanes when DB present). NOTE: tsc is necessarily red across screens/pages from the type change (Task 2) until the screen/page conversions land (Tasks 5–7); commit at the green boundary after Task 7.

---

### Task 1: Scoped + paginated queries (`lib/queries.ts`)
Add (reuse `TASTING_SELECT_COLS`/`TASTING_JOINS`, `BEAN_COLS`, `$1`=viewer):
- `getUserById(currentUserId, id)` — the `getUsers` SELECT (aggregate tastings/followers/following ::int + followedByMe) with `where u.id = $2`. Returns `User | null`.
- `getMyShelf(userId)` — `BEAN_COLS` `where user_id = $1 and owned = true order by created_at desc` (cap 200).
- `getSavedTastings(userId)` — `TASTING_SELECT_COLS` + `join tasting_saves sv on sv.tasting_id=t.id and sv.user_id=$1 ${TASTING_JOINS} order by sv.created_at desc` (cap 200).
- `getWishlistBeans(currentUserId)` — `BEAN_COLS` + `join bean_wishlist w on w.bean_id=beans.id and w.user_id=$1` (cap 200).
- `getDiscoverBeansPage(currentUserId, {cursor, limit})` — the `getBeans` SELECT + `where ($2::timestamptz is null or (beans.created_at, beans.id) < ($2,$3)) order by beans.created_at desc, beans.id desc limit+1`; `toPage`.
- `getTrendingBeans(currentUserId)` — the `getBeans` SELECT `order by avg_rating desc nulls last, ratings desc, beans.id desc limit 12` (its own query).
- `getBean(currentUserId, id)` — the `getBeans` SELECT `where beans.id = $2 limit 1`. Returns `Bean | null`.
- `getRoaster(id)` — single roaster (reuse `getRoasters` shape `where r.id = $2`, viewer `$1`). Returns `Roaster | null`.
- `getBeanReviewsPage(currentUserId, beanId, {cursor, limit})` — `TASTING_SELECT_COLS` `where t.bean_id = $2 and ($3 keyset) order by … limit+1`; `toPage`. (Params: $1 viewer, $2 beanId, $3 ts, $4 id, $5 limit.)
- `getRoasterBeansPage(currentUserId, roasterId, {cursor, limit})` — `getBeans` SELECT `where beans.roaster_id = $2 and ($3 keyset) …`; `toPage`.

- [ ] Implement each with an integration test (`test/integration/scoped-queries.test.ts`): seed a user/bean/tastings/saves/wishlist; assert `getMyShelf`/`getSavedTastings`/`getWishlistBeans` return only the user's; `getUserById` aggregates; redaction in `getBean`; keyset for the *Page queries. Run green. Commit `feat(m3d2): scoped + paginated query layer`.

---

### Task 2: Slim `getAppData` + `AppData` type
- [ ] **Step 1:** `getAppData` (queries.ts): replace the global Promise.all with the slim set:
```ts
const currentUserId = await getCurrentUserId();
const [roasters, feed] = await Promise.all([getRoasters(currentUserId), getFeedPage(currentUserId, { tab: "Recent" })]);
const me = currentUserId ? await getUserById(currentUserId, currentUserId) : null;
const [myTastings, myShelf, savedTastings, wishlistBeans] = currentUserId
  ? await Promise.all([getMyTastings(currentUserId), getMyShelf(currentUserId), getSavedTastings(currentUserId), getWishlistBeans(currentUserId)])
  : [[], [], [], []];
const [followedUserIds, followedRoasterIds, savedTastingIds, wishedBeanIds] = currentUserId
  ? await Promise.all([...existing followedIds calls...]) : [[], [], [], []];
return { roasters, currentUserId, me, myTastings, myShelf, savedTastings, wishlistBeans, feed,
         followedUserIds, followedRoasterIds, savedTastingIds, wishedBeanIds };
```
(Add `getMyTastings(userId)` if not present: `TASTING_SELECT_COLS where t.user_id=$1 order by created_at desc` cap 200.)
- [ ] **Step 2:** `lib/types.ts` `AppData`: drop `beans`/`tastings`/`users`/`followingTastings`; add `me: User | null`, `myTastings: Tasting[]`, `myShelf: Bean[]`, `savedTastings: Tasting[]`, `wishlistBeans: Bean[]` (keep `feed`).
- [ ] **Step 3:** Remove now-unused `getBeans`/`getUsers`/`getTastings`/`getFollowingTastings` IF unreferenced after the screen edits (defer deletion to Task 8 to avoid mid-stream churn). `npm run typecheck` — red across provider/screens (expected). Commit deferred to Task 7 boundary.

---

### Task 3: Slim the provider (`data-context.tsx`, `app-provider.tsx`)
- [ ] `DataApi`/`DataProvider`: drop `BEANS`/`TASTINGS`/`USERS`/`FOLLOWING` + `bean()`/`user()`. Add `me: User | null`, `myTastings`, `myShelf`, `savedTastings`, `wishlistBeans`. Keep `ROASTERS`/`roaster()`, `currentUserId`, `feed`, `shelf()` (→ returns `myShelf`), statics.
- [ ] `app-provider.tsx`: destructure `me`/`myTastings`/`myShelf`/`savedTastings`/`wishlistBeans` from `initialData`; pass to `DataProvider`. Fix `const me = users.find(...)` (line ~160) → `initialData.me`. Move the `useOptimistic` arrays from `beans`/`tastings` to `myShelf`/`myTastings`; update `handleAddBag`/`handleDeleteBrew`/`handleDeleteBag` to operate on those + pass the new bean directly to the brew preset (no global lookup). `likes` Set seed: from `initialData.feed.rows` + `myTastings` (filter `likedByMe`).
- [ ] tsc still red in screens (Task 5+). No commit yet.

---

### Task 4: Load-more actions (`app/actions.ts`)
- [ ] Add `loadMoreBeans(cursor)` → `getDiscoverBeansPage`; `loadMoreBeanReviews(beanId, cursor)` → `getBeanReviewsPage`; `loadMoreRoasterBeans(roasterId, cursor)` → `getRoasterBeansPage`. Each gets viewer from `getCurrentUserId()`, validates cursor via the query's decode. Validation test for the bean-id-bearing ones. (No commit yet — part of the Task 7 green boundary, or commit standalone since actions are additive.)

---

### Task 5: Journal + Profile screens (stay client; read provider)
- [ ] `screens.tsx` JournalScreen: 194 `D.TASTINGS.filter`→`D.myTastings`; 197 `D.shelf()` (now `myShelf`); 200 `D.savedTastings` (provider); 201 `D.wishlistBeans` (provider); 402 `D.bean(t.beanId)`→ read denormalized fields off the tasting row (the grid card). 454/707 `D.roaster` unchanged.
- [ ] `detail.tsx` ProfileScreen: 492 `D.user(currentUserId)`→`D.me`; 493 `D.TASTINGS.filter`→`D.myTastings`; 496 `D.bean`→denormalized row.
- [ ] `comment-thread.tsx`: `D.user(currentUserId)`→`D.me` (for the optimistic comment author).
- [ ] `log-sheet.tsx`: 112 `D.shelf()`→`D.myShelf`; 128 preset bean from `D.myShelf.find` + the directly-passed new bean (via a new optional prop the AppProvider passes after addBag); 214 `D.roaster` unchanged.

---

### Task 6: Discover, Bean, Roaster — server-fetch + client-render
For each, convert `app/<route>/page.tsx` to an async **server component** that fetches scoped data and renders a small **client wrapper** (new `*-client.tsx`) that uses `useShell()` + `useLoadMore` and passes data to the screen.
- [ ] **Discover** (`app/discover/page.tsx`): server-fetch `getDiscoverBeansPage(viewer,{})` + `getTrendingBeans(viewer)`; pass `initialBeans`/`trending` to a `DiscoverClient` (reads `q` from `searchParams` prop) → `DiscoverScreen`. `DiscoverScreen`: 565 `D.BEANS`→`useLoadMore(initialBeans, loadMoreBeans)` rows + "Load more"; 571 trending→prop; roasters tab from `D.ROASTERS`.
- [ ] **Bean** (`app/bean/[id]/page.tsx`): server-fetch `getBean(viewer,id)` + `getBeanReviewsPage(viewer,id,{})`; pass to `BeanClient`→`BeanDetail`. `BeanDetail`: 57 `D.bean`→`bean` prop (404 if null via `notFound()`); 64 reviews→`useLoadMore(initialReviews, c=>loadMoreBeanReviews(id,c))`; roaster via `D.roaster` (provider) or include in `getBean`.
- [ ] **Roaster** (`app/roaster/[id]/page.tsx`): server-fetch `getRoaster(viewer,id)` + `getRoasterBeansPage(viewer,id,{})`; pass to `RoasterClient`→`RoasterDetail`. `RoasterDetail`: 415 roaster→prop (or `D.roaster`); 418 `D.BEANS.filter`→`useLoadMore`.
- [ ] `npm run typecheck` + `npm run build` clean (all global reads gone). 

---

### Task 7: Green boundary — commit the cut
- [ ] With Tasks 1–6 done, `npm run typecheck && npm run lint && npm test && npm run build` all green. Commit `feat(m3d2): slim getAppData; scope journal/profile (provider) + discover/bean/roaster (server-fetch)`.

---

### Task 8: Retire fidelity gate + cleanup + tests
- [ ] Remove `test/integration/schema-fidelity.test.ts`. Update `db/schema.sql` header → "Historical pre-Drizzle snapshot; superseded by drizzle/. Do not use." Keep the constraint smoke tests + CI drift check.
- [ ] Delete the now-unused `getBeans`/`getUsers`/`getTastings`/`getFollowingTastings` (confirm zero refs). Update/remove source-grep tests (`projection-guard`, `bean-projection-guard`, `compute-on-read`) that referenced them — re-point to the surviving scoped queries (e.g. redaction now asserted on `getBean`/`getDiscoverBeansPage`).
- [ ] Full gate green. Commit `chore(m3d2): retire fidelity gate; remove superseded global queries; update guards`.

---

### Task 9: Live verification spike (controller-run)
- [ ] Seed a >page-size dataset (2–3 users, several beans, ~30 tastings, some saves/wishlist).
- [ ] `npm run build && npm start`. **Payload proof (the win):** DevTools Network on `/` → the document/RSC payload carries page-1 (~20) + the user's own bounded data, NOT all rows (grep the response: total brew notes ≈ bounded, not all). 
- [ ] Each screen renders + paginates: feed, discover (beans Load more + trending), journal (mine/shelf/saved/wishlist scoped), profile (me stats + own brews), bean detail (reviews Load more), roaster detail (beans Load more). Toggles instant; log a brew → appears (revalidate); addBag "& continue → brew" hand-off works.
- [ ] Record results in the PR. No commit.

---

## Self-review checklist (before PR)
- [ ] `getAppData` returns no global beans/tastings/users; initial payload bounded (verified live).
- [ ] No screen reads `D.BEANS`/`D.TASTINGS`/`D.USERS`/`D.FOLLOWING`/`D.bean`/`D.user` (grep clean).
- [ ] `me` aggregates correct (profile stats); addBag hand-off works; toggles instant.
- [ ] Fidelity gate removed; drift check + constraint tests still green.
- [ ] `tsc` + `npm test` (both lanes) + `eslint` + `build` + CI green.
- [ ] Run `/code-review` + post summary.
