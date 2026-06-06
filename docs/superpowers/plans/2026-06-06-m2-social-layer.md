# M2 — Social Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the faked social affordances real — follow user/roaster, comment (compose/edit/delete-own), save a tasting, wishlist a bean — plus a real "Following" feed and a Journal "Saved" section, all server-backed with compute-on-read counts.

**Architecture:** Typed FK join tables (mirroring `likes`); compute-on-read counts + per-viewer flags in `lib/queries.ts` (server-side only); toggles reuse M1's `likes` Set + `revalidatePath('/','layout')` reconciliation; comments load lazily per-tasting via a Server Action into a self-contained local-state thread component (never in `getAppData`); the Following feed is a server query (correct pagination seam).

**Tech Stack:** Next.js 15 (App Router, force-dynamic layout), React 19 (`useOptimistic`/`useTransition`), Postgres via `pg`, Vitest (node env, mock-`@/lib/db`).

**Source spec:** `docs/superpowers/specs/2026-06-06-m2-social-layer-design.md`
**Branch:** `feat/m2-social-layer` (created; spec committed).

---

## Conventions & constraints (read once)

- **Test env is `node`, no DOM.** Pure logic + Server-Action SQL are unit-tested (mock-`@/lib/db`, source-regex guards); React behavior is verified by `tsc --noEmit` + **live browser smoke with ≥2 ephemeral accounts** (the M1 spike proved mocks miss real-DB bugs).
- **Reuse patterns verbatim:** the `likes` toggle (`app/actions.ts` `toggleLike`), the `Set<string>` optimistic model + rollback (`components/app-provider.tsx`), the ownership guard (`updateBrew`/`deleteBrew`), the validator shape (`lib/brew-validation.ts` `Result<T>`).
- **M1 gotchas are mandatory** on every new aggregate/flag: `count(*)::int` (pg returns bigint as a string), `$1::text is not null` (anon-safe, inferable type), `COALESCE(...,0)`, explicit column lists (never `u.*`).
- **Run a single test:** `npx vitest run test/<file>.test.ts`. **Gates after each task:** `npx vitest run` green + `npx tsc --noEmit` exit 0 (intermediate red is expected mid-stream — noted per task).
- **DB:** `npm run db:reset && npm run dev` (Docker `coffee-pg` up). **No committed seed** — create accounts in the browser for smoke.
- **Commit after every task** (end bodies with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer).

---

## File map

- `db/schema.sql` — **modify**: 5 new tables + drops + reverse indexes; remove `users.followers/following`, `roasters.followers`, `tastings.comments`.
- `scripts/db-setup.ts` — **modify**: drop those columns from the roasters/users/tastings INSERT lists.
- `lib/types.ts` — **modify**: `User.followedByMe`, `Roaster.followedByMe`, `Bean.wishlistedByMe`; `Tasting.comments`→`commentsCount` + `savedByMe`; new `Comment`, `AddCommentInput`, `UpdateCommentInput`; `AppData` gains `followingTastings` + 4 membership id-lists.
- `lib/queries.ts` — **modify**: derive social counts/flags in getRoasters/getUsers/getTastings/getBeans; add `getFollowingTastings`, `getComments`, membership-id queries; thread into `getAppData`. `TASTING_COLS` loses `comments`.
- `lib/comment-validation.ts` — **create**: `validateComment` / `validateUpdateComment`.
- `app/actions.ts` — **modify**: 4 toggle actions + `addComment`/`updateComment`/`deleteComment` + `fetchComments` (Server Action wrapping `getComments`).
- `components/app-provider.tsx` — **modify**: 4 optimistic Sets + toggle handlers + ShellApi additions; seed Sets from membership lists.
- `components/comment-thread.tsx` — **create**: lazy local-state thread (load on expand, optimistic compose/edit/delete).
- `components/cards.tsx` — **modify**: wire Save + comment-expand; badge → `commentsCount`.
- `components/detail.tsx` — **modify**: real follow (roaster + user) + wishlist; render comment thread in reviews.
- `components/screens.tsx` — **modify**: Feed tabs Recent/Following/Popular; Journal "Saved" section.
- `app/page.tsx`, `app/roaster/[id]/page.tsx`, `app/profile/page.tsx` — **modify**: default tab → Recent; pass new ShellApi handlers.
- `test/*` — **create**: `actions-social`, `comment-validation`; extend `compute-on-read`.

---

## Task 1: Schema — typed FK tables, drops, indexes

**Files:** Modify `db/schema.sql`, `scripts/db-setup.ts`

- [ ] **Step 1: Add the 5 drops at the top.** In `db/schema.sql`, immediately after line 7 (before `drop table if exists accounts`) insert:
```sql
drop table if exists comments        cascade;
drop table if exists bean_wishlist   cascade;
drop table if exists tasting_saves   cascade;
drop table if exists roaster_follows cascade;
drop table if exists user_follows    cascade;
```

- [ ] **Step 2: Remove the stale count columns.** In `create table roasters` delete the line `followers int  not null default 0,`. In `create table users` delete `followers int  not null default 0,` and `following int  not null default 0,` (keep `tastings`). In `create table tastings` delete `comments   int  not null default 0,` (keep `likes`).

- [ ] **Step 3: Add the 5 tables.** After the `likes` table (after line 106) insert:
```sql
create table user_follows (
  follower_id text not null references users(id) on delete cascade,
  followee_id text not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);

create table roaster_follows (
  user_id    text not null references users(id)    on delete cascade,
  roaster_id text not null references roasters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, roaster_id)
);

create table tasting_saves (
  user_id    text not null references users(id)    on delete cascade,
  tasting_id text not null references tastings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tasting_id)
);

create table bean_wishlist (
  user_id    text not null references users(id) on delete cascade,
  bean_id    text not null references beans(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, bean_id)
);

create table comments (
  id         text primary key,
  tasting_id text not null references tastings(id) on delete cascade,
  user_id    text not null references users(id)    on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
```

- [ ] **Step 4: Add reverse indexes.** Append to the index block (after line 115):
```sql
create index user_follows_followee_idx   on user_follows   (followee_id);  -- follower count
create index roaster_follows_roaster_idx  on roaster_follows (roaster_id);  -- roaster follower count
create index tasting_saves_tasting_idx    on tasting_saves   (tasting_id);  -- future save count / joins
create index comments_tasting_idx         on comments        (tasting_id);  -- comment count + thread fetch
```

- [ ] **Step 5: Fix the seed INSERTs in `scripts/db-setup.ts`.** Roasters INSERT (line 40-42): remove `followers` → `insert into roasters (id, name, city, founded, beans, blurb) values ($1,$2,$3,$4,$5,$6)` and params `[r.id, r.name, r.city, r.founded, r.beans, r.blurb]`. Users INSERT (line 50-52): remove `followers, following` → `insert into users (id, name, handle, avatar, tastings, bio) values ($1,$2,$3,$4,$5,$6)` and params `[u.id, u.name, u.handle, u.avatar, u.tastings, u.bio]`. Tastings INSERT (line 86-91): remove `comments` → list `(id, user_id, bean_id, rating, brew, dose, ratio, temp, note, likes, time, created_at) values ($1..$12)` and params drop `t.comments` (now 12 params).

- [ ] **Step 6: Apply + verify the schema.** Run: `npm run db:reset`
  Expected: `✅ Database ready.` with no error. (Seeds are empty, so the INSERT loops don't execute; this proves the DDL is valid and the FKs resolve.)

- [ ] **Step 7: Commit.**
```bash
git add db/schema.sql scripts/db-setup.ts
git commit -m "feat(m2,db): typed follow/save/wishlist/comment tables; drop stale count columns; indexes"
```

---

## Task 2: Domain types

**Files:** Modify `lib/types.ts`

- [ ] **Step 1: Add per-viewer flags + derived fields.** In `interface Roaster`, after `followers: number;` add `followedByMe: boolean;`. In `interface User`, after `following: number;` add `followedByMe: boolean;`. In `interface Bean`, after `ownerId?: string | null;` add `wishlistedByMe: boolean;`.

- [ ] **Step 2: Update `Tasting`.** Replace `comments: number;` with:
```ts
  commentsCount: number;
  /** True when the current viewer has saved/bookmarked this tasting. */
  savedByMe: boolean;
```

- [ ] **Step 3: Add the `Comment` type + inputs.** After the `Tasting` interface add:
```ts
/** A flat comment on a tasting. */
export interface Comment {
  id: string;
  tastingId: string;
  userId: string;
  body: string;
  createdAt: string;
  /** ISO timestamp of the last edit; null if never edited. */
  updatedAt: string | null;
}
```
At the end of the file add:
```ts
export interface AddCommentInput { tastingId: string; body: string }
export interface UpdateCommentInput { id: string; body: string }
```

- [ ] **Step 4: Extend `AppData`.** Replace the `AppData` interface body with:
```ts
export interface AppData {
  roasters: Roaster[];
  users: User[];
  beans: Bean[];
  tastings: Tasting[];
  /** Tastings authored by users the current viewer follows (server-filtered). */
  followingTastings: Tasting[];
  /** Current viewer's membership id-lists, to seed the optimistic client Sets. */
  followedUserIds: string[];
  followedRoasterIds: string[];
  savedTastingIds: string[];
  wishedBeanIds: string[];
  currentUserId: string | null;
}
```

- [ ] **Step 5: Verify (expect downstream errors).** Run: `npx tsc --noEmit`
  Expected: FAIL only on `lib/queries.ts` (selects dropped fields / missing new ones) and client components reading `tasting.comments`. Confirm no errors inside `lib/types.ts`.

- [ ] **Step 6: Commit.**
```bash
git add lib/types.ts
git commit -m "feat(m2,types): social flags (followedByMe/savedByMe/wishlistedByMe), Comment, commentsCount, AppData lists"
```

---

## Task 3: Compute-on-read queries (test-locked first — riskiest surface)

**Files:** Modify `lib/queries.ts`; extend `test/compute-on-read.test.ts`

- [ ] **Step 1: Write the failing guard tests.** In `test/compute-on-read.test.ts`, before the final `});`, add:
```ts
  it("getRoasters takes currentUserId, derives followers ::int, exposes followedByMe", () => {
    const b = body("getRoasters");
    expect(b).toMatch(/getRoasters\(\s*currentUserId/);
    expect(b).toMatch(/count\(\*\)[\s\S]*::int/i);
    expect(b).toMatch(/"followedByMe"/);
    expect(b).toMatch(/\$1::text is not null/);
  });
  it("getUsers derives followers/following ::int (not stored columns) + followedByMe", () => {
    const b = body("getUsers");
    expect(b).toMatch(/coalesce\([^)]*followers[^)]*\)::int/i);
    expect(b).toMatch(/coalesce\([^)]*following[^)]*\)::int/i);
    expect(b).not.toMatch(/u\.followers/);
    expect(b).not.toMatch(/u\.following/);
    expect(b).toMatch(/"followedByMe"/);
  });
  it("getTastings replaces stale comments with commentsCount ::int + savedByMe", () => {
    const b = body("getTastings");
    expect(b).toMatch(/"commentsCount"/);
    expect(b).toMatch(/coalesce\([^)]*\)::int as "commentsCount"/i);
    expect(b).toMatch(/"savedByMe"/);
    expect(b).not.toMatch(/t\.comments/);
  });
  it("getBeans exposes wishlistedByMe (anon-safe)", () => {
    const b = body("getBeans");
    expect(b).toMatch(/"wishlistedByMe"/);
  });
  it("getFollowingTastings joins the follow graph", () => {
    const b = body("getFollowingTastings");
    expect(b).toMatch(/join user_follows/i);
    expect(b).toMatch(/followee_id = t\.user_id/);
  });
```

- [ ] **Step 2: Run; verify failure.** Run: `npx vitest run test/compute-on-read.test.ts` → FAIL.

- [ ] **Step 3: Rewrite `getRoasters`** (add the param + derived follower count + flag):
```ts
export async function getRoasters(currentUserId: string | null): Promise<Roaster[]> {
  const { rows } = await query<Roaster>(
    `select r.id, r.name, r.city, r.founded, r.beans,
            coalesce(f.followers, 0)::int as followers, r.blurb,
            ($1::text is not null and exists (
              select 1 from roaster_follows rf where rf.roaster_id = r.id and rf.user_id = $1
            )) as "followedByMe"
     from roasters r
     left join (select roaster_id, count(*) as followers from roaster_follows group by roaster_id) f
       on f.roaster_id = r.id
     order by r.id`,
    [currentUserId],
  );
  return rows;
}
```

- [ ] **Step 4: Rewrite `getUsers`** (derive followers/following; keep explicit columns — projection guard):
```ts
export async function getUsers(currentUserId: string | null): Promise<User[]> {
  const { rows } = await query<User>(
    `select u.id, u.name, u.handle, u.avatar,
            coalesce(t.tastings, 0)::int   as tastings,
            coalesce(fr.followers, 0)::int as followers,
            coalesce(fg.following, 0)::int as following,
            u.bio,
            ($1::text is not null and exists (
              select 1 from user_follows uf where uf.followee_id = u.id and uf.follower_id = $1
            )) as "followedByMe"
     from users u
     left join (select user_id, count(*) as tastings from tastings group by user_id) t on t.user_id = u.id
     left join (select followee_id, count(*) as followers from user_follows group by followee_id) fr on fr.followee_id = u.id
     left join (select follower_id, count(*) as following from user_follows group by follower_id) fg on fg.follower_id = u.id
     order by u.id`,
    [currentUserId],
  );
  return rows;
}
```

- [ ] **Step 5: Update `TASTING_COLS` + rewrite `getTastings`.** Change `TASTING_COLS` (line 17-19) — remove `comments`:
```ts
export const TASTING_COLS = `
  id, user_id as "userId", bean_id as "beanId", rating, brew, dose, ratio,
  temp, note, likes, time, created_at as "createdAt"`;
```
Rewrite `getTastings` (derive likes + commentsCount + likedByMe + savedByMe):
```ts
export async function getTastings(currentUserId: string | null): Promise<Tasting[]> {
  const { rows } = await query<Tasting>(
    `select
       t.id, t.user_id as "userId", t.bean_id as "beanId", t.rating, t.brew,
       t.dose, t.ratio, t.temp, t.note,
       coalesce(l.likes, 0)::int    as likes,
       coalesce(c.comments, 0)::int as "commentsCount",
       t.time, t.created_at as "createdAt",
       ($1::text is not null and exists (
         select 1 from likes lm where lm.tasting_id = t.id and lm.user_id = $1)) as "likedByMe",
       ($1::text is not null and exists (
         select 1 from tasting_saves ts where ts.tasting_id = t.id and ts.user_id = $1)) as "savedByMe"
     from tastings t
     left join (select tasting_id, count(*) as likes    from likes    group by tasting_id) l on l.tasting_id = t.id
     left join (select tasting_id, count(*) as comments from comments group by tasting_id) c on c.tasting_id = t.id
     order by t.created_at desc, t.id`,
    [currentUserId],
  );
  return rows;
}
```

- [ ] **Step 6: Add `wishlistedByMe` to `getBeans`.** In `getBeans`, after the `case when user_id = $1 then remaining::float8 end as "remaining"` line add a comma and:
```ts
       ,($1::text is not null and exists (
         select 1 from bean_wishlist w where w.bean_id = beans.id and w.user_id = $1)) as "wishlistedByMe"
```

- [ ] **Step 7: Add `getFollowingTastings` + `getComments` + membership queries.** After `getTastings` add:
```ts
/** Tastings authored by users the current viewer follows. Empty for anon. */
export async function getFollowingTastings(currentUserId: string | null): Promise<Tasting[]> {
  if (!currentUserId) return [];
  const { rows } = await query<Tasting>(
    `select
       t.id, t.user_id as "userId", t.bean_id as "beanId", t.rating, t.brew,
       t.dose, t.ratio, t.temp, t.note,
       coalesce(l.likes, 0)::int    as likes,
       coalesce(c.comments, 0)::int as "commentsCount",
       t.time, t.created_at as "createdAt",
       exists (select 1 from likes lm where lm.tasting_id = t.id and lm.user_id = $1) as "likedByMe",
       exists (select 1 from tasting_saves ts where ts.tasting_id = t.id and ts.user_id = $1) as "savedByMe"
     from tastings t
     join user_follows uf on uf.followee_id = t.user_id and uf.follower_id = $1
     left join (select tasting_id, count(*) as likes    from likes    group by tasting_id) l on l.tasting_id = t.id
     left join (select tasting_id, count(*) as comments from comments group by tasting_id) c on c.tasting_id = t.id
     order by t.created_at desc, t.id`,
    [currentUserId],
  );
  return rows;
}

/** A tasting's comment thread (lazy — fetched on expand, not in getAppData). */
export async function getComments(tastingId: string): Promise<Comment[]> {
  const { rows } = await query<Comment>(
    `select id, tasting_id as "tastingId", user_id as "userId", body,
            created_at as "createdAt", updated_at as "updatedAt"
     from comments where tasting_id = $1 order by created_at`,
    [tastingId],
  );
  return rows;
}

async function followedIds(table: string, selfCol: string, idCol: string, userId: string): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    `select ${idCol} as id from ${table} where ${selfCol} = $1`,
    [userId],
  );
  return rows.map((r) => r.id);
}
```
Add `Comment` to the `@/lib/types` import at the top of `lib/queries.ts`.

- [ ] **Step 8: Rewrite `getAppData`.** Replace it with:
```ts
export async function getAppData(): Promise<AppData> {
  const currentUserId = await getCurrentUserId();
  const [roasters, users, beans, tastings, followingTastings] = await Promise.all([
    getRoasters(currentUserId),
    getUsers(currentUserId),
    getBeans(currentUserId),
    getTastings(currentUserId),
    getFollowingTastings(currentUserId),
  ]);
  const [followedUserIds, followedRoasterIds, savedTastingIds, wishedBeanIds] = currentUserId
    ? await Promise.all([
        followedIds("user_follows", "follower_id", "followee_id", currentUserId),
        followedIds("roaster_follows", "user_id", "roaster_id", currentUserId),
        followedIds("tasting_saves", "user_id", "tasting_id", currentUserId),
        followedIds("bean_wishlist", "user_id", "bean_id", currentUserId),
      ])
    : [[], [], [], []];
  return {
    roasters, users, beans, tastings, followingTastings,
    followedUserIds, followedRoasterIds, savedTastingIds, wishedBeanIds, currentUserId,
  };
}
```
> Note: `followedIds` interpolates a fixed table/column name from this file's own literals (never user input) — safe; the user id is parameterized.

- [ ] **Step 9: Run guard tests + full suite + live read.** Run: `npx vitest run test/compute-on-read.test.ts` → PASS. Run: `npx vitest run` → all green (incl. `projection-guard`/`bean-projection-guard`). Run: `npm run db:reset && npm run dev`, load `/` signed-out → 200, no 500 in the dev log (proves the new SQL parses against Postgres — the M1 `$1`/`::int` class of bug surfaces here). Stop dev.

- [ ] **Step 10: Commit.**
```bash
git add lib/queries.ts test/compute-on-read.test.ts
git commit -m "feat(m2,queries): compute-on-read social counts+flags; getFollowingTastings/getComments; membership lists"
```

---

## Task 4: Comment validation + Server Actions (test-locked)

**Files:** Create `lib/comment-validation.ts`, `test/comment-validation.test.ts`, `test/actions-social.test.ts`; modify `app/actions.ts`

- [ ] **Step 1: Write the validator test.** Create `test/comment-validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateComment, validateUpdateComment } from "@/lib/comment-validation";

describe("validateComment", () => {
  it("rejects empty / whitespace", () => {
    expect(validateComment({ tastingId: "t-1", body: "" }).ok).toBe(false);
    expect(validateComment({ tastingId: "t-1", body: "   " }).ok).toBe(false);
  });
  it("requires a tastingId", () => {
    expect(validateComment({ tastingId: "", body: "hi" }).ok).toBe(false);
  });
  it("trims and accepts", () => {
    const r = validateComment({ tastingId: "t-1", body: "  nice pour  " });
    if (r.ok) { expect(r.value.body).toBe("nice pour"); expect(r.value.tastingId).toBe("t-1"); }
    else throw new Error("should pass");
  });
  it("rejects over 500 chars", () => {
    expect(validateComment({ tastingId: "t-1", body: "x".repeat(501) }).ok).toBe(false);
  });
});
describe("validateUpdateComment", () => {
  it("requires an id and a valid body", () => {
    expect(validateUpdateComment({ id: "", body: "hi" }).ok).toBe(false);
    expect(validateUpdateComment({ id: "c-1", body: "" }).ok).toBe(false);
    const r = validateUpdateComment({ id: "c-1", body: " hey " });
    if (r.ok) expect(r.value.body).toBe("hey"); else throw new Error("should pass");
  });
});
```

- [ ] **Step 2: Run; verify failure.** Run: `npx vitest run test/comment-validation.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement.** Create `lib/comment-validation.ts`:
```ts
import type { AddCommentInput, UpdateCommentInput } from "@/lib/types";
import type { Result } from "@/lib/brew-validation";

const MAX = 500;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function body(raw: unknown): Result<string> {
  const b = str(raw).trim();
  if (b.length === 0) return { ok: false, error: "Comment cannot be empty." };
  if (b.length > MAX) return { ok: false, error: `Comment must be ${MAX} characters or fewer.` };
  return { ok: true, value: b };
}

export function validateComment(raw: unknown): Result<AddCommentInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const tastingId = str(r.tastingId).trim();
  if (!tastingId) return { ok: false, error: "Missing tasting." };
  const b = body(r.body);
  return b.ok ? { ok: true, value: { tastingId, body: b.value } } : b;
}

export function validateUpdateComment(raw: unknown): Result<UpdateCommentInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r.id).trim();
  if (!id) return { ok: false, error: "Missing comment id." };
  const b = body(r.body);
  return b.ok ? { ok: true, value: { id, body: b.value } } : b;
}
```
(`Result<T>` is exported from `lib/brew-validation.ts`.)

- [ ] **Step 4: Run; verify pass.** Run: `npx vitest run test/comment-validation.test.ts` → PASS.

- [ ] **Step 5: Write the actions test.** Create `test/actions-social.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUserId: vi.fn(async () => "u-me"), getCurrentUserId: vi.fn(async () => "u-me") }));
const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/queries", () => ({ getComments: vi.fn(async () => [{ id: "c-1" }]), BEAN_COLS: "", TASTING_COLS: "" }));

import { toggleFollowUser, toggleSaveTasting, addComment, updateComment, deleteComment } from "@/app/actions";

beforeEach(() => queryMock.mockReset());

describe("social actions", () => {
  it("toggleFollowUser(follow) inserts idempotently; rejects self-follow", async () => {
    await expect(toggleFollowUser("u-me", true)).rejects.toThrow(); // self-follow
    expect(queryMock).not.toHaveBeenCalled();
    queryMock.mockResolvedValue({});
    await toggleFollowUser("u-2", true);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/insert into user_follows[\s\S]*on conflict do nothing/i);
    expect(params).toEqual(["u-me", "u-2"]);
  });
  it("toggleFollowUser(unfollow) deletes the edge", async () => {
    queryMock.mockResolvedValue({});
    await toggleFollowUser("u-2", false);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/delete from user_follows where follower_id = \$1 and followee_id = \$2/i);
    expect(params).toEqual(["u-me", "u-2"]);
  });
  it("toggleSaveTasting inserts/deletes against tasting_saves", async () => {
    queryMock.mockResolvedValue({});
    await toggleSaveTasting("t-1", true);
    expect((queryMock.mock.calls[0][0] as string)).toMatch(/insert into tasting_saves[\s\S]*on conflict do nothing/i);
  });
  it("addComment validates then inserts and returns the row", async () => {
    await expect(addComment({ tastingId: "t-1", body: "" })).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
    queryMock.mockResolvedValue({ rows: [{ id: "c-9", tastingId: "t-1", userId: "u-me", body: "hi" }] });
    const c = await addComment({ tastingId: "t-1", body: "hi" });
    expect(c.id).toBe("c-9");
    expect((queryMock.mock.calls[0][0] as string)).toMatch(/insert into comments/i);
  });
  it("updateComment is ownership-guarded", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: "c-1" }] });
    await updateComment({ id: "c-1", body: "edited" });
    expect((queryMock.mock.calls[0][0] as string)).toMatch(/update comments set body = \$3, updated_at = now\(\) where id = \$1 and user_id = \$2/i);
  });
  it("deleteComment is ownership-guarded and throws on 0 rows", async () => {
    queryMock.mockResolvedValue({ rowCount: 0 });
    await expect(deleteComment("c-1")).rejects.toThrow();
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/delete from comments where id = \$1 and user_id = \$2/i);
    expect(params).toEqual(["c-1", "u-me"]);
  });
});
```

- [ ] **Step 6: Run; verify failure.** Run: `npx vitest run test/actions-social.test.ts` → FAIL.

- [ ] **Step 7: Implement the actions.** In `app/actions.ts`, add imports:
```ts
import { getComments } from "@/lib/queries";
import { validateComment, validateUpdateComment } from "@/lib/comment-validation";
import type { AddCommentInput, Comment, UpdateCommentInput } from "@/lib/types";
```
(merge the type names into the existing `@/lib/types` import). Append:
```ts
// ---- Follows / saves / wishlist (idempotent toggles, mirroring toggleLike) ----
export async function toggleFollowUser(targetUserId: string, follow: boolean): Promise<void> {
  const userId = await requireUserId();
  if (userId === targetUserId) throw new Error("You can't follow yourself.");
  if (follow) await query(`insert into user_follows (follower_id, followee_id) values ($1, $2) on conflict do nothing`, [userId, targetUserId]);
  else await query(`delete from user_follows where follower_id = $1 and followee_id = $2`, [userId, targetUserId]);
  revalidatePath("/", "layout");
}
export async function toggleFollowRoaster(roasterId: string, follow: boolean): Promise<void> {
  const userId = await requireUserId();
  if (follow) await query(`insert into roaster_follows (user_id, roaster_id) values ($1, $2) on conflict do nothing`, [userId, roasterId]);
  else await query(`delete from roaster_follows where user_id = $1 and roaster_id = $2`, [userId, roasterId]);
  revalidatePath("/", "layout");
}
export async function toggleSaveTasting(tastingId: string, save: boolean): Promise<void> {
  const userId = await requireUserId();
  if (save) await query(`insert into tasting_saves (user_id, tasting_id) values ($1, $2) on conflict do nothing`, [userId, tastingId]);
  else await query(`delete from tasting_saves where user_id = $1 and tasting_id = $2`, [userId, tastingId]);
  revalidatePath("/", "layout");
}
export async function toggleWishlistBean(beanId: string, wish: boolean): Promise<void> {
  const userId = await requireUserId();
  if (wish) await query(`insert into bean_wishlist (user_id, bean_id) values ($1, $2) on conflict do nothing`, [userId, beanId]);
  else await query(`delete from bean_wishlist where user_id = $1 and bean_id = $2`, [userId, beanId]);
  revalidatePath("/", "layout");
}

// ---- Comments ----
export async function fetchComments(tastingId: string): Promise<Comment[]> {
  return getComments(tastingId); // read-only; no auth gate (comments are public)
}
export async function addComment(rawInput: AddCommentInput): Promise<Comment> {
  const userId = await requireUserId();
  const v = validateComment(rawInput);
  if (!v.ok) throw new Error(v.error);
  const id = `c-${randomUUID()}`;
  const { rows } = await query<Comment>(
    `insert into comments (id, tasting_id, user_id, body) values ($1, $2, $3, $4)
     returning id, tasting_id as "tastingId", user_id as "userId", body,
               created_at as "createdAt", updated_at as "updatedAt"`,
    [id, v.value.tastingId, userId, v.value.body],
  );
  revalidatePath("/", "layout");
  return rows[0];
}
export async function updateComment(rawInput: UpdateCommentInput): Promise<Comment> {
  const userId = await requireUserId();
  const v = validateUpdateComment(rawInput);
  if (!v.ok) throw new Error(v.error);
  const { rows } = await query<Comment>(
    `update comments set body = $3, updated_at = now() where id = $1 and user_id = $2
     returning id, tasting_id as "tastingId", user_id as "userId", body,
               created_at as "createdAt", updated_at as "updatedAt"`,
    [v.value.id, userId, v.value.body],
  );
  if (rows.length === 0) throw new Error("Couldn't update that comment.");
  revalidatePath("/", "layout");
  return rows[0];
}
export async function deleteComment(id: string): Promise<void> {
  const userId = await requireUserId();
  const { rowCount } = await query(`delete from comments where id = $1 and user_id = $2`, [id, userId]);
  if (!rowCount) throw new Error("Couldn't delete that comment.");
  revalidatePath("/", "layout");
}
```

- [ ] **Step 7b: Fix the M1 actions' return shape.** `TASTING_COLS` no longer selects `comments`, and `Tasting` now requires `commentsCount` + `savedByMe`. Update the two existing returns so the client never sees `undefined`: in `logBrew` change `return { ...rows[0], likedByMe: false };` → `return { ...rows[0], likedByMe: false, savedByMe: false, commentsCount: 0 };`, and in `updateBrew` change `return { ...rows[0], likedByMe: false };` → `return { ...rows[0], likedByMe: false, savedByMe: false, commentsCount: 0 };` (a freshly logged/edited tasting's true count re-bases on `revalidatePath`).

- [ ] **Step 8: Run tests + typecheck.** Run: `npx vitest run` → all green. Run: `npx tsc --noEmit` → red only on client components reading `tasting.comments` / missing handlers (fixed in Tasks 5-7); `app/actions.ts` clean.

- [ ] **Step 9: Commit.**
```bash
git add app/actions.ts lib/comment-validation.ts test/comment-validation.test.ts test/actions-social.test.ts
git commit -m "feat(m2,actions): follow/save/wishlist toggles + comment CRUD (guarded, validated, revalidated)"
```

---

## Task 5: Provider — optimistic Sets + ShellApi

**Files:** Modify `components/app-provider.tsx`

- [ ] **Step 1: Seed the four Sets.** After the existing `likes` `useState` (the `new Set(initialData.tastings.filter(t => t.likedByMe)...)` block), add:
```tsx
const [followedUsers, setFollowedUsers] = useState<Set<string>>(() => new Set(initialData.followedUserIds));
const [followedRoasters, setFollowedRoasters] = useState<Set<string>>(() => new Set(initialData.followedRoasterIds));
const [savedTastings, setSavedTastings] = useState<Set<string>>(() => new Set(initialData.savedTastingIds));
const [wishedBeans, setWishedBeans] = useState<Set<string>>(() => new Set(initialData.wishedBeanIds));
```

- [ ] **Step 2: Add a generic optimistic-toggle helper + the four handlers.** Near `toggleLike`, add:
```tsx
import {
  toggleFollowUser as followUserAction,
  toggleFollowRoaster as followRoasterAction,
  toggleSaveTasting as saveTastingAction,
  toggleWishlistBean as wishlistBeanAction,
} from "@/app/actions";

const optimisticToggle = (
  set: Set<string>,
  setSet: (updater: (prev: Set<string>) => Set<string>) => void,
  id: string,
  action: (id: string, on: boolean) => Promise<void>,
  failMsg: string,
) => {
  if (!currentUserId) { router.push("/login"); return; }
  const willOn = !set.has(id);
  setSet((prev) => { const n = new Set(prev); willOn ? n.add(id) : n.delete(id); return n; });
  action(id, willOn).catch(() => {
    setSet((prev) => { const n = new Set(prev); willOn ? n.delete(id) : n.add(id); return n; });
    toast(failMsg);
  });
};

const toggleFollowUser = (id: string) => optimisticToggle(followedUsers, setFollowedUsers, id, followUserAction, "Couldn't update follow — try again");
const toggleFollowRoaster = (id: string) => optimisticToggle(followedRoasters, setFollowedRoasters, id, followRoasterAction, "Couldn't update follow — try again");
const toggleSaveTasting = (id: string) => optimisticToggle(savedTastings, setSavedTastings, id, saveTastingAction, "Couldn't save — try again");
const toggleWishlistBean = (id: string) => optimisticToggle(wishedBeans, setWishedBeans, id, wishlistBeanAction, "Couldn't update wishlist — try again");
```

- [ ] **Step 3: Extend `ShellApi` + the `shell` object.** Add to the `ShellApi` interface: `followedUsers: Set<string>; followedRoasters: Set<string>; savedTastings: Set<string>; wishedBeans: Set<string>; toggleFollowUser: (id: string) => void; toggleFollowRoaster: (id: string) => void; toggleSaveTasting: (id: string) => void; toggleWishlistBean: (id: string) => void;`. Add the matching keys to the `shell` object literal.

- [ ] **Step 4: Expose `followingTastings` to the data layer.** Pass `followingTastings={initialData.followingTastings}` into `<DataProvider>` and add it to `DataApi` (`components/data-context.tsx`) as `FOLLOWING: Tasting[]` (mirroring how `TASTINGS` is provided). This lets `FeedScreen` read `D.FOLLOWING`.

- [ ] **Step 5: Typecheck.** Run: `npx tsc --noEmit` → red only on the UI files Tasks 6-7 touch (cards/detail/screens). Provider + data-context clean.

- [ ] **Step 6: Commit.**
```bash
git add components/app-provider.tsx components/data-context.tsx
git commit -m "feat(m2,client): optimistic follow/save/wishlist Sets + ShellApi; expose followingTastings"
```

---

## Task 6: Lazy comment-thread component

**Files:** Create `components/comment-thread.tsx`

- [ ] **Step 1: Implement the component.** Create `components/comment-thread.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useData } from "./data-context";
import { relativeTime } from "@/lib/relative-time";
import { fetchComments, addComment, updateComment, deleteComment } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Comment } from "@/lib/types";

export function CommentThread({ tastingId }: { tastingId: string }) {
  const D = useData();
  const me = D.currentUserId;
  const [list, setList] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchComments(tastingId).then(setList).catch(() => setList([])); }, [tastingId]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || pending) return;
    if (!me) return; // button is hidden for anon, but guard anyway
    setPending(true); setError(null);
    const temp: Comment = { id: `temp-${tastingId}-${body.length}`, tastingId, userId: me, body, createdAt: new Date().toISOString(), updatedAt: null };
    setList((l) => [...(l ?? []), temp]);
    try {
      const real = await addComment({ tastingId, body });
      setList((l) => (l ?? []).map((c) => (c.id === temp.id ? real : c)));
      setDraft("");
    } catch (e) {
      setList((l) => (l ?? []).filter((c) => c.id !== temp.id));
      setError(e instanceof Error ? e.message : "Couldn't post that comment.");
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: string) => {
    const prev = list;
    setList((l) => (l ?? []).filter((c) => c.id !== id));
    try { await deleteComment(id); } catch { setList(prev); }
  };

  if (list === null) return <div style={{ padding: "8px 16px", fontSize: 13, color: "var(--mocha)" }}>Loading comments…</div>;

  return (
    <div style={{ padding: "4px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      {list.map((c) => (
        <CommentRow key={c.id} c={c} mine={c.userId === me} user={D.user(c.userId)} onDelete={() => remove(c.id)}
          onEdit={async (body) => { const real = await updateComment({ id: c.id, body }); setList((l) => (l ?? []).map((x) => (x.id === c.id ? real : x))); }} />
      ))}
      {me ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} placeholder="Add a comment…"
            className="resize-y rounded-[var(--r-md)] border-[var(--line)] bg-[var(--surface)] text-[14px]" />
          <Button onClick={submit} disabled={!draft.trim() || pending}>{pending ? "…" : "Post"}</Button>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--mocha)" }}>Sign in to comment.</div>
      )}
      {error && <div role="alert" style={{ fontSize: 12.5, color: "var(--berry, #a8434a)" }}>{error}</div>}
    </div>
  );
}

function CommentRow({ c, mine, user, onDelete, onEdit }: {
  c: Comment; mine: boolean; user: ReturnType<ReturnType<typeof useData>["user"]>;
  onDelete: () => void; onEdit: (body: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(c.body);
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
      <span style={{ fontWeight: 600 }}>{user?.name ?? "Someone"}</span>{" "}
      <span style={{ color: "var(--mocha)", fontSize: 12 }}>· {relativeTime(c.createdAt)}{c.updatedAt ? " · edited" : ""}</span>
      {editing ? (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <Textarea value={val} onChange={(e) => setVal(e.target.value)} rows={1} className="text-[13.5px]" />
          <Button size="sm" onClick={async () => { await onEdit(val.trim()); setEditing(false); }} disabled={!val.trim()}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => { setVal(c.body); setEditing(false); }}>Cancel</Button>
        </div>
      ) : (
        <div style={{ color: "var(--coffee)" }}>{c.body}</div>
      )}
      {mine && !editing && (
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          <Button size="sm" variant="ghost" className="h-auto p-0 text-[12px]" onClick={() => setEditing(true)}>Edit</Button>
          <Button size="sm" variant="ghost" className="h-auto p-0 text-[12px]" onClick={onDelete}>Delete</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck.** Run: `npx tsc --noEmit` → no new errors from this file (it only adds). Remaining errors are the card/detail/screens wiring (Task 7).

- [ ] **Step 3: Commit.**
```bash
git add components/comment-thread.tsx
git commit -m "feat(m2,ui): lazy comment-thread component (load on expand, optimistic compose/edit/delete)"
```

---

## Task 7: UI wiring — save, comments, follow, wishlist, feed tabs, Journal Saved

**Files:** Modify `components/cards.tsx`, `components/detail.tsx`, `components/screens.tsx`, `app/page.tsx`, `app/roaster/[id]/page.tsx`, `app/profile/page.tsx`

> Read each file's current markup at the cited anchors; the snippets below are the exact wiring contract — match the surrounding style.

- [ ] **Step 1: `TastingCard` — real Save + comment expand + count.** In `components/cards.tsx`: it already calls `const shell = useShell()`. Replace the local `const [saved, setSaved] = useState(false)` (~`:31`) and its toggle with `const saved = shell.savedTastings.has(tasting.id)` and `onClick={() => shell.toggleSaveTasting(tasting.id)}`. Add `const [showComments, setShowComments] = useState(false)`. Wire the comment `ActionBtn` (~`:146`): `onClick={() => setShowComments((s) => !s)}` and `label={tasting.commentsCount}`. After the actions row, render `{showComments && <CommentThread tastingId={tasting.id} />}` (import `CommentThread` from `./comment-thread`).

- [ ] **Step 2: `RoasterDetail` — real follow.** In `components/detail.tsx` (~`:413,441`): get `const shell = useShell()`; replace local `following` with `const following = shell.followedRoasters.has(roaster.id)` and the button `onClick={() => shell.toggleFollowRoaster(roaster.id)}`; the follower number comes from the derived `roaster.followers`.

- [ ] **Step 2b: `BeanDetail` — real wishlist.** (~`:56,217`): replace local `following` ("Want to try") with `const wished = shell.wishedBeans.has(bean.id)` + `onClick={() => shell.toggleWishlistBean(bean.id)}` (keep the `!isOwner` gate). Render `{showComments && <CommentThread .../>}` in the reviews area if a per-review thread is desired (optional; the feed card already covers it).

- [ ] **Step 2c: `ProfileScreen` — follow another user.** When viewing a profile that is not your own (`user.id !== D.currentUserId`), render a Follow button driven by `shell.followedUsers.has(user.id)` + `shell.toggleFollowUser(user.id)`. (Own profile keeps the Edit button.)

- [ ] **Step 3: `FeedScreen` tabs.** In `components/screens.tsx` (~`:77-79`): change `const tabs = ["Recent", "Following", "Popular"]`. Build the list per tab:
```tsx
let list = filter === "Following" ? [...D.FOLLOWING]
         : filter === "Popular"   ? [...D.TASTINGS].sort((a, b) => b.likes - a.likes)
         : [...D.TASTINGS];
```
When `filter === "Following"` and `list.length === 0`, render an empty state: "You're not following anyone yet — find people on Discover." Update the sub-copy ("Fresh tastings from roasters and people you follow.") to be accurate per tab (Recent: "The latest brews across Cortado.").

- [ ] **Step 4: Journal "Saved" section.** In `components/screens.tsx` `JournalScreen`: add a third section toggle alongside Brews / My Shelf, "Saved", listing `D.TASTINGS.filter((t) => t.savedByMe)` (as `TastingCard`s) and `D.BEANS.filter((b) => b.wishlistedByMe)` (as `BeanCard`s, "Want to try"). Empty state when both are empty.

- [ ] **Step 5: Default tab flip.** In `app/page.tsx` (~`:10`): default `filter` from `"Following"` → `"Recent"`, and the clean-URL special-case (`f === "Following" ? "/" : ...`) → `f === "Recent" ? "/" : ...`.

- [ ] **Step 6: Page connectors.** Ensure `app/roaster/[id]/page.tsx` and `app/profile/page.tsx` pass any new handlers their detail components need (most read `useShell()` directly per Task 7 — verify no prop is missing). `RoasterDetail`/`ProfileScreen` may need `useShell()` access if they don't already.

- [ ] **Step 7: Typecheck + manual smoke.** Run: `npx tsc --noEmit` → exit 0. Run `npm run dev`; sign in (one account) → confirm Save persists across reload, comment compose/edit/delete works, wishlist persists, follow buttons toggle. Stop dev.

- [ ] **Step 8: Commit.**
```bash
git add components/cards.tsx components/detail.tsx components/screens.tsx app/page.tsx app/roaster/[id]/page.tsx app/profile/page.tsx
git commit -m "feat(m2,ui): wire save/comment/follow/wishlist; Recent/Following/Popular tabs; Journal Saved section"
```

---

## Task 8: Live multi-account verification + close-out

> No committed seed — exercise the social graph with ephemeral browser accounts (the M1 spike proved mocks miss `::int`/`$1::text`/FK bugs).

- [ ] **Step 1: Reset + run.** `npm run db:reset && npm run dev`.
- [ ] **Step 2: Two accounts.** Sign up **Account A** (add a bag + log 2 brews). Sign up **Account B** in a second browser/profile (add a bag + a brew).
- [ ] **Step 3: Follows.** As B, open A's profile → Follow → A's `followers` shows 1, B's `following` shows 1. B's Feed "Following" tab now shows A's tastings; "Recent" shows everyone; empty-state gone.
- [ ] **Step 4: Roaster follow.** Follow a roaster → its follower count increments (derived, not a stored +1).
- [ ] **Step 5: Save + wishlist.** As B, Save one of A's tastings and wishlist A's bean → both appear in B's Journal "Saved"; reload → still there (persisted, not local state).
- [ ] **Step 6: Comments.** As B, comment on A's tasting → the card badge increments (NOT `"01"` string-concat — the bigint cast bug); as A, see B's comment. Edit B's own comment (shows "· edited"); delete it → badge decrements. Confirm A cannot edit/delete B's comment (no Edit/Delete affordance; a direct `deleteComment` call throws).
- [ ] **Step 7: Edge cases.** Confirm no Follow button on your own profile; `toggleFollowUser(self)` throws; unfollow drops counts + empties the Following feed; sign out → Sets re-seed correctly on next sign-in.
- [ ] **Step 8: Gates.** Run: `npx vitest run` (all green), `npx tsc --noEmit` (exit 0), `npm run build` (succeeds).
- [ ] **Step 9: Mark spec implemented + PR.** Set the spec Status → Implemented; commit; `gh pr create --base main --head feat/m2-social-layer` with a milestone summary linking the spec/plan.

---

## Self-review notes (author)

- **Spec coverage:** typed tables (T1), types (T2), compute-on-read counts+flags + Following feed + lazy comments + membership lists (T3), validation + guarded actions (T4), optimistic Sets/ShellApi (T5), lazy thread component (T6), all UI wiring + feed tabs + Journal Saved + default flip (T7), live multi-account verification (T8). All present.
- **Type consistency:** `commentsCount`/`savedByMe`/`followedByMe`/`wishlistedByMe` defined T2, produced T3, consumed T7; `Comment`/`AddCommentInput`/`UpdateCommentInput` defined T2, used T4/T6; `followingTastings` + membership lists defined T2, produced T3, consumed T5/T7; ShellApi toggles defined T5, consumed T7.
- **Carryover:** comment optimistic temp id uses a non-random key (`temp-${tastingId}-${body.length}`) because `Math.random`/`Date.now` are fine in client components but the value only needs to be unique within the in-flight window before the server id replaces it.
- **Known M3 follow-ups (flagged, not built):** Popular tab still client-sorts (server `order by likes` at M3 pagination); Journal "Saved" client-filters the loaded sets (fine until pagination); `tastings.user_id` still lacks `on delete cascade`.
