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

Back-compat: `getTopFlavors` (`lib/queries.ts:272`, `unnest(b.flavors)` at
`:275`) is string-agnostic; free-text values aggregate exactly like wheel
values. No schema or query change.

## Tier 1 — lean per-tasting assessment + own-tasting radar

### Schema — new `tasting_assessments` table

Add to `lib/db/schema.ts`; generate `drizzle/0007_tasting_assessments.sql`.
**Six homogeneous intensity sliders, one per radar axis — all the same 0–15
measured scale (no chip-derived axes).**

```
tasting_assessments
  tasting_id  text PRIMARY KEY REFERENCES tastings(id) ON DELETE CASCADE  -- 1:1
  body_intensity      numeric  CHECK (body_intensity      IS NULL OR body_intensity      BETWEEN 0 AND 15)
  acidity_intensity   numeric  CHECK (acidity_intensity   IS NULL OR acidity_intensity   BETWEEN 0 AND 15)
  sweetness_intensity numeric  CHECK (sweetness_intensity IS NULL OR sweetness_intensity BETWEEN 0 AND 15)
  fruit_intensity     numeric  CHECK (fruit_intensity     IS NULL OR fruit_intensity     BETWEEN 0 AND 15)
  floral_intensity    numeric  CHECK (floral_intensity    IS NULL OR floral_intensity    BETWEEN 0 AND 15)
  finish_intensity    numeric  CHECK (finish_intensity    IS NULL OR finish_intensity    BETWEEN 0 AND 15)
  created_at timestamptz NOT NULL DEFAULT now()
  updated_at timestamptz                          -- nullable, no default; mirrors comments.updated_at
```

Drizzle form (matching the house pattern in `schema.ts`):

```ts
export const tastingAssessments = pgTable("tasting_assessments", {
  tastingId: text("tasting_id").primaryKey()
    .references(() => tastings.id, { onDelete: "cascade" }),
  bodyIntensity:      numeric("body_intensity"),
  acidityIntensity:   numeric("acidity_intensity"),
  sweetnessIntensity: numeric("sweetness_intensity"),
  fruitIntensity:     numeric("fruit_intensity"),
  floralIntensity:    numeric("floral_intensity"),
  finishIntensity:    numeric("finish_intensity"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (t) => [
  check("ta_body_range",  sql`${t.bodyIntensity}      is null or ${t.bodyIntensity}      between 0 and 15`),
  check("ta_acid_range",  sql`${t.acidityIntensity}   is null or ${t.acidityIntensity}   between 0 and 15`),
  check("ta_sweet_range", sql`${t.sweetnessIntensity} is null or ${t.sweetnessIntensity} between 0 and 15`),
  check("ta_fruit_range", sql`${t.fruitIntensity}     is null or ${t.fruitIntensity}     between 0 and 15`),
  check("ta_floral_range",sql`${t.floralIntensity}    is null or ${t.floralIntensity}    between 0 and 15`),
  check("ta_finish_range",sql`${t.finishIntensity}    is null or ${t.finishIntensity}    between 0 and 15`),
]);
```

- **1:1 via PK = FK.** No nullable FKs, no exactly-one CHECK (assessment has a
  single owner — the tasting). Clean upsert by primary key.
- **`numeric`, not integer** (CVA intensity allows fractional values). Cast
  `::float8` on read to match the house pattern in `lib/queries.ts`.
- **Cascade**: deleting a tasting (`deleteBrew`, `app/actions.ts`) removes the
  assessment automatically (consistent with likes/comments/saves).
- **No backfill.** Historical tastings simply have no assessment row (the
  natural empty state). Intensities cannot be reconstructed from existing data.
- **`updated_at` is NULL on insert** (the `logBrew`/initial path does not set
  it) and set to `now()` only on the `updateBrew` upsert path — mirrors the
  `comments.updated_at` convention. Do not add it to the INSERT column list.
- Radar query joins via `tastings_bean_idx` (already exists, `schema.ts:120`);
  the PK on `tasting_assessments` covers the assessment side.

### Captured fields → radar axes

The radar (`components/detail.tsx:371`) renders axes in this exact array order —
the `FlavorRadar` value array MUST be built in the same order:

| # | Radar axis (code order) | Source |
|---|---|---|
| 0 | Body | `avg(body_intensity)` |
| 1 | Acidity | `avg(acidity_intensity)` |
| 2 | Sweetness | `avg(sweetness_intensity)` |
| 3 | Fruit | `avg(fruit_intensity)` |
| 4 | Florals | `avg(floral_intensity)` |
| 5 | Finish | `avg(finish_intensity)` |

All six axes are the same measured 0–15 quantity → divide by 15 for the 0–1
polygon. No chip-frequency derivation, no `LEAF_CATEGORY` map, no second flavor
list. Dropped from v1 (not rendered anywhere): the ~24 CATA checkbox grid, main
tastes, mouthfeel CATA, per-section free descriptors, the fragrance/aroma/
flavor/aftertaste intensity split, roast level, and per-tasting flavor-note
capture (Tier 0 free-text + the bean's roaster chips already cover "what
flavors").

### Validation (no new lib files)

- `lib/brew-validation.ts`: add `validateTastingAssessment` — clamp each of the
  6 intensities to 0–15 or pass through null (reuse the existing `num()` /
  `clamp()` helpers). No flavor array on the assessment, so no array caps here.
- **Sliders default to *unset* (null), not a midpoint.** A user who drags only
  some sliders must leave the rest null — never emit a fabricated 7.5. The
  schema, validation, and radar are all NULL-aware to support partial fills;
  the UI must distinguish "unset" from a deliberate 0. Slider control primitive
  and step/precision are a P2 implementer call.

### Write path

- `withTransaction` **already exists** (`lib/db.ts:46-64`, tested in
  `test/db.test.ts`) — reuse it.
- `logBrew` (`app/actions.ts`) gains an optional `assessment` payload. When it is
  present, run inside one transaction: insert the tasting **with its existing
  embedded ownership guard** (`from beans where id=$3 and user_id=$2`), then
  insert the assessment **only if the tasting row was created** (preserve the
  `rows.length` check). Use `client.query` inside the transaction. When no
  assessment payload is present, the existing single-query path is unchanged.
- `updateBrew` gains the same optional payload; when present, wrap in a
  transaction and upsert the assessment by PK (`insert … on conflict (tasting_id)
  do update set …, updated_at = now()`), so edits can add/fix an assessment.
  When absent, the existing `query()` path is unchanged.
- Types: extend `LogBrewInput` / `UpdateBrewInput` (`lib/types.ts`) with an
  optional `assessment` object. **The prop-chain TS signatures must update
  together:** `BrewFlow.onLogBrew` → `LogSheet.onLogBrew` →
  `app-provider.tsx handleLogBrew` all carry the extended input. `handleLogBrew`
  needs no logic change — it passes the `assessment` field through opaquely; the
  assessment is **not** added to the `Tasting` type or any optimistic update.

### Own-tasting radar

- New server action `getMyBeanRadar(beanId)` — lives in `app/actions.ts` (it
  calls the auth helper `getCurrentUserId()` / `requireVerifiedUserId()`, so it
  must be a `"use server"` action, not a bare query fn). It averages the
  **current user's** assessments for that bean.
  - NULL-aware: each of the 6 axes is `avg(col)::float8` plus a per-axis
    `count(col)` so axes computed over different sample sizes can be
    labelled/dimmed.
  - Scoped `from tasting_assessments ta join tastings t on t.id = ta.tasting_id
    where t.bean_id = $1 and t.user_id = $me`.
  - Returns null/empty when the user has no assessments for the bean.
- `BeanDetail` is a context-fed client component (no server props / no per-bean
  server fetch today; the only existing read-action precedent is
  `fetchComments`, called on user interaction in `comment-thread.tsx`). It
  fetches the radar **lazily** via `useEffect`/`startTransition` keyed on
  `beanId`, holding the result in local `useState`, with a loading state while
  pending. After the user logs/edits a brew **with** an assessment from this
  screen, the radar must **refetch** so the just-entered data lands without a
  navigation round-trip. This is new wiring (~1–1.5 days).
- `FlavorRadar` is rewritten to render real data or an **honest empty state**.
  When the user has no assessments for the bean, **collapse the radar card
  entirely** (don't render a large empty box) — ~95% of catalog beans have no
  user assessment. The hash-fabricated radar (`detail.tsx:379`) is removed.

## Corrections folded in (from council review)

- `withTransaction` already exists — reuse, do not rebuild.
- `numeric` intensities (not integer); spell CHECKs as `col IS NULL OR col BETWEEN …`.
- **Radar axis order** is `[Body, Acidity, Sweetness, Fruit, Florals, Finish]`
  (`detail.tsx:371`); the value array and the column→axis mapping above are in
  that order. A plan-writer must not reorder them.
- **Table-count test does not exist yet.** `test/integration/constraints.test.ts:17`
  asserts 11 tables but deliberately applies only `0000_init.sql` (pre-migration
  constraint testing) — leave it at 11. Add a **new** integration test that uses
  `allMigrationsSql()` (`test/integration/_db.ts`) and asserts the full-schema
  table count is **15** (the all-migrations schema has 14 tables today; the new
  `tasting_assessments` makes 15 — note this is *not* `11 + 1`; the two tests
  exercise different SQL surfaces).
- `test/log-brew.test.ts` mocks only `query`; the transaction refactor changes
  the import surface — update the mock to also cover `withTransaction` and keep
  the ownership-guard SQL assertion.
- `getMyBeanRadar` is a `"use server"` action in `app/actions.ts` (auth helper),
  not a bare `lib/queries.ts` function.
- **Success auto-close UX** (`log-sheet.tsx:166`, the 1300 ms `setTimeout(onClose)`):
  keep the auto-close on the quick path (assessment expander never opened);
  when the assessment fields were used, **do not auto-close** — let the user
  dismiss the `DonePanel` manually so they can confirm their entries.

## Phasing (each independently shippable)

- **Tier 0** — free-text picker + Cranberry + `brew-validation` hardening.
- **P1** — `tasting_assessments` schema + migration +
  `validateTastingAssessment` (+ unit tests; new full-schema table-count test).
- **P2** — `<TastingAssessmentFields>` component (6 intensity sliders), opt-in
  "Add tasting notes" expander in `BrewFlow` (`components/log-sheet.tsx`);
  `logBrew` + `updateBrew` transactional writes + prop-chain type updates
  (+ updated tests). Success auto-close timer stays on the quick path only.
- **P3** — `getMyBeanRadar` + lazy load + refetch in `BeanDetail` + real/empty
  (collapsing) `FlavorRadar` (retire the fabricated radar).

**Process gate:** P1→P2 can proceed continuously, but **gate P3 on observed P2
assessment fill-rate** — the radar's entire value depends on users opting into
the expander on a speed-oriented flow. Ship Tier 0 + P2, watch adoption, then
commit P3's radar wiring.

## Testing

- **Unit:** `validateTastingAssessment` (clamping 0–15, null pass-through for
  each of the 6 intensities); Tier-0 `brew-validation` flavor hardening
  (trim + ≤40 char per-item + ≤10 count).
- **Integration:** 1:1 PK constraint; cascade delete from `tastings`; the 6
  intensity range CHECKs reject out-of-range; **new** full-schema table-count
  test (`allMigrationsSql` → 12); `getMyBeanRadar` (own-scoped, NULL-aware
  per-axis counts, empty state when no assessments). The new full-schema
  table-count test asserts **15** (via `allMigrationsSql`).
- **Action:** `logBrew`/`updateBrew` write the assessment in-transaction;
  ownership guard preserved; assessment skipped when no payload; `updateBrew`
  upsert sets `updated_at`.
- **Known gap:** no component-test infra (no jsdom/testing-library). The
  assessment form gets logic-level coverage only; full DOM testing is out of
  scope unless a jsdom Vitest project is added.

## Estimated effort

Tier 0 ~1 day. Tier 1: P1 ~0.5 day, P2 ~1.5–2 days, P3 ~1.5 days — ~3.5–4
developer-days. Biggest non-obvious cost is the P3 lazy-fetch + refetch wiring
into the context-fed `BeanDetail` (no existing on-mount read-fetch pattern).

## Out of scope / deferred

- Full CVA descriptive form (fragrance/aroma/flavor/aftertaste intensity split,
  ~24 CATA grid, main tastes, mouthfeel CATA, per-section free descriptors,
  roast level).
- CVA on the bean (reference assessment).
- Per-tasting flavor-note capture (a "what I tasted" list distinct from the
  bean's roaster notes) — dropped with the 6-slider radar; revisit only as its
  own feature, not to feed the radar.
- Community / cross-user radar aggregation (own-tasting only for v1).
- Exporting CVA-format records.
