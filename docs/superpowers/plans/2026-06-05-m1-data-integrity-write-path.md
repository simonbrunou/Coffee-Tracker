# M1 — Data Integrity & Core Write Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every count/average the app shows correct (compute-on-read), make writes validated and honestly reported, add edit/delete for brews & bags — without regressing auth/ownership.

**Architecture:** Counts are derived in SQL (`lib/queries.ts`), never stored-as-truth. The client stops copying server data into `useState` once; it bases `useOptimistic` on the server-provided `initialData` and reconciles via `revalidatePath` after each Server Action. Write actions gain hand-rolled validation and ownership-guarded edit/delete. Relative timestamps derive from `created_at`.

**Tech Stack:** Next.js 15 (App Router, `force-dynamic` root layout), React 19 (`useOptimistic`/`useActionState`/`useTransition`), Postgres via `pg`, Vitest (node env, mock-`@/lib/db` pattern).

**Source spec:** `docs/superpowers/specs/2026-06-05-m1-data-integrity-write-path-design.md`
**Branch:** `feat/m1-data-integrity` (already created; audit + spec committed).

---

## Conventions & constraints (read once)

- **Test env is `node`, no DOM** (`vitest.config.ts`). So: pure logic + Server-Action SQL are unit-tested with the existing patterns; React component behavior (submit states, UI) is verified by `npx tsc --noEmit` + manual smoke, **not** Vitest.
- **Two test patterns already in the repo, reuse them:**
  - *Action SQL guard:* mock `@/lib/auth` + `@/lib/db`, call the action, assert the SQL string + params (`test/log-brew.test.ts`).
  - *Source projection guard:* `readFileSync` a query file and assert substrings present/absent (`test/projection-guard.test.ts`).
- **Run a single test file:** `npx vitest run test/<file>.test.ts`
- **Full gates after each task:** `npx vitest run` (expect all green) and `npx tsc --noEmit` (expect exit 0).
- **DB for manual smoke:** `npm run db:reset` then `npm run dev` (Docker `coffee-pg` must be up).
- **Commit after every task** (messages below). End each commit body with the `Co-Authored-By` trailer the repo uses.

---

## File map (what changes and why)

- `lib/types.ts` — **modify**: add `Tasting.likedByMe`, `Tasting.createdAt`; remove `AppData.likedIds`; add `UpdateBrewInput`, `UpdateBagInput`.
- `lib/queries.ts` — **modify**: `getBeans`/`getUsers`/`getTastings` derive counts; add `likedByMe`+`createdAt`; retire `getLikedTastingIds`; drop `likedIds` from `getAppData`. `TASTING_COLS` gains `created_at`.
- `db/schema.sql` — **modify**: two new indexes; comment the derived columns.
- `lib/relative-time.ts` — **create**: pure `relativeTime(iso, nowMs)`.
- `lib/brew-validation.ts` — **create**: `validateLogBrew`/`validateUpdateBrew`/`validateAddBag`/`validateUpdateBag` + `normalizeDose/Ratio/Temp`.
- `app/actions.ts` — **modify**: validate+normalize in `logBrew`/`addBag`; add `updateBrew`/`deleteBrew`/`updateBag`/`deleteBag`; `revalidatePath` after every write; stop writing literal `'now'`.
- `components/app-provider.tsx` — **modify**: `useOptimistic` re-base (or fallback), edit/delete handlers, relative-like-delta, build `likes` Set from `likedByMe`.
- `components/log-sheet.tsx` — **modify**: `async` submit + pending + error; edit mode (pre-populate from a tasting).
- `components/bag-form.tsx` — **modify**: `async` save + pending + error; edit mode.
- `components/cards.tsx` — **modify**: relative-like-delta; relative time from `createdAt`; own-brew edit/delete affordance.
- `components/detail.tsx` — **modify**: bag edit + delete-with-confirm in `BeanDetail`; relative time in reviews.
- `components/screens.tsx` — **modify**: relative time in journal list (line 323).
- `test/*` — **create**: `relative-time`, `brew-validation`, `actions-edit-delete`, `compute-on-read` guard tests.

---

## Task 0: Spike — does `useOptimistic` re-base survive the seed-once provider?

**Purpose:** Decide the Task 7 mechanism. The root layout is `force-dynamic` and re-runs `getAppData()` on `revalidatePath`/refresh, but `AppProvider` copies `initialData` into `useState` once (`app-provider.tsx:49-51`), so revalidated data never reaches the client. Prove that basing state on `initialData` (via `useOptimistic`) + `revalidatePath('/', 'layout')` re-flows fresh data **without** disrupting scroll-restoration (`app-provider.tsx:61-97`) or the open log-sheet.

**Files:**
- Temp scratch only; this task produces a **decision note**, not shipped code.

- [ ] **Step 1: Add a throwaway debug counter to prove re-flow.** In `lib/queries.ts` `getAppData`, temporarily add `console.log("getAppData ran", currentUserId)`. In `app/actions.ts` `toggleLike`, temporarily add at the end: `const { revalidatePath } = await import("next/cache"); revalidatePath("/", "layout");`

- [ ] **Step 2: Run the app and observe.** Run: `npm run db:reset && npm run dev`. Sign in, open the feed, like a tasting. Watch the server console.
  Expected: `getAppData ran` logs **again** after the like (confirms `revalidatePath('/', 'layout')` re-runs the layout server-side).

- [ ] **Step 3: Prototype the re-base in `AppProvider`.** Temporarily change `app-provider.tsx:50` from `useState(initialData.tastings)` to:
```tsx
import { useOptimistic } from "react";
// ...
const [tastings, addTastingOptimistic] = useOptimistic(
  initialData.tastings,
  (state: Tasting[], next: Tasting[]) => next,
);
```
Add `console.log("tastings len", tastings.length)` in render. Like a tasting again.
  Expected: after the action + revalidate, `tastings` re-bases to the server array (length reflects server truth), AND scrolling/opening the log sheet still works (UI state in the *other* `useState`s is untouched).

- [ ] **Step 4: Record the decision.** Append a short note to the spec under a new `## Spike outcome (Task 0)` heading:
  - If re-flow + re-base works and scroll/sheet survive → **Primary path** (Task 7A): `useOptimistic` over `initialData`.
  - If `force-dynamic` does NOT re-flow props to the client subtree on `revalidatePath` (App-Router edge cases), or scroll/sheet break → **Fallback path** (Task 7B): `router.refresh()` + `useEffect([initialData])` surgical data-only re-sync.

- [ ] **Step 5: Revert all scratch edits.** Remove the `console.log`s, the temp `revalidatePath` in `toggleLike`, and the prototype `useOptimistic` change. Verify clean: `git diff --stat` shows no changes. Run: `npx tsc --noEmit` (exit 0).

- [ ] **Step 6: Commit the decision note only.**
```bash
git add docs/superpowers/specs/2026-06-05-m1-data-integrity-write-path-design.md
git commit -m "docs(m1): record useOptimistic re-base spike outcome"
```

---

## Task 1: Domain types — derived counts, timestamps, edit inputs

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add fields to `Tasting`.** In `lib/types.ts`, inside `interface Tasting`, after `comments: number;` add:
```ts
  /** True when the current viewer has liked this tasting (server-derived). */
  likedByMe: boolean;
  /** ISO timestamp the brew was logged; relative label derived on the client. */
  createdAt: string;
```

- [ ] **Step 2: Drop `likedIds` from `AppData`.** In `interface AppData`, remove the line `likedIds: string[];` (the like state is now seeded from `tastings[].likedByMe`).

- [ ] **Step 3: Add edit input types.** At the end of `lib/types.ts` add:
```ts
export interface UpdateBrewInput {
  id: string;
  rating: number;
  brew: string;
  note: string;
  dose: string;
  ratio: string;
  temp: string;
}

export interface UpdateBagInput extends AddBagInput {
  id: string;
}
```

- [ ] **Step 4: Verify it compiles against current callers (expect errors we fix next).** Run: `npx tsc --noEmit`
  Expected: FAIL — `getAppData` still returns `likedIds`, and `Tasting` literals lack `likedByMe`/`createdAt`. These are fixed in Tasks 2–6. (Confirm the errors are only those, nothing unexpected.)

- [ ] **Step 5: Commit.**
```bash
git add lib/types.ts
git commit -m "feat(m1,types): Tasting.likedByMe/createdAt, edit inputs, drop AppData.likedIds"
```

---

## Task 2: Compute-on-read queries + indexes + retire `getLikedTastingIds`

**Files:**
- Modify: `lib/queries.ts`
- Modify: `db/schema.sql`
- Test: `test/compute-on-read.test.ts` (create)

- [ ] **Step 1: Write the failing guard test.** Create `test/compute-on-read.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "lib/queries.ts"), "utf8");
function body(name: string) {
  const start = src.indexOf(`export async function ${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("compute-on-read counts", () => {
  it("getBeans derives avgRating/ratings from tastings, not stored columns", () => {
    const b = body("getBeans");
    expect(b).toMatch(/avg\(rating\)/i);
    expect(b).toMatch(/count\(\*\)/i);
    expect(b).toMatch(/coalesce/i);
    // must NOT read the stored counters as the source
    expect(b).not.toMatch(/b\.avg_rating/i);
    expect(b).not.toMatch(/b\.ratings/i);
  });

  it("getUsers derives the tastings count", () => {
    const b = body("getUsers");
    expect(b).toMatch(/count\(\*\)/i);
    expect(b).not.toMatch(/u\.tastings/i);
  });

  it("getTastings derives likes + likedByMe and exposes createdAt", () => {
    const b = body("getTastings");
    expect(b).toMatch(/count\(\*\)/i);
    expect(b).toMatch(/"likedByMe"/);
    expect(b).toMatch(/"createdAt"/);
  });

  it("getLikedTastingIds is removed", () => {
    expect(src).not.toContain("getLikedTastingIds");
  });
});
```

- [ ] **Step 2: Run it; verify it fails.** Run: `npx vitest run test/compute-on-read.test.ts`
  Expected: FAIL (current queries read stored columns / still export `getLikedTastingIds`).

- [ ] **Step 3: Rewrite `getBeans`.** Replace the `getBeans` function body's SQL (`lib/queries.ts:39-52`) so the projection is unchanged EXCEPT the two count columns derive from a grouped join. **Keep `beans` UN-ALIASED** (alias only the subquery `r`) so the redaction strings stay byte-identical — `test/bean-projection-guard.test.ts` asserts the exact substrings `case when user_id = $1 then bag_weight`, `coalesce(owned and user_id = $1, false)`, etc. Adding a `b.` alias would break that security guard.
```ts
export async function getBeans(currentUserId: string | null): Promise<Bean[]> {
  const { rows } = await query<Bean>(
    `select
       id, name, roaster_id as "roasterId", roaster_name as "roasterName",
       origin, process, roast, altitude, varietal,
       price::float8 as price,
       coalesce(r.avg_rating, 0)::float8 as "avgRating",
       coalesce(r.ratings, 0)            as ratings,
       color, flavors, description as "desc", farm, varieties,
       sca_score::float8 as "scaScore", user_id as "ownerId",
       coalesce(owned and user_id = $1, false)        as "owned",
       case when user_id = $1 then bag_weight end     as "bagWeight",
       case when user_id = $1 then purchased  end     as "purchased",
       case when user_id = $1 then remaining::float8 end as "remaining"
     from beans
     left join (
       select bean_id, round(avg(rating), 1) as avg_rating, count(*) as ratings
       from tastings group by bean_id
     ) r on r.bean_id = beans.id
     order by beans.created_at desc, beans.id`,
    [currentUserId],
  );
  return rows;
}
```
(`id`, `owned`, `user_id`, `bag_weight`, `created_at` are unambiguous — only `beans` has them at the top level; the subquery's columns are reached via `r.`.)

- [ ] **Step 4: Rewrite `getUsers`.** Replace its body (`lib/queries.ts:28-33`):
```ts
export async function getUsers(): Promise<User[]> {
  const { rows } = await query<User>(
    `select u.id, u.name, u.handle, u.avatar,
            coalesce(t.tastings, 0) as tastings,
            u.followers, u.following, u.bio
     from users u
     left join (select user_id, count(*) as tastings from tastings group by user_id) t
       on t.user_id = u.id
     order by u.id`,
  );
  return rows;
}
```

- [ ] **Step 5: Add `created_at` to `TASTING_COLS` and rewrite `getTastings`.** Change `TASTING_COLS` (`lib/queries.ts:17-19`) to append `created_at`:
```ts
export const TASTING_COLS = `
  id, user_id as "userId", bean_id as "beanId", rating, brew, dose, ratio,
  temp, note, likes, comments, time, created_at as "createdAt"`;
```
Then replace `getTastings` (`lib/queries.ts:56-61`) to take the current user and derive like count + membership (this is the single like-source):
```ts
export async function getTastings(currentUserId: string | null): Promise<Tasting[]> {
  const { rows } = await query<Tasting>(
    `select
       t.id, t.user_id as "userId", t.bean_id as "beanId", t.rating, t.brew,
       t.dose, t.ratio, t.temp, t.note,
       coalesce(l.likes, 0) as likes, t.comments, t.time,
       t.created_at as "createdAt",
       ($1 is not null and exists (
         select 1 from likes lm where lm.tasting_id = t.id and lm.user_id = $1
       )) as "likedByMe"
     from tastings t
     left join (select tasting_id, count(*) as likes from likes group by tasting_id) l
       on l.tasting_id = t.id
     order by t.created_at desc, t.id`,
    [currentUserId],
  );
  return rows;
}
```

- [ ] **Step 6: Delete `getLikedTastingIds` and update `getAppData`.** Remove the entire `getLikedTastingIds` function (`lib/queries.ts:63-69`). Replace `getAppData` (`lib/queries.ts:72-82`) so it passes `currentUserId` to `getTastings` and no longer returns `likedIds`:
```ts
export async function getAppData(): Promise<AppData> {
  const currentUserId = await getCurrentUserId();
  const [roasters, users, beans, tastings] = await Promise.all([
    getRoasters(),
    getUsers(),
    getBeans(currentUserId),
    getTastings(currentUserId),
  ]);
  return { roasters, users, beans, tastings, currentUserId };
}
```

- [ ] **Step 7: Add the two indexes + comment the derived columns in `db/schema.sql`.** After the existing index block (`db/schema.sql:113`) add:
```sql
create index tastings_user_idx  on tastings (user_id);   -- getUsers tastings count
create index likes_tasting_idx  on likes (tasting_id);   -- per-tasting like count
```
Add trailing comments on the derived columns: append `-- derived on read; not maintained by the app` to the `beans.avg_rating`, `beans.ratings` (lines 67-68), `users.tastings` (line 30), and `tastings.likes` (line 95) column definitions.

- [ ] **Step 8: Run the FULL suite + typecheck.** Run: `npx vitest run` → the new `compute-on-read` test passes AND the existing `bean-projection-guard`/`projection-guard` security tests still pass (this is why we kept `beans` un-aliased). Run: `npx tsc --noEmit` → fails ONLY on `getTastings` callers / `Tasting` literals in client code (fixed in later tasks) — confirm no query-layer errors remain.

- [ ] **Step 9: Manual DB smoke.** Run: `npm run db:reset && npm run dev`. Log two brews on one bag; confirm the bean now shows `(2)` ratings and a real average, and the Profile "Tastings" stat is non-zero. Stop the dev server.

- [ ] **Step 10: Commit.**
```bash
git add lib/queries.ts db/schema.sql test/compute-on-read.test.ts
git commit -m "feat(m1,queries): compute-on-read counts; likedByMe+createdAt; retire getLikedTastingIds; +indexes"
```

---

## Task 3: Relative-time helper

**Files:**
- Create: `lib/relative-time.ts`
- Test: `test/relative-time.test.ts`

- [ ] **Step 1: Write the failing test.** Create `test/relative-time.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { relativeTime } from "@/lib/relative-time";

const now = Date.UTC(2026, 5, 5, 12, 0, 0); // fixed "now"
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

describe("relativeTime", () => {
  it("returns 'just now' under a minute", () => {
    expect(relativeTime(iso(30_000), now)).toBe("just now");
  });
  it("minutes", () => expect(relativeTime(iso(5 * 60_000), now)).toBe("5m"));
  it("hours", () => expect(relativeTime(iso(3 * 3_600_000), now)).toBe("3h"));
  it("days", () => expect(relativeTime(iso(2 * 86_400_000), now)).toBe("2d"));
  it("weeks", () => expect(relativeTime(iso(14 * 86_400_000), now)).toBe("2w"));
  it("falls back to a date past ~1y", () => {
    expect(relativeTime(iso(400 * 86_400_000), now)).toMatch(/2025/);
  });
});
```

- [ ] **Step 2: Run it; verify it fails.** Run: `npx vitest run test/relative-time.test.ts`
  Expected: FAIL ("Cannot find module '@/lib/relative-time'").

- [ ] **Step 3: Implement.** Create `lib/relative-time.ts`:
```ts
/** Compact relative-age label derived from an ISO timestamp.
 *  `nowMs` is injectable for testing; callers on the client pass Date.now(). */
export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (d < 365) return `${w}w`;
  return new Date(then).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
```

- [ ] **Step 4: Run it; verify it passes.** Run: `npx vitest run test/relative-time.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/relative-time.ts test/relative-time.test.ts
git commit -m "feat(m1): relativeTime helper (derives age from created_at)"
```

---

## Task 4: Validation + numeric normalization

**Files:**
- Create: `lib/brew-validation.ts`
- Test: `test/brew-validation.test.ts`

- [ ] **Step 1: Write the failing test.** Create `test/brew-validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  validateLogBrew, validateAddBag, normalizeDose, normalizeRatio, normalizeTemp,
} from "@/lib/brew-validation";

describe("normalize brew params", () => {
  it("formats numbers and passes formatted strings through", () => {
    expect(normalizeDose("15")).toBe("15g");
    expect(normalizeDose("15g")).toBe("15g");
    expect(normalizeRatio("16")).toBe("1:16");
    expect(normalizeRatio("1:16")).toBe("1:16");
    expect(normalizeTemp("94")).toBe("94°C");
  });
  it("rejects garbage to the sentinel", () => {
    expect(normalizeDose("abc")).toBe("—");
    expect(normalizeDose("—")).toBe("—");
    expect(normalizeTemp("")).toBe("—");
  });
});

describe("validateLogBrew", () => {
  const ok = { beanId: "b-1", rating: 4, brew: "V60", note: "nice", dose: "15g", ratio: "1:16", temp: "94°C" };
  it("accepts a valid brew", () => {
    const r = validateLogBrew(ok);
    expect(r.ok).toBe(true);
  });
  it("requires a beanId", () => {
    expect(validateLogBrew({ ...ok, beanId: "" }).ok).toBe(false);
  });
  it("rejects out-of-range rating", () => {
    expect(validateLogBrew({ ...ok, rating: 9 }).ok).toBe(false);
    expect(validateLogBrew({ ...ok, rating: 0 }).ok).toBe(false);
  });
  it("caps the note length", () => {
    const r = validateLogBrew({ ...ok, note: "x".repeat(5000) });
    if (r.ok) expect(r.value.note.length).toBeLessThanOrEqual(1000);
    else throw new Error("should pass with truncation");
  });
});

describe("validateAddBag", () => {
  const ok = {
    name: "Idido", roasterName: "Ember & Oak", origin: "Gedeb", farm: "Idido",
    varieties: ["Heirloom"], process: "Washed", roast: "Light", scaScore: 88,
    flavors: ["Jasmine"], color: "#b07a3c",
  };
  it("accepts a valid bag", () => expect(validateAddBag(ok).ok).toBe(true));
  it("requires a name and roaster and origin", () => {
    expect(validateAddBag({ ...ok, name: "  " }).ok).toBe(false);
    expect(validateAddBag({ ...ok, roasterName: "" }).ok).toBe(false);
    expect(validateAddBag({ ...ok, origin: "" }).ok).toBe(false);
  });
  it("clamps scaScore into [80,100]", () => {
    const r = validateAddBag({ ...ok, scaScore: 999 });
    if (r.ok) expect(r.value.scaScore).toBe(100); else throw new Error("should clamp");
  });
  it("caps flavors at 10", () => {
    const r = validateAddBag({ ...ok, flavors: Array.from({ length: 20 }, (_, i) => `f${i}`) });
    if (r.ok) expect(r.value.flavors.length).toBe(10); else throw new Error("should cap");
  });
});
```

- [ ] **Step 2: Run it; verify it fails.** Run: `npx vitest run test/brew-validation.test.ts`
  Expected: FAIL ("Cannot find module '@/lib/brew-validation'").

- [ ] **Step 3: Implement.** Create `lib/brew-validation.ts`:
```ts
import type { AddBagInput, LogBrewInput, UpdateBagInput, UpdateBrewInput } from "@/lib/types";

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
export type Result<T> = Ok<T> | Err;

const SENTINEL = "—";
const num = (s: unknown): number | null => {
  if (typeof s === "number" && Number.isFinite(s)) return s;
  if (typeof s !== "string") return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

export function normalizeDose(v: unknown): string {
  const n = num(v);
  return n != null && n > 0 ? `${n}g` : SENTINEL;
}
export function normalizeRatio(v: unknown): string {
  if (typeof v === "string" && /^1:\d+(\.\d+)?$/.test(v.trim())) return v.trim();
  const n = num(v);
  return n != null && n > 0 ? `1:${n}` : SENTINEL;
}
export function normalizeTemp(v: unknown): string {
  const n = num(v);
  return n != null && n > 0 ? `${n}°C` : SENTINEL;
}

const BREW_ALLOW = ["V60", "Espresso", "AeroPress", "Chemex", "French Press", "Moka", "Cold Brew"];
const str = (v: unknown) => (typeof v === "string" ? v : "");
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function validateBrewFields(r: Record<string, unknown>): Result<Omit<LogBrewInput, "beanId">> {
  const rating = Number(r.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Rating must be 1–5." };
  const brewRaw = str(r.brew).trim();
  const brew = BREW_ALLOW.includes(brewRaw) ? brewRaw : "V60";
  const note = str(r.note).slice(0, 1000);
  return { ok: true, value: { rating, brew, note, dose: normalizeDose(r.dose), ratio: normalizeRatio(r.ratio), temp: normalizeTemp(r.temp) } };
}

export function validateLogBrew(raw: unknown): Result<LogBrewInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const beanId = str(r.beanId).trim();
  if (!beanId) return { ok: false, error: "A bag is required." };
  const f = validateBrewFields(r);
  return f.ok ? { ok: true, value: { beanId, ...f.value } } : f;
}

export function validateUpdateBrew(raw: unknown): Result<UpdateBrewInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r.id).trim();
  if (!id) return { ok: false, error: "Missing brew id." };
  const f = validateBrewFields(r);
  return f.ok ? { ok: true, value: { id, ...f.value } } : f;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
function validateBagFields(r: Record<string, unknown>): Result<AddBagInput> {
  const name = str(r.name).trim();
  if (name.length < 1 || name.length > 80) return { ok: false, error: "Coffee name is required." };
  const roasterName = str(r.roasterName).trim();
  if (roasterName.length < 1 || roasterName.length > 80) return { ok: false, error: "Roaster is required." };
  const origin = str(r.origin).trim();
  if (origin.length < 1 || origin.length > 120) return { ok: false, error: "Origin is required." };
  const farm = str(r.farm).trim().slice(0, 120);
  const process = str(r.process).trim().slice(0, 80) || "Washed";
  const roast = str(r.roast).trim() || "Light";
  const color = HEX.test(str(r.color)) ? str(r.color) : "#c98a4a";
  const scaScore = clamp(num(r.scaScore) ?? 86, 80, 100);
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => (x as string).trim()).filter(Boolean) : []);
  const varieties = arr(r.varieties).slice(0, 12);
  const flavors = arr(r.flavors).slice(0, 10);
  return { ok: true, value: { name, roasterName, origin, farm, varieties, process, roast, scaScore, flavors, color } };
}

export function validateAddBag(raw: unknown): Result<AddBagInput> {
  return validateBagFields((raw ?? {}) as Record<string, unknown>);
}

export function validateUpdateBag(raw: unknown): Result<UpdateBagInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r.id).trim();
  if (!id) return { ok: false, error: "Missing bag id." };
  const f = validateBagFields(r);
  return f.ok ? { ok: true, value: { id, ...f.value } } : f;
}
```

- [ ] **Step 4: Run it; verify it passes.** Run: `npx vitest run test/brew-validation.test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/brew-validation.ts test/brew-validation.test.ts
git commit -m "feat(m1): hand-rolled brew/bag validation + numeric param normalization"
```

---

## Task 5: Wire validation into `logBrew`/`addBag`; drop literal `'now'`; revalidate

**Files:**
- Modify: `app/actions.ts`
- Test: `test/log-brew.test.ts` (extend)

- [ ] **Step 1: Extend the existing test to assert validation + revalidate.** In `test/log-brew.test.ts`, add a mock for `next/cache` near the other mocks (after line 10):
```ts
const revalidateMock = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }));
```
Add a new `it` inside the describe block:
```ts
  it("rejects an out-of-range rating before touching the db", async () => {
    await expect(logBrew({ ...input, rating: 99 })).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("revalidates after a successful insert", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: "t-1", userId: "u-me", beanId: "b-1" }] });
    await logBrew(input);
    expect(revalidateMock).toHaveBeenCalledWith("/", "layout");
  });
```

- [ ] **Step 2: Run it; verify the new cases fail.** Run: `npx vitest run test/log-brew.test.ts`
  Expected: FAIL (no validation/revalidate yet).

- [ ] **Step 3: Update `logBrew`.** In `app/actions.ts`, add imports at the top:
```ts
import { revalidatePath } from "next/cache";
import { validateLogBrew, validateAddBag, validateUpdateBrew, validateUpdateBag } from "@/lib/brew-validation";
```
Replace `logBrew` (`app/actions.ts:11-26`) with:
```ts
export async function logBrew(rawInput: LogBrewInput): Promise<Tasting> {
  const userId = await requireUserId();
  const v = validateLogBrew(rawInput);
  if (!v.ok) throw new Error(v.error);
  const input = v.value;
  const id = `t-${randomUUID()}`;
  const { rows } = await query<Tasting>(
    `insert into tastings
       (id, user_id, bean_id, rating, brew, dose, ratio, temp, note, likes, comments)
     select $1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0
     from beans where id = $3 and user_id = $2
     returning ${TASTING_COLS}`,
    [id, userId, input.beanId, input.rating, input.brew, input.dose, input.ratio, input.temp, input.note],
  );
  if (rows.length === 0) throw new Error("Couldn't log a brew for that bag.");
  revalidatePath("/", "layout");
  return { ...rows[0], likedByMe: false };
}
```
(Note: `time` is dropped from the insert column list — the schema default `'now'` still satisfies NOT NULL, but it is no longer read; display uses `createdAt`. The guard `from beans where id = $3 and user_id = $2` is preserved so the existing ownership test still passes.)

- [ ] **Step 4: Update `addBag`.** Replace `addBag` (`app/actions.ts:30-67`) so it validates first and revalidates; keep the INSERT shape but source fields from the validated value:
```ts
export async function addBag(rawInput: AddBagInput): Promise<Bean> {
  const userId = await requireUserId();
  const v = validateAddBag(rawInput);
  if (!v.ok) throw new Error(v.error);
  const input = v.value;
  const id = `b-${randomUUID()}`;
  const varieties = input.varieties.length ? input.varieties : ["—"];
  const varietal = varieties[0] ?? "—";
  const description = input.flavors.length
    ? `Roaster notes: ${input.flavors.join(", ")}.`
    : "A freshly added bag on your shelf.";
  const { rows } = await query<Bean>(
    `insert into beans
       (id, name, roaster_id, roaster_name, origin, process, roast, altitude,
        varietal, price, avg_rating, ratings, color, flavors, description,
        farm, varieties, sca_score, owned, bag_weight, purchased, remaining, user_id)
     values ($1, $2, null, $3, $4, $5, $6, '—',
        $7, null, 0, 0, $8, $9, $10,
        $11, $12, $13, true, '250g', null, 1, $14)
     returning ${BEAN_COLS}`,
    [id, input.name, input.roasterName, input.origin, input.process, input.roast,
     varietal, input.color, input.flavors, description, input.farm, varieties,
     input.scaScore, userId],
  );
  revalidatePath("/", "layout");
  return rows[0];
}
```

- [ ] **Step 5: Update `toggleLike` to revalidate.** Append `revalidatePath("/", "layout");` before the end of `toggleLike` (after the if/else block, `app/actions.ts:79`).

- [ ] **Step 6: Run tests + typecheck.** Run: `npx vitest run test/log-brew.test.ts` → PASS. Run: `npx tsc --noEmit` (client `Tasting` literals may still error — fixed in Task 7/9; confirm `app/actions.ts` itself is clean).

- [ ] **Step 7: Commit.**
```bash
git add app/actions.ts test/log-brew.test.ts
git commit -m "feat(m1,actions): validate logBrew/addBag, normalize params, revalidate after writes"
```

---

## Task 6: Edit/delete Server Actions (ownership-guarded)

**Files:**
- Modify: `app/actions.ts`
- Test: `test/actions-edit-delete.test.ts` (create)

- [ ] **Step 1: Write the failing test.** Create `test/actions-edit-delete.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireUserId: vi.fn(async () => "u-me"),
  getCurrentUserId: vi.fn(async () => "u-me"),
}));
const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateBrew, deleteBrew, updateBag, deleteBag } from "@/app/actions";

const brew = { id: "t-1", rating: 5, brew: "V60", note: "n", dose: "15g", ratio: "1:16", temp: "94°C" };
const bag = { id: "b-1", name: "Idido", roasterName: "Ember", origin: "Gedeb", farm: "", varieties: [], process: "Washed", roast: "Light", scaScore: 88, flavors: [], color: "#b07a3c" };

beforeEach(() => queryMock.mockReset());

describe("edit/delete ownership guards", () => {
  it("updateBrew filters by id AND user_id and throws on 0 rows", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(updateBrew(brew)).rejects.toThrow();
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/update tastings set[\s\S]*where id = \$1 and user_id = \$2/i);
    expect(sql).not.toMatch(/created_at|time\s*=/i); // must not reorder the feed
    expect(params).toContain("t-1");
    expect(params).toContain("u-me");
  });
  it("deleteBrew is ownership-guarded", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ id: "t-1" }] });
    await deleteBrew("t-1");
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/delete from tastings where id = \$1 and user_id = \$2/i);
    expect(params).toEqual(["t-1", "u-me"]);
  });
  it("updateBag is ownership-guarded and validated", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: "b-1" }] });
    await updateBag(bag);
    const [sql] = queryMock.mock.calls[0] as [string];
    expect(sql).toMatch(/update beans set[\s\S]*where id = \$1 and user_id = \$2/i);
  });
  it("updateBag rejects invalid input before the db", async () => {
    await expect(updateBag({ ...bag, name: "" })).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("deleteBag is ownership-guarded (cascade handled by FK)", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ id: "b-1" }] });
    await deleteBag("b-1");
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/delete from beans where id = \$1 and user_id = \$2/i);
    expect(params).toEqual(["b-1", "u-me"]);
  });
});
```

- [ ] **Step 2: Run it; verify it fails.** Run: `npx vitest run test/actions-edit-delete.test.ts`
  Expected: FAIL (actions don't exist).

- [ ] **Step 3: Implement the four actions.** Append to `app/actions.ts` (uses imports added in Task 5; add `UpdateBagInput, UpdateBrewInput` to the `@/lib/types` import):
```ts
/** Edit a brew's mutable fields. Never touches time/created_at (feed order). */
export async function updateBrew(rawInput: UpdateBrewInput): Promise<Tasting> {
  const userId = await requireUserId();
  const v = validateUpdateBrew(rawInput);
  if (!v.ok) throw new Error(v.error);
  const input = v.value;
  const { rows } = await query<Tasting>(
    `update tastings set rating = $3, brew = $4, dose = $5, ratio = $6, temp = $7, note = $8
     where id = $1 and user_id = $2
     returning ${TASTING_COLS}`,
    [input.id, userId, input.rating, input.brew, input.dose, input.ratio, input.temp, input.note],
  );
  if (rows.length === 0) throw new Error("Couldn't update that brew.");
  revalidatePath("/", "layout");
  return { ...rows[0], likedByMe: false };
}

export async function deleteBrew(id: string): Promise<void> {
  const userId = await requireUserId();
  const { rowCount } = await query(`delete from tastings where id = $1 and user_id = $2`, [id, userId]);
  if (!rowCount) throw new Error("Couldn't delete that brew.");
  revalidatePath("/", "layout");
}

/** Edit a bag's catalog fields. */
export async function updateBag(rawInput: UpdateBagInput): Promise<Bean> {
  const userId = await requireUserId();
  const v = validateUpdateBag(rawInput);
  if (!v.ok) throw new Error(v.error);
  const input = v.value;
  const varieties = input.varieties.length ? input.varieties : ["—"];
  const { rows } = await query<Bean>(
    `update beans set name = $3, roaster_name = $4, origin = $5, process = $6,
        roast = $7, color = $8, flavors = $9, farm = $10, varieties = $11, sca_score = $12
     where id = $1 and user_id = $2
     returning ${BEAN_COLS}`,
    [input.id, userId, input.name, input.roasterName, input.origin, input.process,
     input.roast, input.color, input.flavors, input.farm, varieties, input.scaScore],
  );
  if (rows.length === 0) throw new Error("Couldn't update that bag.");
  revalidatePath("/", "layout");
  return rows[0];
}

/** Delete a bag. FK `on delete cascade` removes its tastings + their likes. */
export async function deleteBag(id: string): Promise<void> {
  const userId = await requireUserId();
  const { rowCount } = await query(`delete from beans where id = $1 and user_id = $2`, [id, userId]);
  if (!rowCount) throw new Error("Couldn't delete that bag.");
  revalidatePath("/", "layout");
}
```

- [ ] **Step 4: Run it; verify it passes.** Run: `npx vitest run test/actions-edit-delete.test.ts` → PASS.

- [ ] **Step 5: Full suite + typecheck.** Run: `npx vitest run` → all green. Run: `npx tsc --noEmit` (client errors from Task 1 types may remain; `app/actions.ts` clean).

- [ ] **Step 6: Commit.**
```bash
git add app/actions.ts test/actions-edit-delete.test.ts
git commit -m "feat(m1,actions): ownership-guarded updateBrew/deleteBrew/updateBag/deleteBag"
```

---

## Task 7: Provider re-base + edit/delete handlers + relative like delta

Implement **7A (primary)** if Task 0's spike succeeded; otherwise **7B (fallback)**. Both end with the same `ShellApi`.

**Files:**
- Modify: `components/app-provider.tsx`

- [ ] **Step 1: Build the `likes` Set from `likedByMe`, not `likedIds`.** Replace `app-provider.tsx:51`:
```tsx
const [likes, setLikes] = useState<Set<string>>(
  () => new Set(initialData.tastings.filter((t) => t.likedByMe).map((t) => t.id)),
);
```

### Task 7A — primary: `useOptimistic` re-base

- [ ] **Step 2A: Re-base `beans`/`tastings` on `initialData`.** Replace `app-provider.tsx:49-50`:
```tsx
import { useOptimistic } from "react";
// ...
const [beans, setBeansOptimistic] = useOptimistic(
  initialData.beans,
  (_state: Bean[], next: Bean[]) => next,
);
const [tastings, setTastingsOptimistic] = useOptimistic(
  initialData.tastings,
  (_state: Tasting[], next: Tasting[]) => next,
);
```

- [ ] **Step 3A: Wrap optimistic writes in a transition.** Add `import { useTransition } from "react";` and `const [, startTransition] = useTransition();`. The handlers below call `startTransition(() => setTastingsOptimistic([...]))` then `await` the action; `revalidatePath` (in the action) re-flows truth into the `initialData` base.

### Task 7B — fallback: `router.refresh()` + surgical re-sync

- [ ] **Step 2B: Keep `useState`, add a data-only re-sync effect.** After the `useState` declarations add:
```tsx
// The action calls revalidatePath; router.refresh() re-runs the layout, which
// hands us fresh initialData. Re-sync ONLY the data fields (never UI state).
useEffect(() => { setBeans(initialData.beans); }, [initialData.beans]);
useEffect(() => { setTastings(initialData.tastings); }, [initialData.tastings]);
useEffect(() => {
  setLikes(new Set(initialData.tastings.filter((t) => t.likedByMe).map((t) => t.id)));
}, [initialData.tastings]);
```
- [ ] **Step 3B:** Add `const router = useRouter();` (already imported) and call `router.refresh()` at the end of each handler below (after the optimistic update + awaited action).

### Common to both paths

- [ ] **Step 4: Rewrite `toggleLike` to a relative delta + persisted truth.** Replace `app-provider.tsx:122-141` so the optimistic Set updates and the action runs; the displayed count math moves to the card (Task 9). Keep the rollback-on-failure:
```tsx
const toggleLike = (id: string) => {
  if (!currentUserId) { router.push("/login"); return; }
  const willLike = !likes.has(id);
  setLikes((prev) => { const n = new Set(prev); willLike ? n.add(id) : n.delete(id); return n; });
  toggleLikeAction(id, willLike).catch(() => {
    setLikes((prev) => { const n = new Set(prev); willLike ? n.delete(id) : n.add(id); return n; });
    toast("Couldn't save that like — please try again");
  });
};
```

- [ ] **Step 5: Add edit/delete handlers + expose on `ShellApi`.** Extend the `ShellApi` interface and the `shell` object with: `openEditBrew(tasting)`, `deleteBrew(id)`, `openEditBag(beanId)`, `deleteBag(beanId)`. Implement (7A shown; for 7B swap `setTastingsOptimistic(next)` → `setTastings(next)` inside `startTransition`→ direct, and append `router.refresh()`):
```tsx
import { updateBrew as updateBrewAction, deleteBrew as deleteBrewAction,
         updateBag as updateBagAction, deleteBag as deleteBagAction } from "@/app/actions";
import type { UpdateBagInput, UpdateBrewInput } from "@/lib/types";

const [edit, setEdit] = useState<{ kind: "brew"; tasting: Tasting } | { kind: "bag"; beanId: string } | null>(null);

const handleUpdateBrew = async (input: UpdateBrewInput) => {
  await updateBrewAction(input); // throws on failure → caught by the sheet
};
const handleDeleteBrew = async (id: string) => {
  startTransition(() => setTastingsOptimistic(tastings.filter((t) => t.id !== id)));
  try { await deleteBrewAction(id); toast("Brew deleted"); }
  catch { toast("Couldn't delete that brew — please try again"); }
};
const handleUpdateBag = async (input: UpdateBagInput) => {
  await updateBagAction(input);
};
const handleDeleteBag = async (beanId: string) => {
  startTransition(() => {
    setBeansOptimistic(beans.filter((b) => b.id !== beanId));
    setTastingsOptimistic(tastings.filter((t) => t.beanId !== beanId));
  });
  try { await deleteBagAction(beanId); toast("Bag and its brews deleted"); router.push("/journal"); }
  catch { toast("Couldn't delete that bag — please try again"); }
};
```
Wire `openEditBrew`/`openEditBag` to `setEdit(...)` and pass `edit`/`setEdit(null)` + the handlers into `<LogSheet>` (Task 8 consumes them).

- [ ] **Step 6: Make `handleLogBrew`/`handleAddBag` re-throw on failure.** Remove the `try/catch` toast-swallowing in `handleLogBrew` (`app-provider.tsx:155-164`) and `handleAddBag` so the sheet can show the real error; keep the success `toast`:
```tsx
const handleLogBrew = async (input: LogBrewInput) => {
  const t = await logBrewAction(input);            // throws on failure
  startTransition(() => setTastingsOptimistic([t, ...tastings]));
  const b = beans.find((x) => x.id === input.beanId);
  toast(`Logged a ${b ? b.name : "coffee"} brew ✓`);
};
```
(For 7B: `setTastings((prev) => [t, ...prev]); router.refresh();`.)

- [ ] **Step 7: Typecheck.** Run: `npx tsc --noEmit`
  Expected: errors now only in `log-sheet.tsx`/`bag-form.tsx`/`cards.tsx` (Tasks 8–9). Provider itself clean.

- [ ] **Step 8: Manual smoke.** `npm run dev`: like → unlike (count stable, no double-count after refresh), log a brew (appears, counts update), delete a brew (disappears, counts drop), scroll position + log-sheet open/close still behave. Stop the server.

- [ ] **Step 9: Commit.**
```bash
git add components/app-provider.tsx
git commit -m "feat(m1,client): provider re-base (useOptimistic/refresh), edit/delete handlers, like Set from likedByMe"
```

---

## Task 8: Honest submit states + edit mode in the sheets

**Files:**
- Modify: `components/log-sheet.tsx`
- Modify: `components/bag-form.tsx`

- [ ] **Step 1: Change the sheet prop types to async + add edit props.** In `log-sheet.tsx`, change `onLogBrew: (input: LogBrewInput) => void` to `=> Promise<void>` (both in `LogSheet` props at line 38 and `BrewFlow` props at line 88), and `onAddBag` to `(input: AddBagInput, backToBrew: boolean) => Promise<void>`. Add optional edit props to `LogSheet`: `editBrew?: Tasting | null`, `onUpdateBrew?: (input: UpdateBrewInput) => Promise<void>` and thread an `editBrew`/`onUpdateBrew` into `BrewFlow`.

- [ ] **Step 2: Pre-populate `BrewFlow` from `editBrew` and branch submit.** In `BrewFlow`, initialize state from `editBrew` when present (e.g. `useState(editBrew?.rating ?? 0)`, parse `dose`/`ratio`/`temp` back to raw numbers via the same regex used in `lib/brew-validation`), add `const [pending, setPending] = useState(false)` and `const [error, setError] = useState<string | null>(null)`, and replace `submit` (lines 105-120):
```tsx
const submit = async () => {
  if (!beanId || !rating || pending) return;
  setPending(true); setError(null);
  const payload = {
    rating, brew, note,
    dose: showParams ? dose + "g" : "—",
    ratio: showParams ? "1:" + ratio : "—",
    temp: showParams ? temp + "°C" : "—",
  };
  try {
    if (editBrew && onUpdateBrew) await onUpdateBrew({ id: editBrew.id, beanId, ...payload } as UpdateBrewInput);
    else await onLogBrew({ beanId, ...payload });
    setDone(true);
    timerRef.current = setTimeout(onClose, 1300);
  } catch (e) {
    setPending(false);
    setError(e instanceof Error ? e.message : "Couldn't save — please try again.");
  }
};
```
Render `error` above the footer button and set the footer button `disabled={!beanId || !rating || pending}` with label `{pending ? "Saving…" : editBrew ? "Save changes" : "Log brew"}`.

- [ ] **Step 3: Same treatment for `BagForm`.** In `bag-form.tsx`, change `onAddBag` to async, add optional `editBag?: Bean | null` + `onUpdateBag?: (input: UpdateBagInput) => Promise<void>`, pre-populate `f`/`varieties`/`notes` from `editBag` when present, add `pending`/`error`, and replace `save` (lines 55-72) to `await` before `setDone(true)`:
```tsx
const save = async () => {
  if (!valid || pending) return;
  setPending(true); setError(null);
  const input = { name: f.name.trim(), roasterName: f.roaster.trim(), origin: f.origin.trim(),
    farm: f.farm.trim(), varieties, process: f.process, roast: f.roast, scaScore: Number(f.sca),
    flavors: notes, color: f.color };
  try {
    if (editBag && onUpdateBag) await onUpdateBag({ id: editBag.id, ...input });
    else await onAddBag(input, !!backToBrew);
    setDone(true);
  } catch (e) {
    setPending(false);
    setError(e instanceof Error ? e.message : "Couldn't save — please try again.");
  }
};
```
Set the footer button `disabled={!valid || pending}` and label `{pending ? "Saving…" : editBag ? "Save changes" : backToBrew ? "Save bag & continue" : "Add to my shelf"}`.

- [ ] **Step 4: Typecheck.** Run: `npx tsc --noEmit`
  Expected: errors now only in `cards.tsx`/`detail.tsx` (Task 9). Sheets clean.

- [ ] **Step 5: Manual smoke.** `npm run dev`: submit a brew with the DB stopped (Docker paused) → the sheet shows a real error, NOT a false "Brew logged!". Restart DB. Stop server.

- [ ] **Step 6: Commit.**
```bash
git add components/log-sheet.tsx components/bag-form.tsx
git commit -m "feat(m1,ui): awaited submit + pending/error states; edit mode in log/bag sheets"
```

---

## Task 9: Card like-math + relative timestamps

**Files:**
- Modify: `components/cards.tsx`
- Modify: `components/screens.tsx`
- Modify: `components/detail.tsx`

- [ ] **Step 1: Fix the like double-count in `TastingCard`.** In `cards.tsx`, replace the `label` at line 137:
```tsx
label={tasting.likes + (liked && !tasting.likedByMe ? 1 : !liked && tasting.likedByMe ? -1 : 0)}
```
(`tasting.likes` is now the true server total; the delta is relative to whether the server already counted this viewer.)

- [ ] **Step 2: Relative time from `createdAt` in `TastingCard`.** Add `import { relativeTime } from "@/lib/relative-time";` and replace line 33:
```tsx
const ago = relativeTime(tasting.createdAt);
```
Keep `· {ago}` rendering; "just now" already reads naturally, so simplify line 64's display to `@{user.handle} · {ago}`.

- [ ] **Step 3: Relative time in the journal list.** In `components/screens.tsx:323`, replace `{t.brew} · {t.time === "now" ? "just now" : `${t.time} ago`}` with `{t.brew} · {relativeTime(t.createdAt)}` and add the `relativeTime` import at the top of `screens.tsx`.

- [ ] **Step 4: Relative time in bean-detail reviews.** In `components/detail.tsx`, add the `relativeTime` import; in the reviews map (around line 273) replace any `t.time`-based age label with `{relativeTime(t.createdAt)}`.

- [ ] **Step 5: Typecheck.** Run: `npx tsc --noEmit` → exit 0 (all `Tasting` literals now satisfied; the only remaining work is Task 10 UI which adds, not breaks, types).

- [ ] **Step 6: Commit.**
```bash
git add components/cards.tsx components/screens.tsx components/detail.tsx
git commit -m "fix(m1,ui): relative like delta (no double-count); relative timestamps from created_at"
```

---

## Task 10: Edit/delete UI + bag-delete confirm + remaining decrement

**Files:**
- Modify: `components/cards.tsx` (own-brew edit/delete affordance)
- Modify: `components/detail.tsx` (bag edit + delete-with-confirm in `BeanDetail`)
- Modify: `components/app-provider.tsx` (pass `edit` state into `<LogSheet>`)

- [ ] **Step 1: Thread the edit sheet through the provider.** In `app-provider.tsx`, pass to `<LogSheet>` (around line 289): `editBrew={edit?.kind === "brew" ? edit.tasting : null}` and `onUpdateBrew={async (i) => { await handleUpdateBrew(i); setEdit(null); }}`, plus the analogous `editBag`/`onUpdateBag` (resolve `edit.beanId` to a `Bean` via `beans.find`). Ensure opening the sheet for edit sets `log.open = true`.

- [ ] **Step 2: Add an own-brew menu to `TastingCard`.** In `cards.tsx`, accept two new optional props `onEdit?: (t: Tasting) => void` and `onDelete?: (id: string) => void`. When `isMine`, render a small overflow button in the header (next to `BeanRating`, line 67) that reveals Edit + Delete; Edit calls `onEdit(tasting)`, Delete shows an inline confirm then `onDelete(tasting.id)`. Wire these from the feed/journal/detail call sites to the shell's `openEditBrew`/`deleteBrew`.
```tsx
{isMine && onEdit && onDelete && (
  <BrewMenu onEdit={() => onEdit(tasting)} onDelete={() => onDelete(tasting.id)} />
)}
```
Define `BrewMenu` as a small local component in `cards.tsx`:
```tsx
function BrewMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--mocha)" }}>Delete?</span>
        <Button variant="ghost" size="sm" onClick={() => { onDelete(); setConfirm(false); setOpen(false); }}
          style={{ color: "var(--berry, #a8434a)" }}>Yes</Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>No</Button>
      </span>
    );
  }
  return open ? (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <Button variant="ghost" size="sm" onClick={() => { onEdit(); setOpen(false); }}>Edit</Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>Delete</Button>
      <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}>
        <Icon name="close" size={16} />
      </Button>
    </span>
  ) : (
    <Button variant="ghost" size="icon" aria-label="Brew options" onClick={() => setOpen(true)}>
      <Icon name="settings" size={16} />
    </Button>
  );
}
```

- [ ] **Step 3: Add bag edit + delete-with-confirm to `BeanDetail`.** In `detail.tsx` `BeanDetail`, when the current user owns the bean (`bean.ownerId === D.currentUserId`), render Edit + Delete buttons near the existing owner-gated "Log a brew" area. Edit calls the shell's `openEditBag(bean.id)`. Delete opens a confirmation `Dialog` (reuse `@/components/ui/dialog`) with copy: `Delete "{bean.name}"? This also removes the {bean.ratings} brew{bean.ratings === 1 ? "" : "s"} you logged against it.` Confirm calls the shell's `deleteBag(bean.id)`.
```tsx
const owned = bean.ownerId === D.currentUserId;
// ...
{owned && (
  <div style={{ display: "flex", gap: 8 }}>
    <Button variant="outline" onClick={() => shell.openEditBag(bean.id)}>Edit bag</Button>
    <Button variant="ghost" onClick={() => setConfirmDelete(true)}>Delete</Button>
  </div>
)}
```
Add a `confirmDelete` `useState` + the `Dialog`. Pull `shell` via `useShell()`.

- [ ] **Step 4: `remaining` decrement on brew.** In `app-provider.tsx` `handleLogBrew`, after a successful insert, optimistically lower the bag's `remaining` by a dose's worth (e.g. `Math.max(0, (bean.remaining ?? 1) - 0.05)`) in the optimistic `beans` update so the shelf ring reflects use; the server value reconciles on revalidate. (If a server-side decrement is wanted it can be a follow-up — flagged in the spec.)

- [ ] **Step 5: Typecheck + manual smoke.** Run: `npx tsc --noEmit` → exit 0. `npm run dev`: edit your own brew (sheet pre-populates, saves, feed updates), delete a brew (confirm → gone), edit a bag, delete a bag (confirm shows the brew count → bag + its brews gone, lands on Journal). Stop server.

- [ ] **Step 6: Commit.**
```bash
git add components/cards.tsx components/detail.tsx components/app-provider.tsx
git commit -m "feat(m1,ui): edit/delete brews from cards; bag edit + delete-confirm; remaining decrement"
```

---

## Task 11: Final verification + plan close-out

- [ ] **Step 1: Full test suite.** Run: `npx vitest run`
  Expected: all green (original 36 + the new `compute-on-read`, `relative-time`, `brew-validation`, `actions-edit-delete`, and extended `log-brew` cases).

- [ ] **Step 2: Typecheck + build.** Run: `npx tsc --noEmit` (exit 0). Run: `npm run build` (succeeds).

- [ ] **Step 3: End-to-end manual pass on a fresh DB.** Run: `npm run db:reset && npm run dev`. As a signed-in user: add a bag → log 2 brews → confirm bean shows `(2)` + a real average and the Profile "Tastings" stat matches; like/unlike (count stable across reload); edit a brew; delete a brew (counts drop); edit the bag; delete the bag (its brews vanish). Confirm no console errors.

- [ ] **Step 4: Update the work-status doc.** Note M1 complete in `docs/superpowers/specs/2026-06-05-m1-data-integrity-write-path-design.md` (Status → Implemented) and commit:
```bash
git add docs/superpowers/specs/2026-06-05-m1-data-integrity-write-path-design.md
git commit -m "docs(m1): mark data-integrity milestone implemented"
```

- [ ] **Step 5: Open the PR (when ready).** `gh pr create --base main --head feat/m1-data-integrity` with a body summarizing the milestone and linking the spec/report.

---

## Self-review notes (author)

- **Spec coverage:** compute-on-read (T2), client reconciliation/useOptimistic (T0+T7), validation no-Zod (T4), numeric params as validated text (T4), honest submit states (T8), edit/delete + ownership guards (T6/T10), bag-delete confirm (T10), real timestamps (T3+T9), tests via mock-db (T2/T4/T5/T6), forward-compat (queries pattern). All present.
- **Type consistency:** `UpdateBrewInput`/`UpdateBagInput` defined in T1, used in T6/T7/T8/T10; `Tasting.likedByMe`/`createdAt` defined T1, produced T2, consumed T9; `AppData.likedIds` removed T1, consumers fixed T2/T7.
- **Known carryover:** `UpdateBrewInput` has no `beanId`; T8 passes `{ id, beanId, ...payload }` then the action ignores `beanId` (validateUpdateBrew strips it) — brew stays on its original bag by design.
