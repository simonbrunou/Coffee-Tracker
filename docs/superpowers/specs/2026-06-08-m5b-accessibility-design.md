# M5·B — Accessibility (WCAG 2.1 AA) — Design

**Date:** 2026-06-08
**Branch:** `feat/m5b-accessibility`
**Status:** Approved design, grounded by the 4-lens `m5b-a11y-audit` (structure/semantics, ARIA names-roles-values, keyboard/focus, contrast/motion/forms).

## Goal

Bring Cortado to **WCAG 2.1 AA** for public launch by fixing the audited gaps, and lock it in with a static **eslint-plugin-jsx-a11y** guard in CI. The codebase already has a strong base (radiogroup rating, Radix dialog focus-trap, labeled chrome icons, `role=group` filter pills, form-label associations, tuned dark contrast) — all preserved.

## Locked decisions
- **Low-risk equivalents** for the two invasive refactors: keep nav as `<button>`+`router.push` and add `aria-current` (don't touch the scroll-restoration logic coupled to `router.push`); use `role="list"`/`role="listitem"` for collections (no layout change) instead of `<ul>`/`<li>`.
- **Automated guard:** `eslint-plugin-jsx-a11y` (recommended ruleset) in the flat ESLint config → runs in the existing `npm run lint` / CI. No runtime/axe server dependency.

Full per-finding detail (file:line, WCAG SC) lives in the audit artifact; this spec groups the fixes into green-at-commit cuts.

## Cut 1 — Global foundations (highest leverage; `app/globals.css` + shell)

- **Focus visible (2.4.7) — blocker.** Add to `globals.css`: `button:focus-visible` and `a:focus-visible` → `outline: 3px solid var(--caramel-deep); outline-offset: 2px; border-radius: 4px`, plus explicit `.nav-item/.nav-user/.bottom-item:focus-visible` rules so the ring hugs their shapes. This covers every raw control (nav, FAB, all pill/chip toggles, grid cards, icon remove buttons, `error.tsx` button, settings legal links, clear-search) that today has no indicator. shadcn `Button`/`Input`/`Slider` already have rings (keep).
- **Reduced motion (2.3.3).** Add `@media (prefers-reduced-motion: reduce)` zeroing animation/transition durations globally (and the named `.fade-up/.sheetUp/.sheetPop/.pop/.fadeIn/.scaleIn`), `scroll-behavior: auto`.
- **Contrast (1.4.3 / 1.4.11).** Light theme: darken `--mocha` (~`oklch(0.58)`→`~0.50`) to reach 4.5:1 as tertiary text; use `--caramel-deep` for link/accent **text** (not `--caramel`); strengthen `--line`/`--line-soft` (~1.36:1) to ≥3:1 for control/input borders; make the focus ring full-opacity `--caramel-deep` (replace the `ring/50` in `button.tsx`/`input.tsx` or rely on the new outline). **Each change re-checked with a computed ratio during build** (target AA: 4.5:1 text / 3:1 non-text); dark theme already passes — verify no regression.
- **Skip to content (2.4.1).** Add `<a href="#main-content" class="skip-link">Skip to content</a>` as the first focusable child of `#app-root` (`app-provider.tsx:317`); add `id="main-content" tabIndex={-1}` to `<main>` (`:384`); `.skip-link` CSS (off-screen until `:focus`).

## Cut 2 — Names, roles & states (ARIA sweep)

- **Decorative SVG noise (1.1.1/4.1.2).** Default `aria-hidden="true" focusable="false"` on the `<svg>` in the shared `Icon` component (`ui.tsx`) — single biggest fix. `BeanGlyph`/`BeanBag`/`RemainingRing` decorative too. **`FlavorRadar`** (`detail.tsx:353`) is informative → `role="img"` + summarizing `aria-label` (or sr-only axis/value list).
- **Accessible names (4.1.2) — add `aria-label`:** Add-bag (`app-provider:347`), flavor remove (`flavor-wheel:52`), variety remove (`bag-form:197`), color swatches (`bag-form:133`), journal view-toggle (`screens:369`), the two "Add a bag" dashed buttons (`screens:280`, `log-sheet:222`), and concise labels on the big card-as-button controls (bean strip / `BeanCard`/`TrendingCard`/`RoasterCard`).
- **State (4.1.2) — add `aria-pressed`** on every single-select toggle group: process filter (`screens:659`, + `role=group aria-label`), brew-method (`log-sheet:254`), roast `ChipRow` (`bag-form:311`), bag selector (`log-sheet:186`), color swatches (model as `role=radiogroup`/`radio`+`aria-checked`), like/save (`cards:139`), journal view-toggle. `aria-current="page"` on active nav (`app-provider:336`,`:465`). `aria-expanded`+`aria-haspopup` on the BrewMenu trigger (`cards:210`). Flavor accordion: swatch `aria-hidden` + sr-only "selected" on the count badge.
- **Landmarks (1.3.1).** `<aside className="sidebar">` → `<div>` (it's primary chrome, not complementary); label both navs (`<nav aria-label="Primary">` desktop, `"Primary (mobile)"` bottom); move the mobile `<header className="mobile-top">` out of `<main>` to be its sibling so it's the banner landmark; legal footer → `<nav aria-label="Legal"><ul>`. `Avatar` → `aria-hidden` (name is always adjacent). Bean→roaster control renders a `<span>` (not a focusable no-op `<button>`) when there's no roaster id (`detail:137`).

## Cut 3 — Structure & forms

- **Heading order (1.3.1).** `detail.tsx:279` "SCA tasting notes" `<h3>`→`<h2>` (was h1→h3→h2).
- **List semantics (1.3.1).** `role="list"`/`role="listitem"` on the feed (`screens:141`), discover grid (`:677`), roaster grid (`detail:489`), reviews (`detail:314`), trending (`:651`), journal grids, and palate chips. (No `<ul>` conversion → no layout change.)
- **Page titles (2.4.2).** Add `export const metadata` to the server `settings/page.tsx` ("Settings — Cortado", noindex); convert `journal/page.tsx` + `profile/page.tsx` + the feed `(app)/page.tsx` to thin **server wrappers** that export `metadata` (titles "My Journal / Your Profile / your feed") and render the existing client child (mirrors how `settings/page.tsx` wraps its client). Private routes get `robots:{index:false}`.
- **Forms (1.3.5/3.3.1/3.3.2/4.1.3).** `autocomplete` on login/signup (`email`/`current-password`/`new-password`/`name`); login error → `role="alert"` (`login/page.tsx`); in-sheet form fields (`bag-form`, `log-sheet`) get programmatic `aria-invalid`/`aria-describedby` on error + required marking; failure path uses an assertive toast (or a `role=alert` region) rather than a polite auto-dismissing one for errors.

## Cut 4 — Automated guard + live verification + PR

- **`eslint-plugin-jsx-a11y`** added to the flat ESLint config (recommended ruleset); fix anything it flags; `npm run lint` (CI) stays green — this is the regression guard.
- **Live verification (controller-driven):** full keyboard tab-through (visible focus on every control; skip link works; logical order); `prefers-reduced-motion` emulation stops animations; screen-reader spot checks on nav (`aria-current`), toggles (`aria-pressed`), the rating + flavor widgets, the sheet (name/trap/restore); devtools contrast spot-check on `--mocha`/links/borders in both themes; per-route titles in the tab bar.

## Testing
- **`eslint-plugin-jsx-a11y`** = the automated guard (catches missing `aria-label`/`alt`/`role`/redundant-roles etc. statically).
- **Structural tests** (`readFileSync`) pin the load-bearing invariants: `globals.css` contains `:focus-visible` + `@media (prefers-reduced-motion: reduce)`; `Icon` defaults `aria-hidden`; the skip link + `id="main-content"` exist; nav has `aria-current`; the four named routes export a `metadata` title.
- **Full gate** unchanged: suite + build + lint (now with jsx-a11y) + typecheck + drift.

## Risks & mitigations
| Risk | Mitigation |
|---|---|
| Contrast token change degrades the look or another usage | Re-compute ratios; change only `--mocha`/`--line`/link-text/ring; visually verify both themes in live check |
| `aria-hidden` default on `Icon` hides an *informative* icon | Audit found ~all decorative; FlavorRadar handled explicitly; jsx-a11y + live SR check catch a missed one |
| Moving the mobile `<header>` out of `<main>` shifts layout | Keep identical markup/classes, only reparent; verify mobile shell in live check; revert to in-place + `role` note if it regresses |
| Server-wrapper title pages break the client feed/journal/profile | Mirror the proven `settings/page.tsx` pattern; build + live verify each route renders |
| jsx-a11y floods lint with errors | Adopt the recommended set, fix in Cut 4, downgrade any noisy/false-positive rule with a documented reason |

## Out of scope / deferred
- Converting nav to `<Link>` and collections to `<ul>/<li>` (low-risk equivalents chosen instead).
- Full `role=tablist`/`tab`/`tabpanel` migration of the filter groups (current `role=group`+`aria-pressed` is conformant).
- Wiring the profile "Edit" button to a real action (a11y fix = remove it from the tab order or label it; full edit feature is its own work).
- A runtime axe pass / Playwright a11y CI lane (jsx-a11y chosen).
