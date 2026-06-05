# Per-User Bag Ownership — Design

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan
**Branch:** `feat/authjs-authentication` (follow-up to the Auth.js feature)
**Council review:** ratified in two rounds by a model-diverse council (architect/correctness, implementation/testability, contrarian/product-risk). Amendments folded in below.

## Summary

The Auth.js work made Cortado multi-user, but `beans` (which double as personal
"bags") have **no owner**, so the shelf — `beans.filter(b => b.owned)`
(`components/data-context.tsx:57`) — shows **every user's bags to everyone**, and
that cascades to the Journal "My Shelf" and the brew-logging bag picker. The
council additionally found that keeping `getBeans()` global ships **other users'
private bag fields** (`remaining`, `bag_weight`, `purchased`, and the `owned`
flag) to every client, so scoping only `shelf()` half-closes the leak.

This design gives `beans` a per-user owner, scopes the shelf and the private bag
fields to that owner, and restricts brew-logging to your own bags — while keeping
beans globally **readable** so the social Feed (which renders other users'
tastings → beans) and Discover still work.

### Decisions (council-agreed)

- **Model:** add an owner column to `beans` (the creator owns the bag). Chosen
  over a split catalog/bags table (heavier; unneeded since every bean today is a
  user-created bag) and over full per-user siloing (would gut the social Feed).
- **Beans stay globally readable** (`getBeans()` returns all) so the Feed/Discover
  resolve any user's bean; **ownership scoping happens on specific fields + the
  shelf**, not by hiding beans.
- **Brew-logging is restricted to owned beans** (the §4 fork — council reached
  unanimous agreement on the server-side guard); logging a coffee you don't own
  is **deferred** to a future "quick-add bag" flow, not cut forever.

## Architecture

### A. Schema (`db/schema.sql`)

- Add to `beans`:
  ```sql
  user_id text references users(id) on delete cascade,   -- owner; null only for a future shared catalog
  ```
  plus a table-level constraint so every **bag** has an owner while leaving room
  for a future ownerless shared catalog:
  ```sql
  constraint beans_owned_has_owner check (not owned or user_id is not null)
  ```
  (`on delete cascade` matches the `tastings`/`likes` FKs — deleting a user
  removes their bags.)
- **Index:** replace the now-redundant `beans_owned_idx` with a composite
  `create index beans_user_owned_idx on beans (user_id, owned);` — the only query
  shape is "my owned beans."
- `addBag` (`app/actions.ts`): store the owner. The INSERT currently passes `null`
  / omits `user_id`; change it to include `user_id = userId` (the value already
  fetched via `requireUserId()` and currently discarded).
- `Bean` type (`lib/types.ts`): add `ownerId?: string | null`.
- `BEAN_COLS` (`lib/queries.ts`): add `user_id as "ownerId"`. `BEAN_COLS` is used
  by `addBag`'s `returning` clause (the owner's own bean — no redaction needed),
  so it returns the full, un-redacted bag.

**Migration mechanics:** `npm run db:setup` drops & recreates from `schema.sql`;
the seed (`lib/seed-data.ts` `BEANS=[]`) is empty, so there is **no backfill** and
the `db-setup.ts` bean loop is a no-op. (If a future seed adds *owned* beans, it
must set `user_id` or the CHECK rejects them — which is correct.)

### B. Read-path scoping in `getBeans` (closes the council's exposure finding)

`getBeans()` keeps returning **all** beans (the Feed needs them), but the
**per-user fields are redacted for non-owners**. Make `getBeans` take the current
user id and scope these four columns in SQL:

```sql
-- getBeans(currentUserId): catalog/social fields stay global; bag-private
-- fields are returned only to the owner.
select
  id, name, roaster_id as "roasterId", roaster_name as "roasterName",
  origin, process, roast, altitude, varietal,
  price::float8 as price, avg_rating::float8 as "avgRating", ratings,
  color, flavors, description as "desc", farm, varieties,
  sca_score::float8 as "scaScore", user_id as "ownerId",
  coalesce(owned and user_id = $1, false)              as "owned",
  case when user_id = $1 then bag_weight end            as "bagWeight",
  case when user_id = $1 then purchased  end            as "purchased",
  case when user_id = $1 then remaining::float8 end      as "remaining"
from beans
order by created_at desc, id
```

- **`owned` is scoped too** (not just the numeric fields) — the council's biggest
  catch: the "On shelf" pill (`components/cards.tsx`) and `shelf()` pivot on
  `owned`, so a globally-true `owned` would mislabel other users' bags as "on
  your shelf." After scoping, `owned` means **owned by *you***.
- **`$1` = `currentUserId`**, threaded from `getAppData` (which already calls
  `getCurrentUserId()`). Pass it as a real SQL `null` for anonymous browse —
  `user_id = null` is never true, so all four fields redact for logged-out users
  (catalog-only view). Caveat for the implementer: pass `null`, never the string
  `"null"`.
- **Catalog/social fields stay global** (`name, origin, farm, flavors, desc,
  color, scaScore, avgRating, ratings, ownerId`) — the Feed cards, Discover
  search (built from `name+origin+flavors`), and Bean Detail render them for any
  bean. Do **not** redact these.
- `shelf()` (`components/data-context.tsx`): `beans.filter(b => b.owned &&
  b.ownerId === currentUserId)`. (`owned` is already owner-scoped from the query;
  the explicit `ownerId` check is belt-and-suspenders and reads clearly.)

`BEAN_COLS` is **not** changed for this (it stays the un-redacted list used by
`addBag`'s `returning`); only `getBeans`'s read projection uses the CASE form.

### C. Restrict brew-logging to owned beans (the §4 decision — unanimous)

- **Server guard (`app/actions.ts` `logBrew`)** — one atomic, TOCTOU-free
  statement that inserts only if the bean belongs to the caller:
  ```sql
  insert into tastings (id, user_id, bean_id, rating, brew, dose, ratio, temp, note, likes, comments, time)
  select $1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, 'now'
  from beans where id = $3 and user_id = $2
  returning ${TASTING_COLS}
  ```
  If `rows.length === 0`, throw a **generic** error (`"Couldn't log a brew for
  that bag."`) — it covers bean-not-found, not-owned, and deleted-bag without
  disclosing which. (`$2 = userId` from `requireUserId()`, `$3 = input.beanId`.)
- **UI (`components/detail.tsx` Bean Detail)** — hide the "Log a brew" affordance
  (both the primary button and the empty-state button) and the "% remaining"
  control for beans you don't own: gate on `bean.ownerId === D.currentUserId`. A
  non-owned bean still shows its catalog info (name, origin, farm, flavors,
  rating, others' tastings). The server guard is the real boundary; the UI hide
  is for coherence.
- **Why restrict:** the brew *picker* (`components/log-sheet.tsx`) already only
  offers `D.shelf()`, so the only path to log against a non-owned bean is Bean
  Detail's preset button — an inconsistency, not a feature. And since
  `avg_rating` is never recomputed (see D), an open log against another's bean
  aggregates nowhere. "Log a coffee you don't own" is a real future use case,
  deferred to a quick-add flow (note a bag in ~2 taps, then log).

### C-extra. Drop the dead `tastings.mine` column

`tastings.mine` (`db/schema.sql`) is `not null default false`, **never selected
(`TASTING_COLS` excludes it), never written, never read** — ownership is computed
live via `tasting.userId === currentUserId`. It's a dead, misleading ownership
column in the exact table this work concerns. **Remove it** from `schema.sql`
(the index was already dropped; the seed and `logBrew` already don't write it).

### D. Out of scope (pre-existing, empty-seed artifacts — file separately)

These are **not** caused by ownership and must not be bundled:

- `avg_rating` / `ratings` are never recomputed after insert (dead columns) →
  Discover's "trending by rating" is noise. Separate follow-up to make ratings
  live.
- The roaster surface is dead (`ROASTERS=[]`, user bags have `roaster_id=null`).
- A future **shared catalog** (ownerless, `owned=false` beans) + the **quick-add
  bag / "log a coffee you don't own"** flow.

## Testing

Vitest, matching the existing patterns (injected fake `query` client;
source-scan guard test):

- `getBeans` redaction: a bean owned by **another** user returns `owned=false`
  and null `bagWeight`/`purchased`/`remaining`; a bean owned by the **requester**
  returns the real values; **anonymous** (`userId=null`) → all four redacted
  across all rows.
- `logBrew` guard: a bean owned by another user (guarded INSERT returns 0 rows)
  → `logBrew` throws; an owned bean → returns the tasting.
- `shelf()` scoping (pure filter): excludes other users' owned beans; empty when
  logged out.
- Static guard test (like `projection-guard.test.ts`): assert `getBeans`'s source
  uses a `case`/owner-scoped expression for `remaining` (catches a regression to
  the flat un-redacted projection).

## Build sequencing (for the implementation plan)

1. **Schema + ownership write path:** `beans.user_id` + CHECK + composite index,
   drop `tastings.mine`, `addBag` stores the owner, `Bean.ownerId`, `BEAN_COLS`
   adds `ownerId`. Apply via `db:setup`.
2. **Read-path scoping:** `getBeans(currentUserId)` CASE projection (incl. scoped
   `owned`), thread `currentUserId` from `getAppData`, update `shelf()`. + tests.
3. **Brew-logging guard:** `logBrew` guarded INSERT + generic error; Bean Detail
   hides Log-a-brew / remaining for non-owned beans. + tests.
4. **Verify:** unit tests, `tsc`, build, and a two-user browser check (each user's
   shelf shows only their own bags; a non-owned bean's Bean Detail has no
   Log-a-brew).
