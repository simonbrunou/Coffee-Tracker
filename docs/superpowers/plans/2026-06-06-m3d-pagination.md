# M3·D·1 — Denormalization + Feed Pagination (phase 1 of full-scoped M3·D)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / subagent-driven-development. Steps use `- [ ]`.

**Goal (D·1):** Make tasting rows (and comments) carry their author + bean display fields so cards render standalone, add keyset cursor infra + a composite index, and paginate the home feed. **Additive**: `getAppData` still loads the globals (now denormalized), so journal/discover/detail keep working — D·1 ends green. (D·2 slims `getAppData` + scopes the other screens.)

**Why phased:** the adversarial review showed a single PR would leave `tsc` red across ~8 files until the end and risks a blank feed. D·1 makes `TastingCard`/`CommentThread` self-sufficient *additively* (globals still present), so it's green throughout; D·2 then removes the globals safely.

**Tech:** Next 15 App Router, Postgres (raw `pg`), Drizzle (migrations only), vitest. No data-fetching library.

**Spec:** `docs/superpowers/specs/2026-06-06-m3d-pagination-design.md` (full-scoped design; this plan is its phase 1).

**Branch:** `feat/m3d-pagination` (off `main` @ `607d914`).

**Viewer-param convention (review fix):** in EVERY tasting query, `$1` = the viewer (`currentUserId`) for `likedByMe`/`savedByMe`; any row filter uses `$2+`. Never reuse `$1` for a filter.

**Denormalized `Tasting` fields (review fix — kills the blank-feed):** `authorName, authorHandle, authorAvatar, beanName, beanColor, beanOrigin, beanRoasterName (string|null), beanFlavors (string[])`. Derived via `join users u`, `join beans b`, `left join roasters r on r.id=b.roaster_id`, selecting `coalesce(r.name, b.roaster_name) as "beanRoasterName"`.

**Gate (every task):** `npm run typecheck` clean; `npm test` green (both lanes when DB present).

---

### Task 1: Cursor helpers (`lib/pagination.ts`)
Identical to the prior plan — unchanged. (encode/decode/clampLimit/toPage + tests.)

- [ ] **Step 1–5:** Create `lib/pagination.ts` + `test/pagination.test.ts` exactly as below; TDD red→green; commit `feat(m3d): cursor pagination helpers`.

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
  try { parsed = JSON.parse(Buffer.from(s, "base64url").toString("utf8")); }
  catch { throw new Error("Invalid cursor"); }
  const c = parsed as Partial<Cursor>;
  if (typeof c?.ts !== "string" || typeof c?.id !== "string" || !c.id || Number.isNaN(Date.parse(c.ts)))
    throw new Error("Invalid cursor");
  return { ts: c.ts, id: c.id };
}
export function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}
export function toPage<T extends { id: string; createdAt: Date | string }>(rows: T[], limit: number): Page<T> {
  if (rows.length <= limit) return { rows, nextCursor: null };
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const ts = last.createdAt instanceof Date ? last.createdAt.toISOString() : String(last.createdAt);
  return { rows: page, nextCursor: encodeCursor({ ts, id: last.id }) };
}
```

Test: round-trip; null/empty→null; garbage throws; clampLimit default/clamp/parse. Run → fail → implement → pass → commit.

---

### Task 2: Composite index (Drizzle migration)
- [ ] **Step 1:** In `lib/db/schema.ts`, tastings: `index("tastings_created_id_idx").on(t.createdAt.desc().nullsFirst(), t.id.desc())` (replace `tastings_created_idx`). beans: `index("beans_created_id_idx").on(t.createdAt.desc().nullsFirst(), t.id.desc())` (replace `beans_created_idx`).
- [ ] **Step 2:** `npx drizzle-kit generate --name pagination_indexes` → review `drizzle/0001_*.sql` (drop old two, create two composite).
- [ ] **Step 3:** Apply to test DB (`DATABASE_URL=…coffee_tracker_test npm run db:setup`); `\d tastings` shows `tastings_created_id_idx`.
- [ ] **Step 4:** Drift check `npx drizzle-kit generate --name drift` → "No schema changes"; remove stray. Commit `feat(m3d): composite (created_at,id) keyset indexes`.

> The M3·C fidelity gate (`schema-fidelity.test.ts`) compares the unchanged `0000` baseline to the frozen `db/schema.sql` → it stays green and untouched in D·1. It is retired in D·2 (when Drizzle migrations diverge meaningfully from the frozen snapshot). The CI drift check is the ongoing guard.

---

### Task 3: Types (`lib/types.ts`)
- [ ] **Step 1:** Add to `Tasting`: `authorName: string; authorHandle: string; authorAvatar: string; beanName: string; beanColor: string; beanOrigin: string; beanRoasterName: string | null; beanFlavors: string[];`. Add to `Comment`: `authorName: string; authorHandle: string; authorAvatar: string;`. Re-export `Page` from `@/lib/pagination`. Add `feed: Page<Tasting>` to `AppData` (keep existing fields in D·1).
- [ ] **Step 2:** `npm run typecheck` — expect red at every `Tasting`/`Comment` producer (queries, logBrew) + `cards`/`comment-thread`; fixed in Tasks 4 + 6. Commit `feat(m3d): denormalized author+bean fields on Tasting/Comment`.

---

### Task 4: Query layer — denormalize + feed pagination (`lib/queries.ts`)

**Files:** Modify `lib/queries.ts`; Test `test/integration/pagination.test.ts`.

- [ ] **Step 1:** Define shared fragments (viewer = `$1` always):
```ts
import { type Page, decodeCursor, clampLimit, toPage } from "@/lib/pagination";

const TASTING_COLS = `
  t.id, t.user_id as "userId", t.bean_id as "beanId", t.rating, t.brew,
  t.dose, t.ratio, t.temp, t.note,
  coalesce(l.likes, 0)::int     as likes,
  coalesce(cm.comments, 0)::int as "commentsCount",
  t.time, t.created_at as "createdAt",
  u.name as "authorName", u.handle as "authorHandle", u.avatar as "authorAvatar",
  b.name as "beanName", b.color as "beanColor", b.origin as "beanOrigin",
  b.flavors as "beanFlavors", coalesce(r.name, b.roaster_name) as "beanRoasterName",
  ($1::text is not null and exists (select 1 from likes lm where lm.tasting_id=t.id and lm.user_id=$1)) as "likedByMe",
  ($1::text is not null and exists (select 1 from tasting_saves ts where ts.tasting_id=t.id and ts.user_id=$1)) as "savedByMe"`;
const TASTING_JOINS = `
  join users u on u.id = t.user_id
  join beans b on b.id = t.bean_id
  left join roasters r on r.id = b.roaster_id
  left join (select tasting_id, count(*) as likes from likes group by tasting_id) l on l.tasting_id = t.id
  left join (select tasting_id, count(*) as comments from comments group by tasting_id) cm on cm.tasting_id = t.id`;
```

- [ ] **Step 2:** Add `getFeedPage` (viewer=$1; filters at $2+):
```ts
export type FeedTab = "Recent" | "Following" | "Popular";
const FEED_TABS: FeedTab[] = ["Recent", "Following", "Popular"];
export function isFeedTab(s: string): s is FeedTab { return (FEED_TABS as string[]).includes(s); }

export async function getFeedPage(
  currentUserId: string | null,
  opts: { tab: FeedTab; cursor?: string | null; limit?: number },
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
      [currentUserId, cur?.ts ?? null, cur?.id ?? null, limit + 1]);
    return toPage(rows, limit);
  }
  if (opts.tab === "Popular") {
    const { rows } = await query<Tasting>(
      `select ${TASTING_COLS} from tastings t ${TASTING_JOINS}
       order by coalesce(l.likes,0) desc, t.created_at desc, t.id desc limit 50`,
      [currentUserId]);
    return { rows, nextCursor: null };
  }
  const cur = decodeCursor(opts.cursor); // Recent
  const { rows } = await query<Tasting>(
    `select ${TASTING_COLS} from tastings t ${TASTING_JOINS}
     where ($2::timestamptz is null or (t.created_at, t.id) < ($2::timestamptz, $3))
     order by t.created_at desc, t.id desc limit $4`,
    [currentUserId, cur?.ts ?? null, cur?.id ?? null, limit + 1]);
  return toPage(rows, limit);
}
```

- [ ] **Step 3:** Update the existing `getTastings`/`getFollowingTastings` to use `TASTING_COLS`/`TASTING_JOINS` (so the globals `getAppData` still loads are now **denormalized** — keeps D·1 additive and journal/detail rendering). They keep their non-paginated form (D·2 removes them).

- [ ] **Step 4:** `logBrew` (and `updateBrew` if it returns a `Tasting`) must return a **denormalized** row. After the insert/update, re-select that id:
```ts
const { rows } = await query<Tasting>(
  `select ${TASTING_COLS} from tastings t ${TASTING_JOINS} where t.id = $2 limit 1`,
  [userId, newId]);  // $1 = viewer (the author), $2 = the row id
return rows[0];
```
(Replace the current hand-built return object. `$1`=author=viewer, `$2`=id.)

- [ ] **Step 5:** `getComments` JOINs the author:
```ts
`select c.id, c.tasting_id as "tastingId", c.user_id as "userId", c.body,
   c.created_at as "createdAt", c.updated_at as "updatedAt",
   u.name as "authorName", u.handle as "authorHandle", u.avatar as "authorAvatar"
 from comments c join users u on u.id = c.user_id
 where c.tasting_id = $1 order by c.created_at asc`
```

- [ ] **Step 6:** `getAppData` ADDS `feed`: `getFeedPage(currentUserId, { tab: "Recent" })` alongside the existing (now-denormalized) arrays. Add it to the returned object.

- [ ] **Step 7:** Integration test `test/integration/pagination.test.ts` — seed 25 tastings (need a user + bean for the JOINs), page through via the raw keyset SQL, assert no dupes/skips (as in the prior plan's test). Run green.

- [ ] **Step 8:** `npm run typecheck` (queries now satisfy the denormalized `Tasting`); commit `feat(m3d): denormalized tasting/comment queries + getFeedPage (keyset)`.

---

### Task 5: Load-more action + useLoadMore hook
- [ ] **Step 1:** `app/actions.ts`: `export async function loadMoreFeed(tab: string, cursor: string | null): Promise<Page<Tasting>> { if (!isFeedTab(tab)) throw new Error("Invalid feed tab"); return getFeedPage(await getCurrentUserId(), { tab, cursor }); }`. Validation test (bad tab throws; bad cursor throws via decode).
- [ ] **Step 2:** `components/use-load-more.ts` — the hook from the prior plan (rows/cursor/loadMore/hasMore/pending; `useEffect([initial])` re-seed). Add a `reset(page: Page<T>)` setter so tab-switch can replace rows (review fix):
```ts
const reset = (p: Page<T>) => { setRows(p.rows); setCursor(p.nextCursor); };
return { rows, loadMore, hasMore: cursor !== null, pending, reset };
```
- [ ] **Step 3:** Commit `feat(m3d): loadMoreFeed action + useLoadMore hook`.

---

### Task 6: TastingCard + CommentThread read from the row; feed paginates

**Files:** `components/cards.tsx`, `components/comment-thread.tsx`, `components/screens.tsx`, `app/page.tsx`.

- [ ] **Step 1: `cards.tsx` `TastingCard`** — remove `const user = D.user(...)`, `const bean = D.bean(...)`, `const roaster = D.roaster(...)`, and `if (!user || !bean) return null`. Read from the row:
  - `<Avatar user={{ name: tasting.authorName, handle: tasting.authorHandle, avatar: tasting.authorAvatar }} .../>` (adjust `Avatar`'s prop type to the minimal `{name; handle; avatar}` it already reads, or accept a partial — verify `ui.tsx` `Avatar`).
  - `{tasting.authorName}`, `@{tasting.authorHandle}`.
  - bean strip: `onClick={() => onOpenBean(tasting.beanId)}`, `<BeanBag color={tasting.beanColor} .../>`, `{tasting.beanName}`, `{(tasting.beanRoasterName) ?? "My roaster"} · {tasting.beanOrigin}`, `{tasting.beanFlavors.map(...)}`.
  - Keep `isMine`, like/save/follow (provider Sets), the like-count formula (unchanged).
  - Cap stagger: `animationDelay: Math.min(delay/50, 8) * 50 + "ms"` (or pass a pre-capped `delay`). Review fix for appended pages.
- [ ] **Step 2: `comment-thread.tsx`** — replace `D.user(c.userId)` with the row's `c.authorName/authorHandle/authorAvatar`.
- [ ] **Step 3: Feed** (`screens.tsx` `FeedScreen` + `app/page.tsx`): `FeedScreen` accepts `initialFeed: Page<Tasting>` (Recent, from `getAppData.feed` via the provider/props) + `tab`. Use `useLoadMore(initialFeed, (c) => loadMoreFeed(tab, c))`. On tab change to Following/Popular, fetch page 1 via `loadMoreFeed(tab, null)` in an effect and `reset(...)` the hook (show a small loading state). Render `rows`; "Load more" button when `hasMore` (auto-hidden on Popular, `nextCursor` null). `app/page.tsx` reads `feed` from the provider for the initial Recent page.
- [ ] **Step 4:** `npm run typecheck && npm run build` clean. Commit `feat(m3d): cards/comments read denormalized rows; feed paginates with load-more`.

---

### Task 7: Update legacy tests + full gate
- [ ] **Step 1:** `test/compute-on-read.test.ts` / `test/projection-guard.test.ts` / `test/bean-projection-guard.test.ts`: these grep `getTastings`/`getBeans` source. `getTastings` still exists (denormalized) in D·1, so most assertions hold; add/adjust assertions for the new author/bean JOINs (e.g. `getFeedPage` contains `count(*)`, the keyset clause, and the author/bean JOIN). `log-brew.test.ts` mocks `query` — update its expected return to the re-select shape if it asserts the return object.
- [ ] **Step 2:** Full gate: `npm run typecheck && npm run lint && npm test && npm run build`. Commit `test(m3d): update query tests for denormalized + paginated shape`.

---

### Task 8: Live verification spike (controller-run)
- [ ] **Step 1:** Seed a throwaway dataset (>page-size tastings across 2–3 users + beans) into the dev DB.
- [ ] **Step 2:** `npm run build && npm start`; load `/`: feed page 1 renders **with bean name/roaster/origin/flavors + author** (proves denormalization — no blank cards), "Load more" reveals older brews, no dupes; Following + Popular tabs work; comments show author avatars.
- [ ] **Step 3:** Log a brew → appears at the top of the feed (revalidate re-seeds page 1) and renders fully denormalized; like a brew → count consistent (provider Set).
- [ ] **Step 4:** Record results in the PR. No commit.

---

## D·1 self-review checklist
- [ ] No blank cards: `TastingCard` renders from the row alone (no `D.bean/D.user`); verified live.
- [ ] Viewer-param `$1` consistent across all tasting queries; keyset no dupes/skips (integration test).
- [ ] Composite index applied; drift check clean; M3·C fidelity gate still green.
- [ ] `getAppData` still loads globals (additive) → journal/discover/detail unaffected this phase.
- [ ] `npm run typecheck && npm test && npm run lint && npm run build` + CI green.
- [ ] Run `/code-review` on the PR + post summary.

## Deferred to D·2 (next PR)
Slim `getAppData` (drop global beans/tastings/users); split route pages into server-fetch + client-render; scope journal/profile/discover/detail to their own (paginated) queries; retire the fidelity gate + freeze-note `db/schema.sql`; `me` aggregate via `getUserById`; reconcile the optimistic write-path for the now-bounded provider data. This is where the payload-reduction lands.
