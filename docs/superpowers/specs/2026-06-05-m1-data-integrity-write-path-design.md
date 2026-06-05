# M1 — Data Integrity & Core Write Path — Design

**Date:** 2026-06-05
**Status:** Proposed (design); pending user approval → implementation plan
**Branch:** `feat/m1-data-integrity` (to be created off `main`)
**Council review:** ratified by a model-diverse council (architect/correctness — Opus; implementation/testability — Sonnet; contrarian/red-team — Opus). The council materially amended the original plan (see "What the council changed"). Amendments folded in below.

## Summary

Cortado's write path is auth-correct but **data-incorrect**. The denormalized
counter columns (`beans.avg_rating`/`ratings`, `users.tastings`,
`tastings.likes`/`comments`, `roasters.followers`/`beans`) are written once at
insert and **never updated** — the only `UPDATE` in the entire app is the
`session_version` bump (`lib/users-repo.ts:76`). Because the seed arrays are
empty (`lib/seed-data.ts:27-43`), every real bag shows `ratings = 0` /
`avg_rating = 0` no matter how many brews are logged, `users.tastings` is frozen
at 0, and `tastings.likes` only ever shows the viewer's own optimistic `+1`
(`components/cards.tsx:137`). The result is **same-page contradictions** — e.g.
the Profile "Tastings" stat shows 0 while the list of tastings below it grows
(`components/detail.tsx:499` vs `:457`).

The root mechanical cause of the *staleness* is the **seed-once client provider**:
`AppProvider` copies `getAppData()` into `useState` once at mount
(`components/app-provider.tsx:49-51`) and there is **no** `revalidatePath` or
`router.refresh()` anywhere in the repo, so the client never re-reads server
truth after a write.

M1 makes every number the product shows **true**, makes writes **durable,
validated, and honestly reported** in the UI, and adds **edit/delete** for the
core objects — without regressing the existing auth/ownership guarantees.

## Goals

- Counts and averages are always correct, including after edit and delete.
- The UI never shows a false success (the current fire-and-forget "Brew logged!"
  panel renders before the Server Action resolves).
- Server Actions validate their input (they are public endpoints).
- Users can edit/delete a brew, edit a bag, and delete a bag (gated).
- No regression to authorization, ownership scoping, or private-field redaction.

## Non-goals (explicitly deferred)

- **Migration tooling** → M3 (edit `db/schema.sql` directly now; no prod data).
- **Pagination / server-scoping of `getAppData`** → M3. M1 must not *depend* on
  "load the whole DB" (see the client-derivation ban below) so that M3 is free.
- **Social layer** (follows/comments/saves) → M2. M1's data model stays
  forward-compatible (compute-on-read extends to those counts trivially).
- **Real integration tests against Postgres** → M3 (M1 uses the existing
  mock-`@/lib/db` pattern).
- **Numeric brew-param schema columns** → M3 (kept as validated `text` now).

## Locked decisions (product owner)

1. **Compute-on-read** for all counts/aggregates — stop treating the
   denormalized columns as source of truth.
2. **M1 scope** = core data-integrity **+** edit/delete brews & bags **+**
   numeric brew-param parsing/validation.
3. **Defer migration tooling to M3**; edit `db/schema.sql` directly now; keep
   forward-compatible with follows/comments/saves.
4. **Reconciliation** via React 19 `useOptimistic` + `useActionState`.
5. **Bag delete** kept in M1, **gated behind a confirmation** that shows how many
   brews will be cascade-deleted.

## What the council changed (vs. the pre-council sketch)

- **Compute-on-read is SERVER-SIDE ONLY.** The original sketch proposed deriving
  brew counts *client-side* from the in-memory `tastings` array. The council
  (both architect and contrarian) rejected this: it is correct only while the
  client holds every row, which directly conflicts with the M3 pagination goal —
  once `getTastings()` returns a window, `D.TASTINGS.filter(...).length` silently
  **undercounts** with no error. **Rule adopted:** *no client-side derivation of
  any count a paginated query will later truncate.* All counts come from SQL.
- **Fix the provider; don't work around it.** The frozen provider is the actual
  staleness bug. Reconcile via `useOptimistic` over server-truth props +
  `revalidatePath`/`router.refresh()`, not via a hand-rolled second derivation
  engine.
- **Single like-source kills the double-count.** Fold `likedByMe` into
  `getTastings` and retire `getLikedTastingIds`; the optimistic delta is computed
  *relative to* the server's true total, not baked into the base count.

## Architecture

### A. Server — compute-on-read (`lib/queries.ts`)

Replace the stored counter reads with **set-based aggregate LEFT JOINs** (one
scan + hash join; *not* correlated subqueries / N+1). `COALESCE(...,0)` is
mandatory everywhere (AVG over zero rows is `NULL`, which would `NaN`-poison the
Discover "Trending" sort at `components/screens.tsx:466`). Round the average in
SQL so the UI prints `4.3`, not `4.333…`.

**`getBeans($1 = currentUserId)`** — keep the existing owner-redaction projection
verbatim; only `avgRating`/`ratings` change source:

```sql
... ,
coalesce(r.avg_rating, 0)::float8 as "avgRating",
coalesce(r.ratings, 0)            as "ratings",
...
from beans b
left join (
  select bean_id, round(avg(rating), 1) as avg_rating, count(*) as ratings
  from tastings group by bean_id
) r on r.bean_id = b.id
order by b.created_at desc, b.id;
```

**`getUsers`** — `left join (select user_id, count(*) as tastings from tastings
group by user_id)`.

**`getTastings($1 = currentUserId)`** — derive the like total and the viewer's
membership in one pass; this **retires `getLikedTastingIds`** and the separate
`likedIds` round-trip in `getAppData`:

```sql
coalesce(l.likes, 0) as likes,
($1 is not null and exists (
  select 1 from likes lm where lm.tasting_id = t.id and lm.user_id = $1
)) as "likedByMe"
... left join (select tasting_id, count(*) as likes from likes group by tasting_id) l
    on l.tasting_id = t.id
```

The client `likes` Set is seeded from `tastings.filter(t => t.likedByMe)`.

**Indexes (`db/schema.sql`)** — add:
- `create index tastings_user_idx on tastings (user_id);` (getUsers group-by)
- `create index likes_tasting_idx on likes (tasting_id);` (the `likes` PK is
  `(user_id, tasting_id)` — wrong leading column for a per-tasting count)

The denormalized columns stay physically (decision 3, forward-compat) but are
**never read**; mark them `-- derived on read; not maintained` in the schema.

### B. Server — write actions (`app/actions.ts`)

- `logBrew` / `addBag`: drop the now-ignored counter writes; add **validation**
  (§D) and **numeric-param normalization** (§E). `logBrew` stops inserting the
  literal `'now'` into `time` — `time` is dropped from display in favor of a
  relative label computed from `created_at` (expose `created_at` in
  `TASTING_COLS`; compute the label client-side so it stays fresh).
- New actions, each `requireUserId()` + ownership guard `where id=$1 and
  user_id=$2` (mirrors `logBrew` `app/actions.ts:20`), `throw` on 0 rows:
  - `updateBrew(id, input)` — updates **only** editable fields; **must not touch
    `time`/`created_at`** (would reorder the feed). Returns the updated `Tasting`.
  - `deleteBrew(id)` — returns `void`.
  - `updateBag(id, input)` — returns the updated `Bean`.
  - `deleteBag(id)` — cascade-deletes its tastings + their likes via existing FKs
    (`db/schema.sql:88,103`); gated behind the confirm in §F.
- All four call `revalidatePath('/', 'layout')` after the write so the
  `force-dynamic` root layout re-runs `getAppData()` (§C).
- New input types in `lib/types.ts`: `UpdateBrewInput`, `UpdateBagInput`.

### C. Client — reconciliation via `useOptimistic` + `useActionState` (the keystone)

The bug: `AppProvider` copies `initialData` into `useState` once
(`components/app-provider.tsx:49-51`), so revalidated server data never re-bases.

The fix:
- Treat `initialData` (from the `force-dynamic` root layout) as the **canonical
  source**. Replace the copy-once `useState(initialData.*)` with `useOptimistic`
  bases over `initialData.beans` / `tastings` / `likes`, so a `revalidatePath`
  re-render **re-bases** them automatically.
- The sheets/forms drive the action through `useActionState` (or `useTransition`)
  for a real **pending** state and error surfacing.
- Optimistic updates remain as **latency cover**; they reconcile to server truth
  when the action resolves and the route revalidates. This deletes the manual
  rollback at `app-provider.tsx:132-141` and the baked-in `+1` at `cards.tsx:137`.
- Like display = `serverLikes + delta`, where `delta` is *relative*:
  `liked && !likedByMe ? +1 : !liked && likedByMe ? -1 : 0`.

> **Risk / spike (council-flagged, MEDIUM confidence).** `AppProvider` also holds
> scroll-restoration refs and log-sheet UI `useState` (`app-provider.tsx:61-97`).
> The re-base must be **surgical**: only the data bases re-sync; scroll + sheet UI
> state must survive. **Implementation task 0 is a throwaway spike** proving that
> `revalidatePath('/', 'layout')` from a Server Action re-flows fresh
> `initialData` into the force-dynamic root layout and that `useOptimistic`
> re-bases without disrupting scroll/sheet state. If the spike fails, fall back to
> the lower-risk alternative: `router.refresh()` + a surgical
> `useEffect([initialData])` data-only re-sync (keep optimistic merge).

### D. Validation (hand-rolled, no Zod)

Extend the existing `lib/signup-validation.ts` pattern (consistency; no new prod
dependency) in a new `lib/brew-validation.ts`:
- `validateLogBrew` / `validateUpdateBrew`: `beanId` required (string),
  `rating` integer 1–5, `brew` from an allowlist (default `V60`), `note` length
  cap, numeric params via §E.
- `validateAddBag` / `validateUpdateBag`: `name`/`roasterName` 1–80, `origin`
  1–120, `process`/`roast` non-empty, `scaScore` clamped to 80–100, `color` hex,
  `flavors` array capped (max 10). Returns a discriminated
  `{ ok: true, value } | { ok: false, error }`.

### E. Numeric brew params (keep `text`, validate + normalize)

`dose`/`ratio`/`temp` stay `text` (no schema churn before M3). The components
already emit canonical display strings (`"15g"`, `"1:16"`, `"94°C"`,
`components/log-sheet.tsx:114-116`). Add server-side `normalizeDose/Ratio/Temp`
that accept the formatted string **or** a raw number, reject garbage (e.g.
`"abcg"`), and emit the canonical form or the `"—"` sentinel. This makes the
values parseable later (`split_part`/cast) without committing to columns now.

### F. Edit/delete UI

- A tasting **edit/delete** entry point from `TastingCard` (and the journal/bean
  detail lists) opening the log sheet in an **edit mode** pre-populated from the
  existing tasting; delete uses an inline confirm.
- A bag **edit** entry from the bean/bag detail; bag **delete** behind a
  confirmation: *"Delete `<bag>`? This also removes the N brews you logged against
  it."* (N comes from the derived `ratings` count — already on the bean).
- Decrement the `remaining` fraction is **in scope** (it is currently hard-set to
  `1` at `app/actions.ts:47` and shown as a ring); editing/“used a dose” adjusts
  it. (If this balloons, it can split to a follow-up — flagged, not cut.)

## Data flow (after M1)

1. Server: root layout (`force-dynamic`) → `getAppData()` derives all counts via
   SQL aggregates → `initialData`.
2. Client: `AppProvider` bases `useOptimistic` on `initialData`; screens read
   derived counts straight from server data (no client recomputation of counts).
3. Write: sheet → `useActionState` → Server Action (`requireUserId` + validate +
   ownership guard + write) → `revalidatePath('/', 'layout')`.
4. Reconcile: optimistic value shows instantly; the revalidation re-runs the
   layout, re-bases `useOptimistic` to server truth, and the optimistic delta
   resolves. No double-count, no stale stat, correct under future pagination.

## Testing

Extend the existing **mock-`@/lib/db`** unit pattern (`test/log-brew.test.ts`,
`test/db.test.ts`); no pg-mem/testcontainers in M1.
- Ownership-guard SQL assertions for `updateBrew`/`deleteBrew`/`updateBag`/
  `deleteBag` (`where id = $… and user_id = $…`; throws on empty `rows`).
- Like-count math: no double-count for an already-liked tasting; relative delta.
- Compute-on-read structural assertions (aggregate `left join` + `coalesce(...,0)`
  present; `BEAN_COLS` no longer reads bare `avg_rating`) — same regex-over-source
  class as the existing projection guards (blind spot: doesn't execute SQL — noted
  for M3 integration tests).
- Validation unit tests for `lib/brew-validation.ts` (mirror
  `test/signup-validation.test.ts`).
- Submit-state correctness is verified in review + manual smoke (the Vitest env is
  `node`, no DOM); a Playwright happy-path is an M3 item.

## Edge cases (must be handled)

- AVG over zero rows → `COALESCE(...,0)`; guard `bean.ratings > 0` branches still
  flip back to the "New bag" state when the last brew is deleted.
- Delete the **last** brew of a bag → `ratings → 0`, `avgRating → 0` on next read.
- Edit a rating → `AVG` re-derives; no counter read-modify-write needed.
- `deleteBag` cascade removes its tastings + likes atomically; other beans/users'
  derived counts unaffected.
- A successful self-delete must splice the row out of the optimistic base too (or
  the revalidate must land) so the feed/derived counts drop.
- `Popular` sort (`screens.tsx:78`) finally sorts on real like totals — add a test.

## Risks

- **Provider re-base** (the spike, §C). Primary risk; de-risked by task 0 + the
  `router.refresh` fallback.
- **Aggregate read cost at scale.** Negligible at current scale with the two new
  indexes; if it ever bites, M3 (pagination/materialized view) is the lever — *not*
  client derivation.
- **Edit reordering the feed** if `updateBrew` touches `time`/`created_at` — column
  list kept tight; covered by a test.

## Forward-compatibility with the social layer (M2)

Compute-on-read generalizes cleanly: `users.followers`/`following`,
`roasters.followers`, and `tastings.comments` become the same `COUNT(*)`
aggregates over future `follows`/`comments` tables. Nothing in M1's data model
blocks that. The reconciliation pattern (`useOptimistic` + `revalidatePath`)
applies unchanged to follow/comment/save actions.

## Implementation sequencing (for the plan)

0. **Spike**: prove `revalidatePath` re-flow + `useOptimistic` re-base preserves
   scroll/sheet state (decide keystone vs. fallback).
1. Compute-on-read queries + indexes + retire `getLikedTastingIds`.
2. `useOptimistic`/`useActionState` provider refactor; relative like delta.
3. Validation (`lib/brew-validation.ts`) + numeric normalization; wire into
   `logBrew`/`addBag`.
4. Submit-state fix (await + pending + real success/error) in `log-sheet`/
   `bag-form`/provider.
5. Edit/delete actions (4) + ownership guards + `revalidatePath`.
6. Edit/delete UI + bag-delete confirm + `remaining` decrement.
7. Real timestamps from `created_at`.
8. Tests across all of the above.
