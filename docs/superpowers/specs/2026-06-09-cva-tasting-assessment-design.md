# CVA Tasting Assessment — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design); ready for implementation planning
**Author:** Simon + Claude (brainstormed; reviewed by a two-round model-diverse council)

## Problem

The app stores coffee "tasting notes" as a flat `text[]` (`beans.flavors`), entered
via a wheel-leaf picker constrained to the SCA 2016 Coffee Taster's Flavor Wheel.
Users see notes like **"cranberry"** that are not on the wheel. Two separate gaps:

1. **Closed vocabulary.** The picker only allows wheel leaves, so legitimate
   off-wheel descriptors have no first-class way in. (The server validator
   `lib/brew-validation.ts:74` already accepts arbitrary strings — so the
   constraint is purely the picker, and there is no per-item sanitization.)
2. **No per-cup assessment.** The flavor data lives on the *bean* (the roaster's
   reference cupping notes). There is no way to record what *you* tasted in a
   given brew, and the bean-detail radar (`components/detail.tsx:369-443`) is
   **fabricated** from a hash of the bean id.

The SCA's current sensory standard is the **Coffee Value Assessment (CVA),
Std 103-2024 (Descriptive Assessment)** — which supersedes the 2004 cupping
protocol. The wheel itself is unchanged (CVA Appendix 8.3 reproduces the
2021/V2 SCA/WCR/UC-Davis wheel). In CVA, broad categories are checked (CATA)
and specific terms like "cranberry" are **freely-elicited write-ins** (§6.3.4).
That write-in concept is exactly what is missing here.

## Scope decisions (made during brainstorming + council)

- **Attach assessment to tastings only**, not symmetrically to beans. A bean's
  flavors are a transcribed roaster reference; intensities/mouthfeel belong to a
  personal cupping event (a tasting). This also keeps the feed/SEO/profile read
  paths untouched (they read only `beans.flavors`).
- **Lean capture**, not the full CVA descriptive form. The only v1 consumer
  surface is a 6-axis radar, so we capture only what it renders.
- **Own-tasting radar.** The radar shows the *current user's* assessments of a
  bean, not a cross-user average (averaging subjective scores across palates /
  brew methods is dishonestly precise).
- **Ship Tier 0 independently** of Tier 1.

## Tier 0 — fix the reported problem (no migration)

1. **Free-text descriptors.** `components/flavor-wheel.tsx` (`FlavorWheelPicker`)
   gains an "Add your own" text input per open category. The typed term is
   pushed into the same `flavors: string[]` and coloured by the open category.
   Terms unknown to `WHEEL_FLAT` fall through to `var(--mocha)` — accepted.
2. **Add Cranberry** to `lib/flavor-wheel.ts` under Fruity → Berry. No
   open-ended "missing leaves" audit — free-text covers the long tail.
3. **Server hardening** in `lib/brew-validation.ts`: trim each note, per-item
   length cap (≤40 chars), count cap (≤10, already present). Independent of the
   picker (defense in depth).

Back-compat: `getTopFlavors` (`lib/queries.ts:272`) is `unnest(b.flavors)` and is
string-agnostic; free-text values aggregate exactly like wheel values. No schema
or query change.

## Tier 1 — lean per-tasting assessment + own-tasting radar

### Schema — new `tasting_assessments` table

Add to `lib/db/schema.ts`; generate `drizzle/0007_tasting_assessments.sql`.

```
tasting_assessments
  tasting_id  text PRIMARY KEY REFERENCES tastings(id) ON DELETE CASCADE  -- 1:1
  body_intensity      numeric  CHECK (body_intensity      IS NULL OR body_intensity      BETWEEN 0 AND 15)
  acidity_intensity   numeric  CHECK (acidity_intensity   IS NULL OR acidity_intensity   BETWEEN 0 AND 15)
  sweetness_intensity numeric  CHECK (sweetness_intensity IS NULL OR sweetness_intensity BETWEEN 0 AND 15)
  finish_intensity    numeric  CHECK (finish_intensity    IS NULL OR finish_intensity    BETWEEN 0 AND 15)
  flavors  text[] NOT NULL DEFAULT '{}'::text[]   -- the user's own per-cup notes (reuses the picker)
  created_at timestamptz NOT NULL DEFAULT now()
  updated_at timestamptz
```

- **1:1 via PK = FK.** No nullable FKs, no exactly-one CHECK (assessment has a
  single owner — the tasting). Clean upsert by primary key.
- **`numeric`, not integer** (CVA intensity allows fractional values). Cast
  `::float8` on read to match the house pattern in `lib/queries.ts`.
- **Cascade**: deleting a tasting (`deleteBrew`, `app/actions.ts`) removes the
  assessment automatically (consistent with likes/comments/saves).
- **No backfill.** Historical tastings simply have no assessment row (the
  natural empty state). Intensities cannot be reconstructed from existing data.
- Add an index supporting the radar query: `tasting_assessments(tasting_id)` is
  the PK; the radar joins via `tastings.bean_idx` (already exists).

### Captured fields → radar axes

The radar (`components/detail.tsx:371`) has 6 axes. Mapping:

| Radar axis | Source |
|---|---|
| Body | `avg(body_intensity)` |
| Acidity | `avg(acidity_intensity)` |
| Sweetness | `avg(sweetness_intensity)` |
| Finish | `avg(finish_intensity)` |
| Fruit | frequency of Fruity-category leaves in the user's tasting `flavors` |
| Florals | frequency of Floral-category leaves in the user's tasting `flavors` |

Dropped from v1 (not rendered anywhere): the ~24 CATA checkbox grid, main tastes,
mouthfeel CATA, per-section free descriptors, fragrance/aroma/flavor/aftertaste
intensity split, roast level.

### Reference data + validation (no new lib files)

- `lib/flavor-wheel.ts`: add a derived `LEAF_CATEGORY: Record<string,string>`
  map (built like `WHEEL_FLAT`) so a leaf resolves to its top category — used
  for the Fruit/Florals radar derivation and free-text colouring.
- `lib/brew-validation.ts`: add `validateTastingAssessment` — clamp the 4
  intensities to 0–15 or null; reuse the Tier-0 flavor trim/length/count caps for
  the assessment's `flavors`.

### Write path

- `withTransaction` **already exists** (`lib/db.ts:46-64`, tested in
  `test/db.test.ts`) — reuse it.
- `logBrew` (`app/actions.ts`) gains an optional `assessment` payload. Inside one
  transaction: insert the tasting **with its existing embedded ownership guard**
  (`from beans where id=$3 and user_id=$2`), then insert the assessment **only if
  the tasting row was created** (preserve the `rows.length` check). Use
  `client.query` inside the transaction.
- `updateBrew` gains the same optional payload and upserts the assessment by PK
  (`insert … on conflict (tasting_id) do update …`), so edits can add/fix an
  assessment. Maintain `updated_at` on update.
- Types: extend `LogBrewInput` / `UpdateBrewInput` (`lib/types.ts`) with an
  optional `assessment` object.

### Own-tasting radar

- New server action `getMyBeanRadar(beanId)` (in `app/actions.ts` or
  `lib/queries.ts`): averages the **current user's** assessments for that bean.
  - NULL-aware: each intensity axis is `avg(col)` plus a per-axis `count(col)`
    so axes computed over different sample sizes can be labelled/dimmed.
  - Fruit/Florals: aggregate the user's tasting `flavors` for that bean, count
    leaves whose `LEAF_CATEGORY` is Fruity / Floral, normalize.
  - Scoped `where t.bean_id = $1 and t.user_id = $me`.
  - Returns null/empty when the user has no assessments for the bean.
- `BeanDetail` is a context-fed client component (no server props / no per-bean
  server fetch today). It fetches the radar **lazily** on panel open (server
  action via `useEffect`/`startTransition`). This is new wiring (~0.5–1 day).
- `FlavorRadar` is rewritten to render real data or an **honest empty state**
  ("not enough tastings yet"). The hash-fabricated radar (`detail.tsx:379`) is
  removed.

## Corrections folded in (from council review)

- `withTransaction` already exists — reuse, do not rebuild.
- `numeric` intensities (not integer); spell CHECKs as `col IS NULL OR col BETWEEN …`.
- Array-length checks use `coalesce(array_length(col,1),0) <= N` form.
- Per-item descriptor length caps are enforced in app validation (not a DB
  constraint) — do not claim DB-level element-length enforcement.
- Integration table-count assertion: `test/integration/constraints.test.ts:17`
  asserts 11 but applies only `0000_init.sql`; the all-migrations schema check
  (`allMigrationsSql`, `test/integration/_db.ts`) is the right target for the
  new table (→12). Update whichever assertion actually exercises the full schema.
- `test/log-brew.test.ts` mocks only `query`; the transaction refactor changes
  the import surface — update the mock and keep the ownership-guard assertion.

## Phasing (each independently shippable)

- **Tier 0** — free-text picker + Cranberry + `brew-validation` hardening.
- **P1** — `tasting_assessments` schema + migration + `LEAF_CATEGORY` +
  `validateTastingAssessment` (+ unit tests; table-count test update).
- **P2** — `<TastingAssessmentFields>` component (4 sliders + reused flavor
  picker), opt-in "Add tasting notes" expander in `BrewFlow`
  (`components/log-sheet.tsx`); `logBrew` + `updateBrew` transactional writes
  (+ updated tests). Success auto-close timer stays on the quick path only.
- **P3** — `getMyBeanRadar` + lazy load in `BeanDetail` + real/empty
  `FlavorRadar` (retire the fabricated radar).

## Testing

- **Unit:** `validateTastingAssessment` (clamping 0–15, null handling, flavor
  trim/length/count caps); `LEAF_CATEGORY` map (every wheel leaf resolves;
  Fruity/Floral detection).
- **Integration:** 1:1 PK constraint; cascade delete from `tastings`; intensity
  range CHECKs reject out-of-range; table-count update; `getMyBeanRadar`
  (own-scoped, NULL-aware per-axis counts, empty state when no assessments).
- **Action:** `logBrew`/`updateBrew` write the assessment in-transaction;
  ownership guard preserved; assessment skipped when no payload.
- **Known gap:** no component-test infra (no jsdom/testing-library). The
  assessment form gets logic-level coverage only; full DOM testing is out of
  scope unless a jsdom Vitest project is added.

## Estimated effort

~3–4 developer-days for Tier 1 (P1–P3); Tier 0 ~1 day. Biggest non-obvious cost
is the P3 lazy-fetch wiring into the context-fed `BeanDetail`.

## Out of scope / deferred

- Full CVA descriptive form (7-section intensities, ~24 CATA grid, main tastes,
  mouthfeel CATA, per-section free descriptors, roast level).
- CVA on the bean (reference assessment).
- Community / cross-user radar aggregation (own-tasting only for v1).
- Exporting CVA-format records.
