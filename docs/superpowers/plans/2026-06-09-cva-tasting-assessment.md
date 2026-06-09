# CVA Tasting Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users record off-wheel tasting notes (Tier 0) and an optional lean per-tasting CVA assessment that powers a real, own-tasting bean radar (Tier 1).

**Architecture:** Tier 0 adds free-text descriptors to the existing flat `beans.flavors text[]` (no schema change). Tier 1 adds a 1:1 `tasting_assessments` table (six numeric 0–15 intensity columns, PK = FK to `tastings`), written transactionally from `logBrew`/`updateBrew`, and read on demand by a `getMyBeanRadar` action that drives the `FlavorRadar`.

**Tech Stack:** Next.js (App Router, Server Actions), Postgres via `pg`, Drizzle ORM + drizzle-kit migrations, Vitest (unit + integration projects), React 19.

**Spec:** `docs/superpowers/specs/2026-06-09-cva-tasting-assessment-design.md`

**Conventions:**
- Run a single unit test file: `npx vitest run <path>`
- Integration tests require a test DB and self-skip without one (`describe.skipIf(!hasDb)`); run with `DATABASE_URL` set (see `.env.test`).
- Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`.
- No component-test infra exists (no jsdom/testing-library) — UI tasks verify via typecheck + lint + a manual check, not a unit test.

---

## File Structure

**Tier 0**
- Modify `lib/flavor-wheel.ts` — add the "Cranberry" leaf.
- Modify `lib/brew-validation.ts` — cap each flavor string to 40 chars.
- Modify `components/flavor-wheel.tsx` — free-text "Add your own" input per category.

**Tier 1**
- Modify `lib/db/schema.ts` — `tastingAssessments` table.
- Add `drizzle/0007_*.sql` — generated migration.
- Modify `lib/types.ts` — `TastingAssessment` type; extend `LogBrewInput`/`UpdateBrewInput`.
- Modify `lib/brew-validation.ts` — `validateTastingAssessment`.
- Modify `app/actions.ts` — transactional assessment writes in `logBrew`/`updateBrew`; new `getMyBeanRadar`.
- Add `components/tasting-assessment-fields.tsx` — `<TastingAssessmentFields>` (6 sliders).
- Modify `components/log-sheet.tsx` — opt-in expander; thread assessment through `BrewFlow`.
- Modify `components/app-provider.tsx` + `components/log-sheet.tsx` props — prop-chain types.
- Modify `components/detail.tsx` — real/empty `FlavorRadar`, lazy fetch + refetch in `BeanDetail`.
- Add `test/cva-validation.test.ts`, `test/integration/cva-assessments.test.ts`, `test/integration/full-schema-tables.test.ts`.
- Modify `test/log-brew.test.ts` — mock `withTransaction`.

---

# TIER 0 — Off-wheel descriptors (ships independently)

### Task 1: Add the "Cranberry" leaf

**Files:**
- Modify: `lib/flavor-wheel.ts:19`

- [ ] **Step 1: Add the leaf**

In `lib/flavor-wheel.ts`, the Fruity → Berry group is:
```ts
{ name: "Berry", notes: ["Blackberry", "Raspberry", "Blueberry", "Strawberry"] },
```
Change it to:
```ts
{ name: "Berry", notes: ["Blackberry", "Raspberry", "Blueberry", "Strawberry", "Cranberry"] },
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/flavor-wheel.ts
git commit -m "feat(flavor): add Cranberry to the Fruity/Berry group"
```

---

### Task 2: Cap flavor strings to 40 chars (server validation)

**Files:**
- Modify: `lib/brew-validation.ts:72`
- Test: `test/brew-validation.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/brew-validation.test.ts` (it already imports from `@/lib/brew-validation`; add the import if missing):
```ts
import { validateAddBag } from "@/lib/brew-validation";

describe("validateAddBag flavor hardening", () => {
  const base = { name: "X", roasterName: "R", origin: "O", color: "#c98a4a" };

  it("trims and caps each flavor to 40 chars", () => {
    const long = "a".repeat(50);
    const r = validateAddBag({ ...base, flavors: ["  Cranberry  ", long] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.flavors[0]).toBe("Cranberry");
    expect(r.value.flavors[1]).toBe("a".repeat(40));
  });

  it("caps the flavor count at 10", () => {
    const r = validateAddBag({ ...base, flavors: Array.from({ length: 15 }, (_, i) => `f${i}`) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.flavors.length).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/brew-validation.test.ts`
Expected: FAIL — the 50-char string is not capped to 40.

- [ ] **Step 3: Implement the cap**

In `lib/brew-validation.ts`, the `arr` helper inside `validateBagFields` is:
```ts
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => (x as string).trim()).filter(Boolean) : []);
```
Change the `flavors` line (currently `const flavors = arr(r.flavors).slice(0, 10);`) to cap each item:
```ts
const flavors = arr(r.flavors).map((s) => s.slice(0, 40)).slice(0, 10);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/brew-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/brew-validation.ts test/brew-validation.test.ts
git commit -m "feat(validation): cap bag flavor strings to 40 chars"
```

---

### Task 3: Free-text "Add your own" descriptor in the picker

**Files:**
- Modify: `components/flavor-wheel.tsx`

No component-test infra — verify by typecheck + lint + manual check.

- [ ] **Step 1: Add per-category free-text state**

In `components/flavor-wheel.tsx`, inside `FlavorWheelPicker`, after the existing `const atMax = value.length >= max;` line, add:
```tsx
const [draft, setDraft] = useState("");
const addCustom = () => {
  const v = draft.trim().slice(0, 40);
  if (!v || value.includes(v) || value.length >= max) { setDraft(""); return; }
  onChange([...value, v]);
  setDraft("");
};
```

- [ ] **Step 2: Render the input inside each open category**

In the `<AccordionContent>` block, after the `{cat.groups.map(...)}` mapping closes (just before `</AccordionContent>`), add a free-text row:
```tsx
<div style={{ marginTop: 14, display: "flex", gap: 8 }}>
  <input
    value={draft}
    onChange={(e) => setDraft(e.target.value)}
    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
    maxLength={40}
    placeholder="Add your own…"
    aria-label={`Add a custom ${cat.name} note`}
    disabled={atMax}
    style={{
      flex: 1, minHeight: 40, padding: "8px 12px", borderRadius: 99,
      border: "1px solid var(--line)", background: "var(--surface)",
      fontSize: "var(--text-xs)", color: "var(--coffee)",
    }}
  />
  <button
    onClick={addCustom}
    disabled={!draft.trim() || atMax}
    aria-label="Add custom note"
    style={{
      minHeight: 40, padding: "0 14px", borderRadius: 99, fontWeight: 600,
      fontSize: "var(--text-xs)", background: cat.color, color: "#fff",
      opacity: !draft.trim() || atMax ? 0.4 : 1,
    }}
  >
    Add
  </button>
</div>
```
Custom terms not in `WHEEL_FLAT` render in the existing selected-chip row with the `var(--mocha)` fallback dot — that is the accepted behaviour.

- [ ] **Step 3: Verify typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual check**

Start the app (`npm run dev`), open Add a bag → expand a flavor category → type "Cranberry"-like text → Enter/Add → confirm it appears as a selected chip and is capped at 10 total.

- [ ] **Step 5: Commit**

```bash
git add components/flavor-wheel.tsx
git commit -m "feat(flavor): free-text 'Add your own' descriptor in the picker"
```

---

# TIER 1 — Lean per-tasting assessment + own-tasting radar

### Task 4: `tasting_assessments` schema + migration

**Files:**
- Modify: `lib/db/schema.ts` (append after the `comments` table)
- Generate: `drizzle/0007_*.sql`

- [ ] **Step 1: Add the Drizzle table**

In `lib/db/schema.ts`, after the `comments` table definition, add (all needed imports — `pgTable, text, numeric, timestamp, check, sql` — are already imported at the top):
```ts
export const tastingAssessments = pgTable(
  "tasting_assessments",
  {
    tastingId: text("tasting_id")
      .primaryKey()
      .references(() => tastings.id, { onDelete: "cascade" }),
    bodyIntensity: numeric("body_intensity"),
    acidityIntensity: numeric("acidity_intensity"),
    sweetnessIntensity: numeric("sweetness_intensity"),
    fruitIntensity: numeric("fruit_intensity"),
    floralIntensity: numeric("floral_intensity"),
    finishIntensity: numeric("finish_intensity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    check("ta_body_range",   sql`${t.bodyIntensity}      is null or ${t.bodyIntensity}      between 0 and 15`),
    check("ta_acid_range",   sql`${t.acidityIntensity}   is null or ${t.acidityIntensity}   between 0 and 15`),
    check("ta_sweet_range",  sql`${t.sweetnessIntensity} is null or ${t.sweetnessIntensity} between 0 and 15`),
    check("ta_fruit_range",  sql`${t.fruitIntensity}     is null or ${t.fruitIntensity}     between 0 and 15`),
    check("ta_floral_range", sql`${t.floralIntensity}    is null or ${t.floralIntensity}    between 0 and 15`),
    check("ta_finish_range", sql`${t.finishIntensity}    is null or ${t.finishIntensity}    between 0 and 15`),
  ],
);
```

- [ ] **Step 2: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: a new `drizzle/0007_*.sql` is created (with `CREATE TABLE "tasting_assessments"` and the six CHECK constraints) and `drizzle/meta/_journal.json` + a `0007_snapshot.json` are updated automatically.

- [ ] **Step 3: Inspect the generated SQL**

Open the new `drizzle/0007_*.sql`. Confirm: `tasting_id text PRIMARY KEY`, an FK to `tastings(id)` with `ON DELETE CASCADE`, six `numeric` columns, six `CHECK (... is null or ... between 0 and 15)` constraints. If drizzle emitted the FK without `ON DELETE cascade`, hand-edit the SQL to add it (matches the `comments`/`likes` convention).

- [ ] **Step 4: Apply to local dev DB**

Run: `npm run db:setup` (or the project's migrate command).
Expected: migration applies cleanly.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat(db): add tasting_assessments table (1:1, 6 intensity 0-15)"
```

---

### Task 5: Integration tests for the new table

**Files:**
- Create: `test/integration/cva-assessments.test.ts`
- Create: `test/integration/full-schema-tables.test.ts`

- [ ] **Step 1: Write the constraint/cascade test**

Create `test/integration/cva-assessments.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { freshDbWithSql, dropDb, allMigrationsSql } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("tasting_assessments", () => {
  const DB = "cortado_cva";
  afterAll(() => dropDb(DB));

  async function seeded() {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    await c.query(`insert into users (id,name,handle,avatar) values ('u','U','u','#000')`);
    await c.query(`insert into beans (id,name,color,user_id,owned) values ('b','Bean','#000','u',true)`);
    await c.query(`insert into tastings (id,user_id,bean_id,rating) values ('t','u','b',4)`);
    return c;
  }

  it("rejects an out-of-range intensity (SQLSTATE 23514)", async () => {
    const c = await seeded();
    try {
      await expect(
        c.query(`insert into tasting_assessments (tasting_id, body_intensity) values ('t', 99)`),
      ).rejects.toMatchObject({ code: "23514" });
    } finally { await c.end(); }
  });

  it("cascades when the tasting is deleted", async () => {
    const c = await seeded();
    try {
      await c.query(`insert into tasting_assessments (tasting_id, body_intensity) values ('t', 12)`);
      await c.query(`delete from tastings where id = 't'`);
      const r = await c.query(`select count(*)::int as n from tasting_assessments`);
      expect(r.rows[0].n).toBe(0);
    } finally { await c.end(); }
  });

  it("enforces 1:1 (duplicate tasting_id rejected)", async () => {
    const c = await seeded();
    try {
      await c.query(`insert into tasting_assessments (tasting_id) values ('t')`);
      await expect(
        c.query(`insert into tasting_assessments (tasting_id) values ('t')`),
      ).rejects.toMatchObject({ code: "23505" });
    } finally { await c.end(); }
  });
});
```

- [ ] **Step 2: Write the full-schema table-count test**

Create `test/integration/full-schema-tables.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { freshDbWithSql, dropDb, allMigrationsSql } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("full migration schema", () => {
  const DB = "cortado_fullschema";
  afterAll(() => dropDb(DB));

  it("has 15 public base tables after all migrations", async () => {
    // allMigrationsSql() applies drizzle/0000..0007. 14 tables existed before
    // tasting_assessments; this is NOT 11+1 (the constraints.test.ts baseline
    // applies only 0000_init.sql). See spec.
    const c = await freshDbWithSql(DB, allMigrationsSql());
    try {
      const r = await c.query(
        `select count(*)::int as n from information_schema.tables
         where table_schema='public' and table_type='BASE TABLE'`,
      );
      expect(r.rows[0].n).toBe(15);
    } finally { await c.end(); }
  });
});
```

- [ ] **Step 3: Run the integration tests**

Run: `DATABASE_URL=$TEST_DATABASE_URL npx vitest run test/integration/cva-assessments.test.ts test/integration/full-schema-tables.test.ts`
Expected: PASS (or SKIPPED if no DB). If the count assertion fails with a different number, read the actual count from the error and reconcile against `lib/db/schema.ts` table defs before changing the constant.

- [ ] **Step 4: Commit**

```bash
git add test/integration/cva-assessments.test.ts test/integration/full-schema-tables.test.ts
git commit -m "test(db): cva_assessments constraints + full-schema table count (15)"
```

---

### Task 6: `TastingAssessment` type + `validateTastingAssessment`

**Files:**
- Modify: `lib/types.ts` (after `LogBrewInput`/`UpdateBrewInput`)
- Modify: `lib/brew-validation.ts`
- Create: `test/cva-validation.test.ts`

- [ ] **Step 1: Add the type and extend the inputs**

In `lib/types.ts`, add:
```ts
/** Lean per-tasting CVA assessment — six 0–15 intensities, each optional. */
export interface TastingAssessment {
  body: number | null;
  acidity: number | null;
  sweetness: number | null;
  fruit: number | null;
  floral: number | null;
  finish: number | null;
}
```
Then add an optional field to both `LogBrewInput` and `UpdateBrewInput`:
```ts
  assessment?: TastingAssessment | null;
```

- [ ] **Step 2: Write the failing test**

Create `test/cva-validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateTastingAssessment } from "@/lib/brew-validation";

describe("validateTastingAssessment", () => {
  it("returns null when nothing is provided", () => {
    expect(validateTastingAssessment(undefined)).toBeNull();
    expect(validateTastingAssessment(null)).toBeNull();
    expect(validateTastingAssessment({})).toBeNull();
  });

  it("returns null when all six axes are null", () => {
    expect(
      validateTastingAssessment({ body: null, acidity: null, sweetness: null, fruit: null, floral: null, finish: null }),
    ).toBeNull();
  });

  it("clamps each axis to 0–15 and passes nulls through", () => {
    const a = validateTastingAssessment({ body: 20, acidity: -3, sweetness: 7.5, fruit: null, floral: 0, finish: 15 });
    expect(a).toEqual({ body: 15, acidity: 0, sweetness: 7.5, fruit: null, floral: 0, finish: 15 });
  });

  it("treats non-numeric axes as null", () => {
    const a = validateTastingAssessment({ body: "x", acidity: 5 });
    expect(a).toEqual({ body: null, acidity: 5, sweetness: null, fruit: null, floral: null, finish: null });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run test/cva-validation.test.ts`
Expected: FAIL — `validateTastingAssessment` is not exported.

- [ ] **Step 4: Implement `validateTastingAssessment`**

In `lib/brew-validation.ts`, add an import for the type and the function (reuse the existing `num` and `clamp` helpers):
```ts
import type { AddBagInput, LogBrewInput, TastingAssessment, UpdateBagInput, UpdateBrewInput } from "@/lib/types";

const AXES = ["body", "acidity", "sweetness", "fruit", "floral", "finish"] as const;

/** Clamp each of the six intensities to 0–15 or null. Returns null when the
 *  whole assessment is empty (so callers skip writing a row). */
export function validateTastingAssessment(raw: unknown): TastingAssessment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out = {} as TastingAssessment;
  let any = false;
  for (const k of AXES) {
    const n = num(r[k]);
    out[k] = n == null ? null : clamp(n, 0, 15);
    if (out[k] != null) any = true;
  }
  return any ? out : null;
}
```
(The existing first line `import type { AddBagInput, LogBrewInput, UpdateBagInput, UpdateBrewInput }` is replaced by the line above.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/cva-validation.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/brew-validation.ts test/cva-validation.test.ts
git commit -m "feat(validation): TastingAssessment type + validateTastingAssessment"
```

---

### Task 7: Transactional assessment writes in `logBrew`/`updateBrew`

**Files:**
- Modify: `app/actions.ts:14-34` (logBrew), `:67-84` (updateBrew)
- Modify: `test/log-brew.test.ts`

- [ ] **Step 1: Update the test mock and add an assessment test**

In `test/log-brew.test.ts`, the db mock currently is:
```ts
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
```
Replace it so the transaction path is mockable (the callback receives a fake client whose `query` is the same `queryMock`):
```ts
const queryMock = vi.fn();
const txClientQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: async (fn: (c: { query: typeof txClientQuery }) => Promise<unknown>) =>
    fn({ query: txClientQuery }),
}));
```
Add a test below the existing ones:
```ts
it("writes the assessment in a transaction when provided", async () => {
  txClientQuery.mockReset();
  // tasting insert returns a row, assessment insert returns nothing
  txClientQuery
    .mockResolvedValueOnce({ rows: [{ id: "t-1" }] })
    .mockResolvedValueOnce({ rows: [] });
  queryMock.mockResolvedValue({ rows: [{ id: "t-1", userId: "u-me", beanId: "b-1" }] }); // getTastingById re-select
  await logBrew({ ...input, assessment: { body: 12, acidity: null, sweetness: null, fruit: null, floral: null, finish: null } });
  // first tx statement keeps the ownership guard
  const [guardSql] = txClientQuery.mock.calls[0] as [string, unknown[]];
  expect(guardSql).toMatch(/from beans where id = \$3 and user_id = \$2/i);
  // second tx statement writes the assessment
  const [assessSql] = txClientQuery.mock.calls[1] as [string, unknown[]];
  expect(assessSql).toMatch(/insert into tasting_assessments/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/log-brew.test.ts`
Expected: FAIL — `logBrew` doesn't use `withTransaction` / doesn't write the assessment.

- [ ] **Step 3: Implement the transactional write in `logBrew`**

In `app/actions.ts`, update the import line:
```ts
import { query, withTransaction } from "@/lib/db";
```
and the validation import to add the assessment validator:
```ts
import { validateLogBrew, validateAddBag, validateUpdateBrew, validateUpdateBag, validateTastingAssessment } from "@/lib/brew-validation";
```
Replace the body of `logBrew` (the `query<{id}>` block) so it branches on an assessment. Add a small shared helper above `logBrew`:
```ts
const TASTING_INSERT = `insert into tastings
     (id, user_id, bean_id, rating, brew, dose, ratio, temp, note, likes)
   select $1, $2, $3, $4, $5, $6, $7, $8, $9, 0
   from beans where id = $3 and user_id = $2
   returning id`;

const ASSESSMENT_UPSERT = `insert into tasting_assessments
     (tasting_id, body_intensity, acidity_intensity, sweetness_intensity,
      fruit_intensity, floral_intensity, finish_intensity)
   values ($1, $2, $3, $4, $5, $6, $7)
   on conflict (tasting_id) do update set
     body_intensity = excluded.body_intensity,
     acidity_intensity = excluded.acidity_intensity,
     sweetness_intensity = excluded.sweetness_intensity,
     fruit_intensity = excluded.fruit_intensity,
     floral_intensity = excluded.floral_intensity,
     finish_intensity = excluded.finish_intensity,
     updated_at = now()`;

const assessParams = (tastingId: string, a: TastingAssessment) =>
  [tastingId, a.body, a.acidity, a.sweetness, a.fruit, a.floral, a.finish];
```
Add the `TastingAssessment` type to the `@/lib/types` import in `app/actions.ts`. Then in `logBrew`, after `const id = ...`:
```ts
  const assessment = validateTastingAssessment(input.assessment);
  const tastingParams = [id, userId, input.beanId, input.rating, input.brew, input.dose, input.ratio, input.temp, input.note];

  if (assessment) {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(TASTING_INSERT, tastingParams);
      if (rows.length === 0) throw new Error("Couldn't log a brew for that bag.");
      await client.query(ASSESSMENT_UPSERT, assessParams(id, assessment));
    });
  } else {
    const { rows } = await query<{ id: string }>(TASTING_INSERT, tastingParams);
    if (rows.length === 0) throw new Error("Couldn't log a brew for that bag.");
  }
  revalidatePath("/", "layout");
  const tasting = await getTastingById(userId, id);
  if (!tasting) throw new Error("Couldn't log a brew for that bag.");
  return tasting;
```

- [ ] **Step 4: Implement the transactional write in `updateBrew`**

In `updateBrew`, after `const input = v.value;` add:
```ts
  const assessment = validateTastingAssessment(input.assessment);
  const updateParams = [input.id, userId, input.rating, input.brew, input.dose, input.ratio, input.temp, input.note];
  const UPDATE_TASTING = `update tastings set rating = $3, brew = $4, dose = $5, ratio = $6, temp = $7, note = $8
     where id = $1 and user_id = $2`;

  if (assessment) {
    await withTransaction(async (client) => {
      const { rowCount } = await client.query(UPDATE_TASTING, updateParams);
      if (!rowCount) throw new Error("Couldn't update that brew.");
      await client.query(ASSESSMENT_UPSERT, assessParams(input.id, assessment));
    });
  } else {
    const { rowCount } = await query(UPDATE_TASTING, updateParams);
    if (!rowCount) throw new Error("Couldn't update that brew.");
  }
  revalidatePath("/", "layout");
  const tasting = await getTastingById(userId, input.id);
  if (!tasting) throw new Error("Couldn't update that brew.");
  return tasting;
```
(Remove the old `const { rowCount } = await query(...)` block that this replaces.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/log-brew.test.ts`
Expected: PASS (existing ownership-guard tests still green; new transaction test green).

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add app/actions.ts test/log-brew.test.ts
git commit -m "feat(actions): write tasting_assessments transactionally in logBrew/updateBrew"
```

---

### Task 8: `getMyBeanRadar` server action

**Files:**
- Modify: `app/actions.ts` (new action), `lib/types.ts` (return type)
- Modify: `test/integration/cva-assessments.test.ts` (add a query test) — optional but recommended

- [ ] **Step 1: Add the return type**

In `lib/types.ts`:
```ts
/** Own-tasting radar: avg of the current user's 0–15 intensities for a bean,
 *  with per-axis sample counts. null when the user has no assessments. */
export interface BeanRadar {
  body: number | null;
  acidity: number | null;
  sweetness: number | null;
  fruit: number | null;
  floral: number | null;
  finish: number | null;
  counts: { body: number; acidity: number; sweetness: number; fruit: number; floral: number; finish: number };
  n: number;
}
```

- [ ] **Step 2: Add the action**

In `app/actions.ts` add `BeanRadar` to the `@/lib/types` import, then append:
```ts
/** The current user's own-tasting radar for a bean (null when they have none). */
export async function getMyBeanRadar(beanId: string): Promise<BeanRadar | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { rows } = await query<{
    body: number | null; acidity: number | null; sweetness: number | null;
    fruit: number | null; floral: number | null; finish: number | null;
    body_n: number; acidity_n: number; sweetness_n: number; fruit_n: number; floral_n: number; finish_n: number;
    n: number;
  }>(
    `select
       avg(ta.body_intensity)::float8      as body,      count(ta.body_intensity)::int      as body_n,
       avg(ta.acidity_intensity)::float8   as acidity,   count(ta.acidity_intensity)::int   as acidity_n,
       avg(ta.sweetness_intensity)::float8 as sweetness, count(ta.sweetness_intensity)::int as sweetness_n,
       avg(ta.fruit_intensity)::float8     as fruit,     count(ta.fruit_intensity)::int     as fruit_n,
       avg(ta.floral_intensity)::float8    as floral,    count(ta.floral_intensity)::int    as floral_n,
       avg(ta.finish_intensity)::float8    as finish,    count(ta.finish_intensity)::int    as finish_n,
       count(*)::int as n
     from tasting_assessments ta
     join tastings t on t.id = ta.tasting_id
     where t.bean_id = $1 and t.user_id = $2`,
    [beanId, userId],
  );
  const r = rows[0];
  if (!r || r.n === 0) return null;
  return {
    body: r.body, acidity: r.acidity, sweetness: r.sweetness, fruit: r.fruit, floral: r.floral, finish: r.finish,
    counts: { body: r.body_n, acidity: r.acidity_n, sweetness: r.sweetness_n, fruit: r.fruit_n, floral: r.floral_n, finish: r.finish_n },
    n: r.n,
  };
}
```

- [ ] **Step 3: Integration test for the radar aggregation**

The action needs Next auth context, so test the underlying query, not the action. Append to `test/integration/cva-assessments.test.ts` (extend `seeded()` to add a second tasting `t2` if needed, or insert inline):
```ts
it("averages the user's assessments per bean (NULL-aware counts)", async () => {
  const c = await seeded();
  try {
    await c.query(`insert into tastings (id,user_id,bean_id,rating) values ('t2','u','b',5)`);
    await c.query(`insert into tasting_assessments (tasting_id, body_intensity, acidity_intensity) values ('t', 10, 8)`);
    await c.query(`insert into tasting_assessments (tasting_id, body_intensity) values ('t2', 14)`); // acidity NULL
    const r = await c.query(
      `select avg(body_intensity)::float8 as body, count(body_intensity)::int as body_n,
              avg(acidity_intensity)::float8 as acidity, count(acidity_intensity)::int as acidity_n,
              count(*)::int as n
       from tasting_assessments ta join tastings t on t.id = ta.tasting_id
       where t.bean_id = 'b' and t.user_id = 'u'`,
    );
    expect(r.rows[0].body).toBe(12);     // (10+14)/2
    expect(r.rows[0].body_n).toBe(2);
    expect(r.rows[0].acidity).toBe(8);   // only one non-null
    expect(r.rows[0].acidity_n).toBe(1);
    expect(r.rows[0].n).toBe(2);
  } finally { await c.end(); }
});
```

- [ ] **Step 4: Typecheck and commit**

```bash
npx tsc --noEmit
git add app/actions.ts lib/types.ts test/integration/cva-assessments.test.ts
git commit -m "feat(actions): getMyBeanRadar (own-tasting averages, null when none)"
```

---

### Task 9: `<TastingAssessmentFields>` component

**Files:**
- Create: `components/tasting-assessment-fields.tsx`

No component-test infra — verify by typecheck + lint + manual check. State shape matches `TastingAssessment` (null = unset; never a fabricated midpoint).

- [ ] **Step 1: Create the component**

Create `components/tasting-assessment-fields.tsx`:
```tsx
"use client";
import type { TastingAssessment } from "@/lib/types";

const AXES: { key: keyof TastingAssessment; label: string }[] = [
  { key: "body", label: "Body" },
  { key: "acidity", label: "Acidity" },
  { key: "sweetness", label: "Sweetness" },
  { key: "fruit", label: "Fruit" },
  { key: "floral", label: "Florals" },
  { key: "finish", label: "Finish" },
];

export const EMPTY_ASSESSMENT: TastingAssessment = {
  body: null, acidity: null, sweetness: null, fruit: null, floral: null, finish: null,
};

export function TastingAssessmentFields({
  value,
  onChange,
}: {
  value: TastingAssessment;
  onChange: (next: TastingAssessment) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {AXES.map(({ key, label }) => {
        const v = value[key];
        return (
          <label key={key} style={{ display: "grid", gridTemplateColumns: "84px 1fr 28px", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--espresso)" }}>{label}</span>
            <input
              type="range"
              min={0}
              max={15}
              step={0.5}
              value={v ?? 0}
              // A slider that's never been touched stays null (unset). Once the
              // user moves it, it holds a real value (including a deliberate 0).
              onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })}
              aria-label={`${label} intensity, 0 to 15${v == null ? ", unset" : ""}`}
              style={{ width: "100%", accentColor: "var(--caramel)" }}
            />
            <span className="mono" style={{ fontSize: "var(--text-2xs)", color: "var(--mocha)", textAlign: "right" }}>
              {v == null ? "—" : v}
            </span>
          </label>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/tasting-assessment-fields.tsx
git commit -m "feat(ui): TastingAssessmentFields (6 intensity sliders, null=unset)"
```

---

### Task 10: Wire the assessment through the log sheet + prop chain

**Files:**
- Modify: `components/log-sheet.tsx` (`BrewFlow` + prop types)
- Modify: `components/app-provider.tsx` (handlers already pass input through; verify types)

- [ ] **Step 1: Thread the expander into `BrewFlow`**

In `components/log-sheet.tsx`, add imports:
```tsx
import { TastingAssessmentFields, EMPTY_ASSESSMENT } from "./tasting-assessment-fields";
import type { TastingAssessment } from "@/lib/types";
```
Inside `BrewFlow`, add state near the other `useState`s:
```tsx
const [showAssess, setShowAssess] = useState(false);
const [assessment, setAssessment] = useState<TastingAssessment>(EMPTY_ASSESSMENT);
```
(`Tasting` does not carry an `assessment` field, so do **not** reference `editBrew?.assessment` here — it would be a type error. Loading an existing assessment into the edit form is deliberately out of scope for v1; the expander starts collapsed/empty on edit too.)

In `submit`, include the assessment only when the expander was opened:
```tsx
const payload = showAssess ? { ...params, assessment } : params;
if (isEdit && onUpdateBrew) await onUpdateBrew({ id: editBrew!.id, rating, ...payload });
else await onLogBrew({ beanId, rating, ...payload });
setDone(true);
// Quick path auto-closes; if the user filled an assessment, let them dismiss
// manually so they can confirm their entries.
if (!showAssess) timerRef.current = setTimeout(onClose, 1300);
```

- [ ] **Step 2: Render the expander**

In `BrewFlow`'s JSX, after the Notes `<Textarea>` block (before the closing `</div>` of the scroll area), add:
```tsx
<div style={{ marginTop: 18 }}>
  <Button
    variant="ghost"
    size="sm"
    onClick={() => setShowAssess((s) => !s)}
    className="mb-1 h-auto gap-2 p-0 text-[length:var(--text-sm)] font-semibold text-[var(--coffee)] hover:bg-transparent"
  >
    <Icon name={showAssess ? "close" : "plus"} size={15} color="var(--mocha)" /> {showAssess ? "Hide" : "Add"} tasting notes
  </Button>
  {showAssess && (
    <div className="fade-up" style={{ marginTop: 12 }}>
      <TastingAssessmentFields value={assessment} onChange={setAssessment} />
    </div>
  )}
</div>
```

- [ ] **Step 3: Verify the prop-chain types**

`onLogBrew`/`onUpdateBrew` are typed `(input: LogBrewInput) => Promise<void>` etc. Since `LogBrewInput`/`UpdateBrewInput` now carry the optional `assessment`, no signature edits are needed in `LogSheet` or `app-provider.tsx` — `handleLogBrew`/`handleUpdateBrew` pass `input` through opaquely. Confirm with:

Run: `npx tsc --noEmit`
Expected: no errors. (If TS complains about the spread `{ ...payload }` widening, type `payload` as `Partial<LogBrewInput>` locally.)

- [ ] **Step 4: Lint + manual check**

Run: `npm run lint`
Then `npm run dev`: log a brew, open "Add tasting notes", move 2 sliders, submit → confirm success panel stays (no auto-close); reopen the bean and verify the radar (Task 11) reflects it.

- [ ] **Step 5: Commit**

```bash
git add components/log-sheet.tsx
git commit -m "feat(ui): opt-in tasting assessment expander in the log sheet"
```

---

### Task 11: Real / empty `FlavorRadar` + lazy fetch in `BeanDetail`

**Files:**
- Modify: `components/detail.tsx` (`FlavorRadar`, `BeanDetail`)

**Process gate:** per the spec, build this only after Tier 0 + Task 10 have shipped and assessment fill-rate is observed. The steps below are concrete and ready when that gate opens.

- [ ] **Step 1: Make `FlavorRadar` data-driven**

In `components/detail.tsx`, change `FlavorRadar` to take optional radar data and render an empty signal when absent. Replace the signature and the `vals` computation:
```tsx
import type { Bean, BeanRadar, Page, Tasting, User } from "@/lib/types";

export function FlavorRadar({ bean, radar }: { bean: Bean; radar: BeanRadar | null }) {
  const axes = ["Body", "Acidity", "Sweetness", "Fruit", "Florals", "Finish"];
  if (!radar) return null; // caller collapses the card; nothing to draw
  const order: (keyof BeanRadar)[] = ["body", "acidity", "sweetness", "fruit", "floral", "finish"];
  const vals = order.map((k) => {
    const v = radar[k] as number | null;
    return v == null ? 0 : Math.round((v / 15) * 1000) / 1000;
  });
  // ...unchanged geometry (size/c/r/round/pt/poly) and SVG below, using `vals`...
```
Keep the rest of the SVG body exactly as-is (it already maps `vals`). Remove the old seed/hash/roast/process block.

- [ ] **Step 2: Fetch the radar in `BeanDetail`**

In `components/detail.tsx`, add to the imports:
```tsx
import { useEffect, useState } from "react";
import { loadMoreBeanReviews, loadMoreRoasterBeans, getMyBeanRadar } from "@/app/actions";
import type { BeanRadar } from "@/lib/types";
```
Inside `BeanDetail`, after the `useLoadMore` line, add lazy fetch state:
```tsx
const [radar, setRadar] = useState<BeanRadar | null>(null);
useEffect(() => {
  let active = true;
  getMyBeanRadar(beanId).then((r) => { if (active) setRadar(r); }).catch(() => {});
  return () => { active = false; };
}, [beanId, reviews.length]); // refetch after a brew is logged from this screen (reviews grows)
```

- [ ] **Step 3: Collapse the radar card when empty**

In `BeanDetail`'s JSX, the radar row currently always renders `<FlavorRadar bean={bean} />` inside a bordered card. Make the card conditional on `radar` and pass it through. Replace the radar-row wrapper so that when `radar` is null the radar column is omitted and the notes span full width:
```tsx
{radar ? (
  <div /* existing radar-row styles */ className="radar-row" style={{ /* keep existing */ }}>
    <FlavorRadar bean={bean} radar={radar} />
    <div>{/* existing SCA tasting notes block */}</div>
  </div>
) : (
  <div style={{ marginBottom: 30 }}>
    {/* existing SCA tasting notes block, rendered full-width without the radar */}
  </div>
)}
```
(Extract the "SCA tasting notes" block into a small local `NotesBlock({ bean })` to avoid duplicating it across the two branches.)

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (Any other caller of `FlavorRadar` must now pass `radar`; `grep -rn "FlavorRadar" components app` to confirm `BeanDetail` is the only one — it is.)

- [ ] **Step 5: Manual check**

`npm run dev`: a bean with no assessments shows the notes full-width, no radar box. Log a brew with an assessment from that bean's page → the radar appears/refreshes with your values.

- [ ] **Step 6: Commit**

```bash
git add components/detail.tsx
git commit -m "feat(ui): real own-tasting FlavorRadar with empty-state collapse"
```

---

## Done criteria

- Tier 0: a user can type "Cranberry" (or any term ≤40 chars) into the bag flavor picker; server caps length/count.
- Tier 1: logging/editing a brew with the "Add tasting notes" expander persists a `tasting_assessments` row (1:1, transactional, ownership-guarded); the bean page shows a real radar from the current user's assessments, or collapses the card when there are none.
- All unit tests pass (`npx vitest run`); integration tests pass with a test DB; `npx tsc --noEmit` and `npm run lint` clean.
