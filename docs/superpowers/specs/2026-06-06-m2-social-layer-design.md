# M2 — Social Layer — Design

**Date:** 2026-06-06
**Status:** Implemented (2026-06-06). All 8 plan tasks on `feat/m2-social-layer`; 83 unit tests + tsc + build green; security review of queries APPROVED; final review fixes applied; live 2-account browser verification passed (follow→Following feed, save→Journal Saved, comment compose/edit, bidirectional counts, self-follow guard). The live run caught+fixed a logBrew dropped-column bug.
**Branch:** `feat/m2-social-layer` (off `main`, M1 merged @ `998fdbe`)
**Council review:** ratified by a model-diverse council (architect/correctness — Opus; implementation/testability — Sonnet; contrarian/red-team — Opus). The council materially amended the plan twice (see "What the council changed"). Amendments folded in below.

## Summary

M1 made the write path honest. M2 makes the **social layer real** — the affordances the prototype faked with local `useState` (or no handler at all): **follow a user**, **follow a roaster**, **comment on a tasting**, **save/bookmark a tasting**, **wishlist ("want to try") a bean** — plus a **real "Following" feed** (today the Following tab renders the full unfiltered list; `components/screens.tsx:77-79`, default at `app/page.tsx:10`) and a **Journal "Saved" section**.

Every new count/flag is **compute-on-read, server-side only** (extending the M1 pattern to `followers`/`following`/`commentsCount` and the per-viewer flags `followedByMe`/`savedByMe`/`wishlistedByMe`), backed by **typed FK join tables** matching the house style (`likes`, `accounts`). The toggles reuse M1's proven `likes` Set + `revalidatePath` reconciliation; **comments load lazily per-tasting** and live in a self-contained thread component (never in `getAppData`).

## Goals

- Replace all five faked social affordances with persisted, server-backed behaviour that survives reload and is correct for every viewer.
- Make the "Following" feed real via the follow graph; fix the misleading "people you follow" copy; default to a Recent feed that works for anon/new users.
- No regression to M1's auth, ownership, redaction, or compute-on-read guarantees.

## Non-goals (deferred)

- **Migration tooling** → M3 (edit `db/schema.sql` directly; `db:setup` is destructive but there is no prod data).
- **Pagination / server-scoping of `getAppData`** → M3. M2 must not *depend* on "load everything": counts come from SQL, the Following feed is a server query (so M3 just adds `limit/offset`), and comments load lazily.
- **Committed demo seed data** → out (user decision). Verification uses **ephemeral browser-created test accounts**, not a seed fixture. Prod/dev DBs start empty.
- **Notifications**, comment replies/threading (flat only), follow-suggestions, blocking/muting → later.

## Locked decisions (product owner + council)

1. **One spec / one branch / one PR**, sequenced: **Follows → Comments → Saves → real Following feed**.
2. **Typed FK tables** (not polymorphic) — real FKs + `on delete cascade`, matching `likes`.
3. **Compute-on-read, server-side only** for all new counts + per-viewer flags (never client-derive a count a future paginated query truncates).
4. **Feed tabs:** Recent (default) · Following · Popular; **drop "Nearby"** (no geo data).
5. **Depth = Fuller:** comments support compose + **edit-own** + delete-own + inline thread + live count; saves/wishlist persist **and** get a Journal "Saved" section.
6. **No committed demo seed** — verify with ad-hoc accounts.

## What the council changed (vs. the pre-council sketch)

- **Comments load LAZILY, not in `getAppData`.** The pre-council sketch carried a flat `comments` array on `AppData`. The council (unanimous) rejected eager loading: comments are the one *unbounded-per-row* entity, and shipping every comment of every tasting to every client worsens the `getAppData` payload debt **and** re-opens the data-exposure surface M1's redaction closed (`lib/queries.ts:51-54`). **Adopted:** a `getComments(tastingId)` server query fetched on thread-expand; comments live in a self-contained local-state component, NOT the global provider. The collapsed badge uses the derived `commentsCount` on the tasting.
- **Demo-seed acceptance criterion — considered, declined.** The contrarian insisted multi-user demo seed is required to make the features exercisable. The product owner declined a committed seed; instead **verification creates ephemeral accounts in the browser** (the M1 spike proved the real DB catches `::int`/`$1::text`/FK bugs that mocks miss — so M2's verification phase MUST exercise ≥2 real accounts against Postgres, just without a committed fixture).
- **Following feed = server query, not client filter** (the M1 pagination landmine, re-armed). Filtering the already-loaded set breaks under M3 pagination; a `getFollowingTastings(currentUserId)` server query is the correct seam.

## Architecture

### A. Schema (`db/schema.sql`) — typed FK join tables

Add (mirroring `likes`: composite-PK, `text` ids, FK `on delete cascade`). Add matching `drop table if exists … cascade` lines at the top in reverse-dependency order (before `tastings`/`beans`/`users`).

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
  updated_at timestamptz                       -- null until first edit
);
```

**Drop the now-derived stale columns** (mirroring M1's treatment of `likes`/`avg_rating`): remove `users.followers`, `users.following`, `roasters.followers`, `tastings.comments` from the schema **and** from the `scripts/db-setup.ts` seed inserts.

**Reverse indexes** (composite PKs already cover the forward lookup; the count direction + join filters need the reverse):
```sql
create index user_follows_followee_idx   on user_follows   (followee_id);
create index roaster_follows_roaster_idx  on roaster_follows (roaster_id);
create index tasting_saves_tasting_idx    on tasting_saves   (tasting_id);
create index comments_tasting_idx         on comments        (tasting_id);
-- user_follows PK (follower_id,…) drives the Following-feed join; *_saves/_wishlist PK (user_id,…) drives the Journal "Saved" lookups.
```

### B. Read queries (`lib/queries.ts`) — compute-on-read, server-side

Same gotchas as M1, enforced by tests: **`::int`** on every `count(*)` (pg returns bigint as a string), **`$1::text is not null`** for anon-safe flags, **COALESCE** for zero rows, **explicit column lists** (never `u.*` — `projection-guard.test.ts` forbids leaking `email`/`password_hash`).

- **`getRoasters(currentUserId)`** (gains the param, threaded from `getAppData`): derive `followers` from `roaster_follows`; add `followedByMe` via `exists`.
- **`getUsers`**: derive `followers` (count where `followee_id = u.id`) and `following` (count where `follower_id = u.id`) from `user_follows`; add `followedByMe`.
- **`getTastings`**: add `savedByMe` (`exists` on `tasting_saves`); replace the dropped static `comments` with derived `commentsCount` (`left join … count(*) … ::int`). `TASTING_COLS` (used by `logBrew`/`updateBrew` returns) loses `comments`; the actions append literal `0 as "commentsCount", false as "savedByMe"` (a fresh tasting has none).
- **`getBeans`**: add `wishlistedByMe` (`exists` on `bean_wishlist`); already takes `$1`.
- **`getFollowingTastings(currentUserId)`** (NEW): the `getTastings` projection, `join user_follows uf on uf.followee_id = t.user_id and uf.follower_id = $1`; returns `[]` without a DB hit when `currentUserId` is null. (M3 appends `limit/offset`.)
- **`getComments(tastingId)`** (NEW, lazy): `select id, tasting_id as "tastingId", user_id as "userId", body, created_at as "createdAt", updated_at as "updatedAt" from comments where tasting_id = $1 order by created_at`. The query body lives in `lib/queries.ts` (server-only); it is exposed to the client thread component as a thin **Server Action** in `app/actions.ts` (`"use server"`) that the component `await`s on expand.
- **`getAppData`**: thread `currentUserId` into `getRoasters`; add `followingTastings` (from `getFollowingTastings`) and the current user's **membership id-lists** — `followedUserIds`, `followedRoasterIds`, `savedTastingIds`, `wishedBeanIds` (simple `select … where (follower|user)_id = $1`, `[]` for anon) to seed the client Sets. **Comments are NOT added to `getAppData`.**

### C. Types (`lib/types.ts`)

- `User`: `followedByMe: boolean` (keep `followers`/`following` as derived numbers).
- `Roaster`: `followedByMe: boolean`.
- `Tasting`: replace `comments: number` with `commentsCount: number`; add `savedByMe: boolean`.
- `Bean`: `wishlistedByMe: boolean`.
- New `Comment { id; tastingId; userId; body; createdAt; updatedAt: string | null }`.
- `AppData`: add `followingTastings: Tasting[]`, `followedUserIds`, `followedRoasterIds`, `savedTastingIds`, `wishedBeanIds` (string[]).
- New inputs: `AddCommentInput { tastingId; body }`, `UpdateCommentInput { id; body }`.

### D. Server Actions (`app/actions.ts`) — guarded + revalidated

All call `requireUserId()` first and `revalidatePath('/','layout')` after. Toggles use `insert … on conflict do nothing` / `delete where (a,b)` (idempotent, mirroring `toggleLike`):
- `toggleFollowUser(targetId, follow)` — **self-follow guarded** (`if (targetId === userId) throw`) in addition to the DB `CHECK`.
- `toggleFollowRoaster(roasterId, follow)`, `toggleSaveTasting(tastingId, save)`, `toggleWishlistBean(beanId, wish)`.
- `addComment(input)` — `validateComment` → insert → return the new `Comment`.
- `updateComment(input)` — ownership-guarded `update comments set body=$3, updated_at=now() where id=$1 and user_id=$2` (mirror `updateBrew`; re-select with the guard).
- `deleteComment(id)` — `delete from comments where id=$1 and user_id=$2` (mirror `deleteBrew`).

New `lib/comment-validation.ts` (hand-rolled, no Zod; mirrors `brew-validation.ts`): `validateComment(raw)` → trim, reject empty, cap 500 chars; `validateUpdateComment` adds an id check.

### E. Client — provider (`components/app-provider.tsx`)

- Add four `useState<Set<string>>` seeded from the membership id-lists (mirroring the `likes` Set): `followedUsers`, `followedRoasters`, `savedTastings`, `wishedBeans`, each with an optimistic-toggle handler + `.catch()` rollback (the proven `toggleLike` shape at `:146-165`; auth-gate redirect to `/login` when `!currentUserId`).
- Extend `ShellApi` + the `shell` object with the four Sets + `toggleFollowUser/Roaster/Save/Wishlist`.
- **Comments are NOT in the provider.** No comment state here.

### F. Comments — self-contained lazy thread component (`components/comment-thread.tsx`, NEW)

- Rendered inline under the `TastingCard` (and in `BeanDetail` reviews) when a tasting's comment button is expanded. On mount it `await`s the `getComments(tastingId)` Server Action and holds the result in **local** `useState<Comment[]>`.
- Compose box (auth-gated) → optimistic append with a `temp-…` id → `await addComment` → on resolve, replace the temp row with the returned `Comment` (real id); on error, splice it out + toast.
- Each own comment (`c.userId === currentUserId`) gets edit (inline) + delete (inline confirm), calling `updateComment`/`deleteComment`, mirroring M1's `BrewMenu`.
- The collapsed badge on the card shows the server `commentsCount` (not `localComments.length` — that's the truncation rule). On add/delete, optimistically nudge the displayed count locally; `revalidatePath` reconciles it.

### G. UI wiring

- **`TastingCard`** (`components/cards.tsx`): replace local `saved` (`:31`) with `shell.savedTastings.has(id)` + `shell.toggleSaveTasting`; wire the comment button (`:146`) to expand the thread; badge → `tasting.commentsCount`.
- **`RoasterDetail`** (`detail.tsx:413,441`): replace local `following` with `shell.followedRoasters` + toggle; show derived `roaster.followers`.
- **`BeanDetail`** (`detail.tsx:56,217`): replace local "Want to try" `following` with `shell.wishedBeans` + `toggleWishlistBean` (keep the `!isOwner` gate). User-follow button on a *profile you don't own* (via `useShell`).
- **`ProfileScreen`**: a follow button when viewing another user (today only shows own profile); stats already read derived `followers`/`following`.
- **`FeedScreen`** (`screens.tsx:77`): tabs → `["Recent","Following","Popular"]`; Recent renders `D.TASTINGS`, Following renders `D.followingTastings` (server result) with an empty state ("Follow people to fill this feed → Discover"), Popular sorts `D.TASTINGS` by likes (note: M3 makes Popular a server query too). `app/page.tsx:10` default `"Following"` → `"Recent"` + the clean-URL special-case updated.
- **Journal "Saved" section** (`screens.tsx` JournalScreen): a new section/tab listing `D.TASTINGS.filter(t => t.savedByMe)` + `D.BEANS.filter(b => b.wishlistedByMe)`. (Client-filter is acceptable here — Journal is not the paginated feed; flag for M3.)

## Data flow

Server (`force-dynamic` layout) → `getAppData()` derives all counts/flags + membership id-lists + `followingTastings` → `initialData`. Client provider seeds the toggle Sets; screens read derived data. A toggle action → optimistic Set update → Server Action (`requireUserId` + guard + write) → `revalidatePath('/','layout')` → layout re-runs → fresh flags/counts re-base. Comments: thread-expand → `getComments(tastingId)` → local optimistic compose/edit/delete, reconciled by `revalidatePath` (which also refreshes the badge count).

## Edge cases (must handle)

- **Self-follow:** DB `CHECK` + action guard + no follow button on your own profile.
- **Duplicate follow/save/wishlist:** `on conflict do nothing` (composite PK) — idempotent.
- **Comment ownership:** edit/delete guarded `where id=$1 and user_id=$2`, throw on 0 rows.
- **Anon writes:** every action `requireUserId()`; every new button auth-gates (redirect to `/login`) like `toggleLike`.
- **Cascade on delete:** new tables FK `on delete cascade` — deleting a tasting (M1 `deleteBrew`) wipes its comments + saves; deleting a bag wipes wishlist rows; deleting a user wipes their follows/saves/wishlist/comments. (Pre-existing: `tastings.user_id` lacks cascade, but there's no user-delete path yet — note for M3.)
- **Wishlist own bag:** gated by the existing `!isOwner`.
- **Empty Following feed / anon:** server returns `[]`; tab shows the empty-state CTA.
- **`commentsCount` vs loaded thread length:** badge always uses the server count.

## Testing

Extend the mock-`@/lib/db` + source-regex patterns:
- **Action SQL guards** (`test/actions-social.test.ts`): each toggle's `insert … on conflict` / `delete where (a,b)`; self-follow throws pre-DB; `updateComment`/`deleteComment` carry `where id=$1 and user_id=$2` + throw on 0 rows; `addComment` validates before the DB + returns the row + revalidates.
- **Validator** (`test/comment-validation.test.ts`): empty/whitespace → fail; 500 ok, 501 fail; trims.
- **Compute-on-read guards** (extend `test/compute-on-read.test.ts`): new counts cast `::int`; flags use `$1::text is not null`; `getUsers` no longer reads `u.followers`/`u.following`; `getTastings` no longer reads `t.comments` and exposes `"savedByMe"`/`"commentsCount"`; `getRoasters` derives followers.
- **Projection guard** still green (getUsers selects no sensitive columns).
- **Live-DB smoke (REQUIRED — mocks miss the real bugs, per the M1 spike):** create 2-3 ephemeral browser accounts and verify: follow/unfollow a user → counts move + Following feed filters; follow a roaster → count moves; save a tasting → appears in Journal "Saved" after reload; wishlist a bean → "Want to try" persists; add a comment → badge increments (NOT string-concat "01" — the bigint-string bug); edit own comment (only body + `updated_at` change); delete own comment → badge decrements; a second account cannot edit/delete the first's comment; self-follow rejected; sign out → Sets re-seed empty/correct for the next account.

## Build sequence (for the plan)

1. **Schema** + drops + indexes + `db-setup.ts` (drop the 3 stale columns from inserts); `npm run db:setup`.
2. **Types**.
3. **Read queries** (test-locked) — the riskiest correctness surface; do it behind tests before any UI.
4. **Comment validation** + **Server Actions** (test-locked).
5. **Provider** (toggle Sets + handlers + ShellApi).
6. **Comment thread component** (lazy, local-state, optimistic).
7. **UI wiring** (cards/detail/screens/profile + feed tabs + Journal Saved + default-tab flip).
8. **Live browser verification** with ephemeral accounts.

## Forward-compatibility (M3)

The Following feed is already a server query (add `limit/offset`); Popular becomes a server `order by likes desc` query; comments are already lazy (per-thread fetch gains `limit/offset`); compute-on-read counts are unaffected by pagination. Nothing in M2 blocks M3.
