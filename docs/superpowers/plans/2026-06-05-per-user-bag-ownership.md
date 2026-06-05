# Per-User Bag Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `beans` (which double as personal "bags") a per-user owner so the shelf, the private bag fields, and brew-logging are scoped to the owner — while beans stay globally readable so the social Feed still works.

**Architecture:** Add `beans.user_id` (owner). `getBeans()` stays global but redacts the per-user fields (`owned`, `remaining`, `bag_weight`, `purchased`) for non-owners via SQL `CASE`. `shelf()` filters to the current user. `logBrew` enforces ownership in one atomic guarded statement; Bean Detail hides "Log a brew" on beans you don't own. The dead `tastings.mine` column is dropped.

**Tech Stack:** Next.js 15 App Router, raw `pg`, Postgres (Docker `coffee-pg`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-05-per-user-bag-ownership-design.md` (council-ratified). Read it first.

---

## Conventions
- Run commands from repo root `/home/sbrn/Projects/Coffee-Tracker`. Docker `coffee-pg` must be up.
- `npm run db:setup` drops & recreates from `db/schema.sql` (seed is empty → no backfill).
- Type-check: `npx tsc --noEmit`. Tests: `npm test`. Build: `npm run build`.
- Commit after each task. There are **no deliberate red states** — every task compiles.

## File map
- `db/schema.sql` — add `beans.user_id` + CHECK + index swap; drop `tastings.mine`.
- `lib/types.ts` — `Bean.ownerId`.
- `lib/queries.ts` — `BEAN_COLS` gains `ownerId`; `getBeans(currentUserId)` redacts private fields; `getAppData` threads the id.
- `app/actions.ts` — `addBag` stores owner; `logBrew` guarded insert.
- `components/data-context.tsx` — `shelf()` scoped to owner.
- `components/detail.tsx` — Bean Detail hides "Log a brew" for non-owned beans.
- `test/` — `bean-projection-guard.test.ts` (static), `log-brew.test.ts` (guard behavior).

---

## Task 1: Schema — owner column, CHECK, index swap, drop `tastings.mine`

**Files:** Modify `db/schema.sql`.

- [ ] **Step 1: Add the owner column + CHECK to `beans`**

In `db/schema.sql`, the `create table beans (...)` block ends with `remaining numeric, ... created_at timestamptz not null default now()`. Add the owner column right after `remaining` (before `created_at`), and a table CHECK before the closing `);`:
```sql
  remaining    numeric,                        -- fraction left 0–1; null if not on shelf
  user_id      text references users(id) on delete cascade,  -- owner; null only for a future shared catalog
  created_at   timestamptz not null default now(),
  constraint beans_owned_has_owner check (not owned or user_id is not null)
);
```
(Ensure the line before `constraint` ends with a comma and the `constraint` line has no trailing comma.)

- [ ] **Step 2: Drop the dead `tastings.mine` column**

In the `create table tastings (...)` block, delete the line:
```sql
  mine       boolean not null default false,
```
(It's never selected, written, or read — ownership is computed via `userId === currentUserId`.)

- [ ] **Step 3: Swap the beans index**

In the index section, replace:
```sql
create index beans_owned_idx       on beans (owned);
```
with:
```sql
create index beans_user_owned_idx  on beans (user_id, owned);
```
(Leave `beans_roaster_idx`, `beans_created_idx`, and the others unchanged.)

- [ ] **Step 4: Apply and verify**

Run:
```bash
npm run db:setup
docker exec coffee-pg psql -U postgres -d coffee_tracker -c "\d beans" -c "\d tastings"
```
Expected: `db:setup` ends `✅ Database ready.`; `beans` shows `user_id` + the `beans_owned_has_owner` check + `beans_user_owned_idx`; `tastings` has **no** `mine` column.

- [ ] **Step 5: Verify the CHECK actually rejects an ownerless bag**

Run:
```bash
docker exec coffee-pg psql -U postgres -d coffee_tracker -c "insert into beans (id,name,color,owned) values ('b-x','X','#000',true);"
```
Expected: ERROR — violates `beans_owned_has_owner` (an owned bag with no `user_id` is rejected). Then confirm an owned bag WITH an owner works and clean it up:
```bash
docker exec coffee-pg psql -U postgres -d coffee_tracker -c "insert into users (id,name,handle,avatar) values ('u-x','X','user_x0000000','#000'); insert into beans (id,name,color,owned,user_id) values ('b-x','X','#000',true,'u-x'); delete from beans where id='b-x'; delete from users where id='u-x';"
```
Expected: INSERT 0 1 (both), then DELETE.

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql
git commit -m "feat(db): add beans.user_id owner + CHECK; drop dead tastings.mine"
```

---

## Task 2: `addBag` stores the owner; `Bean.ownerId`; `BEAN_COLS` returns it

**Files:** Modify `lib/types.ts`, `lib/queries.ts`, `app/actions.ts`.

- [ ] **Step 1: Add `ownerId` to the `Bean` type**

In `lib/types.ts`, in the `Bean` interface, add (next to the other bag fields like `remaining`):
```ts
  /** Owner (creator) of this bag; null only for a future shared catalog. */
  ownerId?: string | null;
```

- [ ] **Step 2: Add `ownerId` to `BEAN_COLS`**

In `lib/queries.ts`, `BEAN_COLS` currently ends `... purchased, remaining::float8 as remaining`. Append `user_id as "ownerId"`:
```ts
export const BEAN_COLS = `
  id, name, roaster_id as "roasterId", roaster_name as "roasterName",
  origin, process, roast, altitude, varietal,
  price::float8 as price, avg_rating::float8 as "avgRating", ratings,
  color, flavors, description as "desc", farm, varieties,
  sca_score::float8 as "scaScore", owned, bag_weight as "bagWeight",
  purchased, remaining::float8 as remaining, user_id as "ownerId"`;
```
(`BEAN_COLS` is used by `addBag`'s `returning` — the owner's own bean — so it stays un-redacted. `getBeans` gets its own redacting projection in Task 3.)

- [ ] **Step 3: Store the owner in `addBag`**

In `app/actions.ts`, `addBag` already has `const userId = await requireUserId();` (line 29) but the INSERT discards it. Add `user_id` to the column list, `$14` to the values, and `userId` to the params. The INSERT becomes:
```ts
  const { rows } = await query<Bean>(
    `insert into beans
       (id, name, roaster_id, roaster_name, origin, process, roast, altitude,
        varietal, price, avg_rating, ratings, color, flavors, description,
        farm, varieties, sca_score, owned, bag_weight, purchased, remaining, user_id)
     values ($1, $2, null, $3, $4, $5, $6, '—',
        $7, null, 0, 0, $8, $9, $10,
        $11, $12, $13, true, '250g', null, 1, $14)
     returning ${BEAN_COLS}`,
    [
      id,
      input.name,
      input.roasterName,
      input.origin,
      input.process,
      input.roast,
      varietal,
      input.color,
      input.flavors,
      description,
      input.farm,
      varieties,
      scaScore,
      userId,
    ],
  );
```

- [ ] **Step 4: Type-check & build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/queries.ts app/actions.ts
git commit -m "feat: addBag stores owner; Bean.ownerId; BEAN_COLS returns ownerId"
```

---

## Task 3: `getBeans` redacts private fields for non-owners; scope `shelf()`

**Files:** Modify `lib/queries.ts`, `components/data-context.tsx`. Test: `test/bean-projection-guard.test.ts`.

- [ ] **Step 1: Write the failing static guard test**

This catches a regression to a flat, un-redacted projection (the same pattern as the existing `test/projection-guard.test.ts`). Create `test/bean-projection-guard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("getBeans owner-scoping guard", () => {
  it("redacts private bag fields for non-owners", () => {
    const src = readFileSync("lib/queries.ts", "utf8");
    const start = src.indexOf("export async function getBeans");
    const body = src.slice(start, src.indexOf("\nexport", start + 1));
    // private bag fields must be owner-scoped, not raw columns
    expect(body).toMatch(/case when user_id = \$1 then bag_weight/);
    expect(body).toMatch(/case when user_id = \$1 then purchased/);
    expect(body).toMatch(/case when user_id = \$1 then remaining/);
    expect(body).toMatch(/coalesce\(owned and user_id = \$1, false\)/);
    // getBeans must take the current user id
    expect(body).toMatch(/getBeans\(\s*currentUserId/);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- bean-projection-guard`
Expected: FAIL (current `getBeans` uses the flat `BEAN_COLS`, takes no arg).

- [ ] **Step 3: Rewrite `getBeans` with the redacting projection**

In `lib/queries.ts`, replace the whole `getBeans` function with:
```ts
export async function getBeans(currentUserId: string | null): Promise<Bean[]> {
  // Beans are globally readable (the Feed resolves any user's tasting→bean),
  // but the per-user bag fields are returned only to the owner. $1 is the
  // current user id (null for anon → user_id = null is never true → all redact).
  const { rows } = await query<Bean>(
    `select
       id, name, roaster_id as "roasterId", roaster_name as "roasterName",
       origin, process, roast, altitude, varietal,
       price::float8 as price, avg_rating::float8 as "avgRating", ratings,
       color, flavors, description as "desc", farm, varieties,
       sca_score::float8 as "scaScore", user_id as "ownerId",
       coalesce(owned and user_id = $1, false)        as "owned",
       case when user_id = $1 then bag_weight end     as "bagWeight",
       case when user_id = $1 then purchased  end     as "purchased",
       case when user_id = $1 then remaining::float8 end as "remaining"
     from beans order by created_at desc, id`,
    [currentUserId],
  );
  return rows;
}
```

- [ ] **Step 4: Thread `currentUserId` into `getBeans` from `getAppData`**

In `lib/queries.ts`, `getAppData` builds `currentUserId` then calls `getBeans()` in the `Promise.all`. Change that call to pass the id:
```ts
  const [roasters, users, beans, tastings, likedIds] = await Promise.all([
    getRoasters(),
    getUsers(),
    getBeans(currentUserId),
    getTastings(),
    currentUserId ? getLikedTastingIds(currentUserId) : Promise.resolve<string[]>([]),
  ]);
```

- [ ] **Step 5: Scope `shelf()` to the owner**

In `components/data-context.tsx`, the `shelf` member is `shelf: () => beans.filter((b) => b.owned),`. Change it to:
```ts
      shelf: () => beans.filter((b) => b.owned && b.ownerId === currentUserId),
```
(`owned` is already owner-scoped by the query; the explicit `ownerId` check reads clearly and is harmless. `currentUserId` is already in scope and in the `useMemo` deps.)

- [ ] **Step 6: Run the test + type-check + build**

Run: `npm test -- bean-projection-guard && npx tsc --noEmit && npm run build`
Expected: the guard test PASSES; tsc clean; build succeeds. (`getBeans` has one caller — `getAppData` — now updated.)

- [ ] **Step 7: Commit**

```bash
git add lib/queries.ts components/data-context.tsx test/bean-projection-guard.test.ts
git commit -m "feat(queries): getBeans redacts private bag fields for non-owners; scope shelf"
```

---

## Task 4: `logBrew` ownership guard + Bean Detail UI gating

**Files:** Modify `app/actions.ts`, `components/detail.tsx`. Test: `test/log-brew.test.ts`.

- [ ] **Step 1: Write the failing test for the guard**

`logBrew` should reject a bean the caller doesn't own. We mock `@/lib/auth` (`requireUserId`) and `@/lib/db` (`query`) so the test is pure. Create `test/log-brew.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// getCurrentUserId is included because lib/queries imports it (transitive import
// of app/actions) — omitting it can trip a "no known export" error under Vitest.
vi.mock("@/lib/auth", () => ({
  requireUserId: vi.fn(async () => "u-me"),
  getCurrentUserId: vi.fn(async () => "u-me"),
}));
const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { logBrew } from "@/app/actions";

const input = { beanId: "b-1", rating: 4, brew: "V60", note: "", dose: "15g", ratio: "1:16", temp: "94°C" };

describe("logBrew ownership guard", () => {
  beforeEach(() => queryMock.mockReset());

  it("throws when the guarded insert affects no rows (bean not owned/found)", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(logBrew(input)).rejects.toThrow();
  });

  it("returns the tasting when the bean is owned (insert returns a row)", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: "t-1", userId: "u-me", beanId: "b-1" }] });
    const t = await logBrew(input);
    expect(t.id).toBe("t-1");
    // the guarded statement filters by owner: bean id and user id are both params
    const [, params] = queryMock.mock.calls[0];
    expect(params).toContain("b-1");
    expect(params).toContain("u-me");
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- log-brew`
Expected: FAIL — the current `logBrew` inserts unconditionally (the empty-rows case returns `rows[0] === undefined` rather than throwing; the second test may pass incidentally, but the first fails).

- [ ] **Step 3: Add the guarded insert to `logBrew`**

In `app/actions.ts`, replace the `query` call inside `logBrew` with the guarded form (insert only if the bean belongs to the caller):
```ts
  const { rows } = await query<Tasting>(
    `insert into tastings
       (id, user_id, bean_id, rating, brew, dose, ratio, temp, note, likes, comments, time)
     select $1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, 'now'
     from beans where id = $3 and user_id = $2
     returning ${TASTING_COLS}`,
    [id, userId, input.beanId, rating, input.brew, input.dose, input.ratio, input.temp, input.note],
  );
  if (rows.length === 0) throw new Error("Couldn't log a brew for that bag.");
  return rows[0];
```
(One atomic statement — no TOCTOU. The generic error covers bean-not-found, not-owned, and deleted-bag without disclosing which. `$2`=`userId`, `$3`=`input.beanId`, reused in the `where`.)

- [ ] **Step 4: Run the test to verify pass**

Run: `npm test -- log-brew`
Expected: PASS (2 tests).

- [ ] **Step 5: Gate the Bean Detail "Log a brew" affordance on ownership**

In `components/detail.tsx`, `BeanDetail` resolves `const bean = D.bean(beanId);` (line 51) and guards `if (!bean) return <NotFoundPanel .../>;` (line 53). Right after that guard, add:
```ts
  const isOwner = bean.ownerId != null && bean.ownerId === D.currentUserId;
```
Then gate the two "Log a brew" buttons:
- The primary button (currently lines 180–182) — wrap it so it only renders for the owner:
```tsx
            {isOwner && (
              <Button onClick={() => onAdd(bean.id)}>
                <Icon name="drop" size={18} color="currentColor" /> Log a brew
              </Button>
            )}
```
- The empty-state button (currently lines 252–263, the `reviews.length === 0` branch). Replace that branch so non-owners see a plain message instead of the log button:
```tsx
      {reviews.length === 0 ? (
        isOwner ? (
          <Button
            variant="outline"
            onClick={() => onAdd(bean.id)}
            className="h-auto w-full flex-col gap-2 border-2 border-dashed border-[var(--line)] bg-transparent text-[var(--mocha)]"
            style={{ padding: "28px 20px", borderRadius: "var(--r-lg)" }}
          >
            <Icon name="drop" size={26} color="var(--caramel)" />
            <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--coffee)" }}>
              No brews yet — log your first cup from this bag
            </span>
          </Button>
        ) : (
          <p style={{ fontSize: 14, color: "var(--mocha)" }}>No brews logged yet.</p>
        )
      ) : (
```
(Leave the `: (` continuation and the rest of the reviews list unchanged. The "Want to try" button stays for everyone.)

- [ ] **Step 6: Type-check & build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/actions.ts components/detail.tsx test/log-brew.test.ts
git commit -m "feat: logBrew ownership guard + hide Log-a-brew on non-owned beans"
```

---

## Task 5: Full verification (needs `coffee-pg` + a dev session)

- [ ] **Step 1: Automated suite**

Run:
```bash
npm test && npx tsc --noEmit && npm run build
```
Expected: all tests pass; tsc clean; build succeeds.

- [ ] **Step 2: Live-DB behavioral check of redaction + the guard**

Reset, then seed two users + one bag owned by user A, and confirm the SQL redaction and the logBrew guard at the DB level:
```bash
npm run db:setup
docker exec -i coffee-pg psql -U postgres -d coffee_tracker <<'SQL'
insert into users (id,name,handle,avatar) values ('u-a','A','user_a0000000','#000'),('u-b','B','user_b0000000','#111');
insert into beans (id,name,color,owned,bag_weight,purchased,remaining,user_id)
  values ('b-a','A bag','#222',true,'250g','May 2026',0.5,'u-a');
-- redaction: as user B ($1='u-b'), A's bag shows owned=false and null private fields
select id, coalesce(owned and user_id='u-b',false) as owned_for_b,
       case when user_id='u-b' then remaining end as remaining_for_b
from beans where id='b-a';
-- logBrew guard: B cannot insert a tasting against A's bag (0 rows)
insert into tastings (id,user_id,bean_id,rating,brew,time)
  select 't-x','u-b','b-a',5,'V60','now' from beans where id='b-a' and user_id='u-b'
  returning id;
SQL
echo "--- cleanup (db:setup restores anyway) ---"
docker exec -i coffee-pg psql -U postgres -d coffee_tracker -c "delete from tastings where id='t-x'; delete from beans where id='b-a'; delete from users where id in ('u-a','u-b');"
```
Expected: the redaction select shows `owned_for_b = f` and `remaining_for_b = NULL` (A's private fields hidden from B); the guarded insert returns **0 rows** (B blocked from logging against A's bag).

- [ ] **Step 3: Browser two-user check (optional, needs OAuth-free credentials)**

`npm run dev`; sign up user A, add a bag, log a brew; sign out; sign up user B. Confirm: B's Journal shelf is empty (A's bag not shown); B opening A's bag via Discover/Feed sees catalog info but **no** "Log a brew" button; A still sees their bag on their shelf and can log brews.

- [ ] **Step 4: Final commit (if any verification fixups were needed)**

Only if Step 1–3 surfaced a fix; otherwise nothing to commit.

---

## Notes
- **Out of scope** (separate follow-ups, per the spec): `avg_rating`/`ratings` are dead (never recomputed) so Discover "trending" is noise; the roaster surface is empty; a future shared catalog + a "quick-add bag / log a coffee you don't own" flow.
- **No deliberate red states** — each task compiles and builds on its own.
