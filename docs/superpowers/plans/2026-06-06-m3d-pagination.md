# M3·D — Pagination & Server-Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Bound the unbounded global surfaces (home feed + Discover) with keyset cursor pagination and slim `getAppData` so each screen reads server-scoped data — no data-fetching library, one source of truth.

**Architecture:** Keyset cursor `(created_at, id)` + a composite index; `getAppData` drops the global beans/tastings/users arrays and returns shell + the user's own data + feed page 1; feed/Discover self-fetch pages via Server Actions appended in a `useLoadMore` hook; author denormalized into tasting rows. Keep `useOptimistic` + `revalidatePath`.

**Tech Stack:** Next 15 App Router, Postgres (raw `pg`), Drizzle (migrations only), vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-m3d-pagination-design.md`

**Branch:** `feat/m3d-pagination` (off `main` @ `607d914`).

**Build order:** cursor helpers → composite index → types → query layer (template: feed) → load-more actions → slim provider → useLoadMore hook → screens → update old tests → live spike.

**Global gate (every task):** `npx tsc --noEmit` clean; `npm test` green (both lanes when DB present).

---

### Task 1: Cursor helpers (`lib/pagination.ts`)

**Files:** Create `lib/pagination.ts`; Test `test/pagination.test.ts`.

- [ ] **Step 1: Failing test**

```ts
// test/pagination.test.ts
import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor, clampLimit, DEFAULT_LIMIT, MAX_LIMIT } from "@/lib/pagination";

describe("cursor", () => {
  it("round-trips ts+id", () => {
    const c = { ts: "2026-06-06T10:00:00.000Z", id: "abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  it("null/empty → null", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });
  it("garbage throws", () => {
    expect(() => decodeCursor("!!!not-base64-json!!!")).toThrow();
    expect(() => decodeCursor(encodeCursor({ ts: "nope", id: "x" }))).toThrow();
  });
});

describe("clampLimit", () => {
  it("defaults + clamps", () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(0)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(5)).toBe(5);
    expect(clampLimit(9999)).toBe(MAX_LIMIT);
    expect(clampLimit("30")).toBe(30);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run test/pagination.test.ts` → module missing)

- [ ] **Step 3: Implement `lib/pagination.ts`**

```ts
export interface Cursor { ts: string; id: string }
export interface Page<T> { rows: T[]; nextCursor: string | null }

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(s: string | null | undefined): Cursor | null {
  if (!s) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid cursor");
  }
  const c = parsed as Partial<Cursor>;
  if (typeof c?.ts !== "string" || typeof c?.id !== "string" || !c.id || Number.isNaN(Date.parse(c.ts))) {
    throw new Error("Invalid cursor");
  }
  return { ts: c.ts, id: c.id };
}

export function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/** Slice an over-fetched (limit+1) result into a Page, deriving nextCursor. */
export function toPage<T extends { id: string; createdAt: Date | string }>(
  rows: T[],
  limit: number,
): Page<T> {
  if (rows.length <= limit) return { rows, nextCursor: null };
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const ts = last.createdAt instanceof Date ? last.createdAt.toISOString() : String(last.createdAt);
  return { rows: page, nextCursor: encodeCursor({ ts, id: last.id }) };
}
```

- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `feat(m3d): cursor pagination helpers`.

---

### Task 2: Composite indexes (Drizzle migration)

**Files:** Modify `lib/db/schema.ts`; generate `drizzle/0001_*.sql`.

- [ ] **Step 1:** In `lib/db/schema.ts`, replace the single-column created indexes with composite ones:
  - tastings: replace `index("tastings_created_idx").on(t.createdAt.desc().nullsFirst())` with `index("tastings_created_id_idx").on(t.createdAt.desc().nullsFirst(), t.id.desc())`.
  - beans: replace `index("beans_created_idx").on(t.createdAt.desc().nullsFirst())` with `index("beans_created_id_idx").on(t.createdAt.desc().nullsFirst(), t.id.desc())`.

- [ ] **Step 2: Generate** `npx drizzle-kit generate --name pagination_indexes` → `drizzle/0001_pagination_indexes.sql`. Review it: should `DROP INDEX` the old two and `CREATE INDEX` the two composites.

- [ ] **Step 3: Apply + verify** (test DB):
```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coffee_tracker_test
npm run db:setup
docker exec coffee-pg psql -U postgres -d coffee_tracker_test -c "\d tastings" | grep created_id_idx
```
Expected: `tastings_created_id_idx` present.

- [ ] **Step 4: Drift check** `npx drizzle-kit generate --name drift_check` → "No schema changes"; remove any stray file. **Step 5: Commit** `feat(m3d): composite (created_at,id) indexes for keyset pagination`.

---

### Task 3: Types (`lib/types.ts`)

**Files:** Modify `lib/types.ts`.

- [ ] **Step 1:** Add author fields to the `Tasting` interface: `authorName: string; authorHandle: string; authorAvatar: string;`. Re-export `Page<T>` from pagination or add a type alias. Run `npx tsc --noEmit` — expect errors at every site that builds a `Tasting` without author (these are fixed in Tasks 4 + 8; that's expected mid-stream). **Step 2: Commit** `feat(m3d): Tasting carries denormalized author`.

> Note: tsc will be red until Task 4 (queries add the author JOIN) and Task 8 (screens read author from row). The plan notes this; do not "fix" by reverting the type.

---

### Task 4: Query layer — paginated + scoped + author JOIN (`lib/queries.ts`)

**Files:** Modify `lib/queries.ts`; Test `test/integration/pagination.test.ts`.

The **template** is `getFeedPage`; the others reuse its keyset + author-JOIN shape.

- [ ] **Step 1: Write the integration test (keyset correctness)** `test/integration/pagination.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { freshDbWithSql, dropDb } from "./_db";
import { Client } from "pg";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("keyset feed pagination", () => {
  const DB = "cortado_pagination";
  let c: Client;

  beforeAll(async () => {
    const baseline = readFileSync(join(process.cwd(), "drizzle", "0000_init.sql"), "utf8");
    const idx = readFileSync(join(process.cwd(), "drizzle", "0001_pagination_indexes.sql"), "utf8");
    c = await freshDbWithSql(DB, baseline + ";\n" + idx);
    await c.query(`insert into users (id,name,handle,avatar) values ('u','U','u','#000')`);
    await c.query(`insert into beans (id,name,color) values ('b','B','#000')`);
    // 25 tastings, descending created_at
    for (let i = 0; i < 25; i++) {
      await c.query(
        `insert into tastings (id,user_id,bean_id,rating,created_at)
         values ($1,'u','b',5, now() - ($2 || ' minutes')::interval)`,
        [`t${String(i).padStart(2, "0")}`, i],
      );
    }
  });
  afterAll(async () => { await c?.end(); await dropDb(DB); });

  it("pages with no dupes/skips and stable order", async () => {
    // Page 1: newest 10
    const p1 = await c.query(
      `select id, created_at from tastings
       where ($1::timestamptz is null or (created_at, id) < ($1::timestamptz, $2))
       order by created_at desc, id desc limit 11`, [null, null]);
    expect(p1.rows.length).toBe(11); // 10 + 1 over-fetch
    const last = p1.rows[9];
    const p2 = await c.query(
      `select id, created_at from tastings
       where (created_at, id) < ($1::timestamptz, $2)
       order by created_at desc, id desc limit 11`, [last.created_at, last.id]);
    const ids1 = p1.rows.slice(0, 10).map((r) => r.id);
    const ids2 = p2.rows.slice(0, 10).map((r) => r.id);
    expect(new Set([...ids1, ...ids2]).size).toBe(20); // no overlap
  });
});
```

- [ ] **Step 2: Run → FAIL** (until the indexes migration exists; if Task 2 done, this should already pass the raw-SQL keyset — it validates the SQL shape the query layer will use). Adjust until green.

- [ ] **Step 3: Implement `getFeedPage` (the template)** in `lib/queries.ts`:

```ts
import { type Page, decodeCursor, clampLimit, toPage } from "@/lib/pagination";

const TASTING_COLS = `
  t.id, t.user_id as "userId", t.bean_id as "beanId", t.rating, t.brew,
  t.dose, t.ratio, t.temp, t.note,
  coalesce(l.likes, 0)::int    as likes,
  coalesce(cm.comments, 0)::int as "commentsCount",
  t.time, t.created_at as "createdAt",
  u.name as "authorName", u.handle as "authorHandle", u.avatar as "authorAvatar",
  ($1::text is not null and exists (select 1 from likes lm where lm.tasting_id = t.id and lm.user_id = $1)) as "likedByMe",
  ($1::text is not null and exists (select 1 from tasting_saves ts where ts.tasting_id = t.id and ts.user_id = $1)) as "savedByMe"`;

const TASTING_JOINS = `
  join users u on u.id = t.user_id
  left join (select tasting_id, count(*) as likes from likes group by tasting_id) l on l.tasting_id = t.id
  left join (select tasting_id, count(*) as comments from comments group by tasting_id) cm on cm.tasting_id = t.id`;

export type FeedTab = "Recent" | "Following" | "Popular";
const FEED_TABS: FeedTab[] = ["Recent", "Following", "Popular"];
export function isFeedTab(s: string): s is FeedTab { return (FEED_TABS as string[]).includes(s); }

export async function getFeedPage(
  currentUserId: string | null,
  opts: { tab: FeedTab; cursor?: string | null; limit?: number } = { tab: "Recent" },
): Promise<Page<Tasting>> {
  const limit = clampLimit(opts.limit);
  if (opts.tab === "Following") {
    if (!currentUserId) return { rows: [], nextCursor: null };
    const cur = decodeCursor(opts.cursor);
    const { rows } = await query<Tasting>(
      `select ${TASTING_COLS} from tastings t
       join user_follows uf on uf.followee_id = t.user_id and uf.follower_id = $1
       ${TASTING_JOINS}
       where ($2::timestamptz is null or (t.created_at, t.id) < ($2::timestamptz, $3))
       order by t.created_at desc, t.id desc limit $4`,
      [currentUserId, cur?.ts ?? null, cur?.id ?? null, limit + 1],
    );
    return toPage(rows, limit);
  }
  if (opts.tab === "Popular") {
    const { rows } = await query<Tasting>(
      `select ${TASTING_COLS} from tastings t ${TASTING_JOINS}
       order by coalesce(l.likes,0) desc, t.created_at desc, t.id desc limit 50`,
      [currentUserId],
    );
    return { rows, nextCursor: null }; // top-N, no deep pagination
  }
  // Recent
  const cur = decodeCursor(opts.cursor);
  const { rows } = await query<Tasting>(
    `select ${TASTING_COLS} from tastings t ${TASTING_JOINS}
     where ($2::timestamptz is null or (t.created_at, t.id) < ($2::timestamptz, $3))
     order by t.created_at desc, t.id desc limit $4`,
    [currentUserId, cur?.ts ?? null, cur?.id ?? null, limit + 1],
  );
  return toPage(rows, limit);
}
```

- [ ] **Step 4: Implement the scoped/per-user queries** (same `TASTING_COLS`/`TASTING_JOINS` shape):
  - `getMyTastings(userId)` → `where t.user_id = $1` (author is the user; still JOIN for shape), `order by created_at desc` (cap `limit 200` defensively, no cursor).
  - `getSavedTastings(userId)` → `join tasting_saves sv on sv.tasting_id = t.id and sv.user_id = $1`, ordered by `sv.created_at desc`, cap 200.
  - `getBeanReviewsPage(beanId, currentUserId, {cursor, limit})` → `where t.bean_id = $X and keyset`, paginated like Recent.
- [ ] **Step 5: Beans queries** — refactor `getBeans` into:
  - `getDiscoverBeansPage(currentUserId, {cursor, limit})` → existing getBeans SELECT + redaction, add `where ($cursor keyset on b.created_at,b.id)`, `order by b.created_at desc, b.id desc limit+1`, `toPage`.
  - `getMyShelf(userId)` → `where b.user_id = $1 and b.owned = true`, cap 200.
  - `getWishlistBeans(userId)` → `join bean_wishlist w on w.bean_id = b.id and w.user_id = $1`, cap 200.
  - `getTrendingBeans(currentUserId)` → existing SELECT, `order by avg_rating desc nulls last, ratings desc limit 12` (its own query; replaces client `.sort().slice`).
  - `getBean(id, currentUserId)` → single bean by id (redaction-aware).
  - `getRoasterBeansPage(roasterId, currentUserId, {cursor, limit})` → `where b.roaster_id = $X and keyset`, paginated.
  - `getRoaster(id)` → single roaster.
- [ ] **Step 6: Slim `getAppData`**:

```ts
export async function getAppData(): Promise<AppData> {
  const currentUserId = await getCurrentUserId();
  const [roasters, feed, myTastings, myShelf] = await Promise.all([
    getRoasters(currentUserId),
    getFeedPage(currentUserId, { tab: "Recent" }),
    currentUserId ? getMyTastings(currentUserId) : Promise.resolve([]),
    currentUserId ? getMyShelf(currentUserId) : Promise.resolve([]),
  ]);
  const me = currentUserId ? await getUserById(currentUserId) : null;
  const [followedUserIds, followedRoasterIds, savedTastingIds, wishedBeanIds] = currentUserId
    ? await Promise.all([ /* unchanged followedIds calls */ ])
    : [[], [], [], []];
  return {
    roasters, me, currentUserId, feed,         // feed: Page<Tasting> (page 1, Recent)
    myTastings, myShelf,
    followedUserIds, followedRoasterIds, savedTastingIds, wishedBeanIds,
  };
}
```
Add `getUserById(id)` (the `me` object). Update `AppData` in `lib/types.ts` to the new shape (remove global `beans`/`tastings`/`users`/`followingTastings`; add `me`, `feed: Page<Tasting>`, `myTastings`, `myShelf`). tsc will flag every consumer — fixed in Tasks 6 + 8.

- [ ] **Step 7:** Run integration test + `npx vitest run test/integration/pagination.test.ts` green. **Step 8: Commit** `feat(m3d): paginated + server-scoped query layer (author JOIN, slim getAppData)`.

---

### Task 5: Load-more Server Actions (`app/actions.ts`)

**Files:** Modify `app/actions.ts`; Test `test/actions-pagination.test.ts` (validation).

- [ ] **Step 1: Failing validation test** — `loadMoreFeed("BadTab", null)` rejects; `loadMoreFeed("Recent", "garbage")` rejects (bad cursor); valid tab returns a `Page`. (Mock `@/lib/queries` `getFeedPage`.)

- [ ] **Step 2: Implement**:

```ts
"use server";
import { getFeedPage, isFeedTab, getDiscoverBeansPage, getBeanReviewsPage, getRoasterBeansPage } from "@/lib/queries";
import { getCurrentUserId } from "@/lib/auth";
import type { Page } from "@/lib/pagination";
import type { Tasting, Bean } from "@/lib/types";

export async function loadMoreFeed(tab: string, cursor: string | null): Promise<Page<Tasting>> {
  if (!isFeedTab(tab)) throw new Error("Invalid feed tab");
  const uid = await getCurrentUserId();
  return getFeedPage(uid, { tab, cursor });   // decodeCursor inside throws on garbage
}

export async function loadMoreBeans(cursor: string | null): Promise<Page<Bean>> {
  const uid = await getCurrentUserId();
  return getDiscoverBeansPage(uid, { cursor });
}
// + loadMoreBeanReviews(beanId, cursor), loadMoreRoasterBeans(roasterId, cursor) — same shape.
```

- [ ] **Step 3:** Run → PASS. **Step 4: Commit** `feat(m3d): load-more server actions (validated)`.

---

### Task 6: Slim provider + data-context

**Files:** Modify `components/app-provider.tsx`, `components/data-context.tsx`.

- [ ] **Step 1:** `DataProvider` drops `beans`/`tastings`/`users`/`followingTastings`; gains `me`, `myTastings`, `myShelf`. Keep `roasters`, `currentUserId`, toggle Sets. Update `useData()` consumers' available fields. The `useOptimistic` arrays now wrap `myTastings`/`myShelf` (the per-user editable data) instead of the globals — write handlers (`handleDeleteBrew`, `handleAddBag`, `handleDeleteBag`) operate on these.
- [ ] **Step 2:** `app/layout.tsx` passes the slimmed `initialData`. `npx tsc --noEmit` — fix provider-internal references. **Step 3:** Run tsc; expect remaining errors only in screens (Task 8). **Step 4: Commit** `feat(m3d): slim DataProvider to shell + per-user data`.

---

### Task 7: `useLoadMore` hook (`components/use-load-more.ts`)

**Files:** Create `components/use-load-more.ts`.

```ts
"use client";
import { useEffect, useState, useTransition } from "react";
import type { Page } from "@/lib/pagination";

export function useLoadMore<T>(
  initial: Page<T>,
  fetcher: (cursor: string | null) => Promise<Page<T>>,
) {
  const [rows, setRows] = useState<T[]>(initial.rows);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [pending, start] = useTransition();

  // Re-seed when server page 1 changes (after a revalidatePath re-render).
  useEffect(() => { setRows(initial.rows); setCursor(initial.nextCursor); }, [initial]);

  const loadMore = () =>
    start(async () => {
      if (!cursor) return;
      const next = await fetcher(cursor);
      setRows((prev) => [...prev, ...next.rows]);
      setCursor(next.nextCursor);
    });

  return { rows, loadMore, hasMore: cursor !== null, pending };
}
```

- [ ] Commit `feat(m3d): useLoadMore hook`.

---

### Task 8: Screens (feed, discover, journal/profile, detail, cards)

**Files:** Modify `components/screens.tsx`, `components/detail.tsx`, `components/cards.tsx`, `app/page.tsx`, `app/discover/page.tsx`, `app/bean/[id]/page.tsx`, `app/roaster/[id]/page.tsx`, `app/journal/page.tsx`, `app/profile/page.tsx`.

- [ ] **Step 1: `cards.tsx`** — `TastingCard` reads author from `tasting.authorName/Handle/Avatar` (not `D.users`). Cap the stagger: `delay={Math.min(i, 8) * 50}`. The like-count formula stays (provider Set + row `likedByMe`).
- [ ] **Step 2: Feed** — `FeedScreen` takes `initialFeed: Page<Tasting>` + the tab; uses `useLoadMore(initialFeed, (c) => loadMoreFeed(tab, c))`; renders `rows`; "Load more" button when `hasMore` (hidden on Popular). `app/page.tsx` reads `feed` from the provider for page 1 (Recent); on tab switch to Following/Popular it fetches page 1 via the action (or a small effect). Keep the tab UI.
- [ ] **Step 3: Discover** — beans via `useLoadMore` + `loadMoreBeans`; trending from a server prop (`getTrendingBeans`); roasters from provider. `app/discover/page.tsx` (server) fetches beans page 1 + trending and passes down.
- [ ] **Step 4: Journal/Profile** — read `myTastings`/`myShelf` from provider; saved/wishlist via server props (`getSavedTastings`/`getWishlistBeans`) passed from `app/journal/page.tsx`/`app/profile/page.tsx` (server components).
- [ ] **Step 5: Detail** — `app/bean/[id]/page.tsx` fetches `getBean(id)` + `getBeanReviewsPage(id,...)` page 1; `BeanDetail` uses `useLoadMore` + `loadMoreBeanReviews`. Same for roaster.
- [ ] **Step 6:** `npx tsc --noEmit` clean; `npm run build`. **Step 7: Commit** `feat(m3d): screens read scoped/paginated data + load-more`.

---

### Task 9: Update legacy tests + full gate

**Files:** Modify `test/compute-on-read.test.ts`, `test/projection-guard.test.ts`, `test/bean-projection-guard.test.ts` (source-grep tests asserting old SQL).

- [ ] **Step 1:** Update the source-grep assertions to the new function names/shape (e.g. `getFeedPage`/`getDiscoverBeansPage` contain `count(*)`, author JOIN, the keyset clause; still NOT `b.avg_rating`), OR convert the most valuable ones to integration assertions against real computed values. Keep redaction guards.
- [ ] **Step 2:** Full gate: `npx tsc --noEmit && npm run lint && npm test && npm run build`. **Step 3: Commit** `test(m3d): update query tests for paginated/scoped shape`.

---

### Task 10: Live verification spike (controller-run)

- [ ] **Step 1:** Seed a throwaway dataset >page-size into the dev DB (a script inserting ~30 tastings across 2–3 users + ~30 beans).
- [ ] **Step 2:** `npm run build && npm start`; load `/` → feed page 1 + "Load more" reveals older brews, no dupes; Following + Popular tabs; Discover paginates + trending shows; journal shows the signed-in user's own brews (scoped, complete); a bean detail paginates reviews.
- [ ] **Step 3:** Confirm the **initial payload is bounded** — DevTools/Network: the document/RSC payload carries ~page-size rows, not all rows (the core win).
- [ ] **Step 4:** Log a brew → appears at top of feed + journal (revalidate); like a brew in the feed and confirm the count matches on its bean-detail page (provider Set still global → consistent).
- [ ] **Step 5:** Record results in the PR. No code commit.

---

## Self-review checklist (controller, before PR)
- [ ] `getAppData` no longer returns global beans/tastings/users; payload bounded (verified live).
- [ ] Keyset: no dupes/skips across pages (integration test); Popular top-N; trending server-side.
- [ ] Author denormalized; no screen reads a global `users` array.
- [ ] Composite index applied; drift check clean.
- [ ] `useOptimistic`/`revalidatePath` write-path intact; like count consistent across screens (live).
- [ ] `tsc` + `npm test` (both lanes) + `eslint` + `build` + CI green.
- [ ] Run `/code-review` on the PR + post a summary comment.
