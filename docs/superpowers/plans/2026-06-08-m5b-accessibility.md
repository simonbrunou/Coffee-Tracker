# M5·B — Accessibility (WCAG 2.1 AA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement task-by-task. Checkbox (`- [ ]`) steps.

**Goal:** Fix the audited WCAG 2.1 AA gaps and add an `eslint-plugin-jsx-a11y` CI guard.

**Architecture:** Mostly `globals.css` + per-component ARIA attributes; two low-risk patterns (nav `aria-current` not links; `role=list` not `<ul>`); thin server wrappers for per-route titles. Spec: `docs/superpowers/specs/2026-06-08-m5b-accessibility-design.md`. The exhaustive per-line list is in the `m5b-a11y-audit` artifact.

**Verification model:** structural `readFileSync` tests pin load-bearing invariants; **`eslint-plugin-jsx-a11y` is the behavioral regression guard**; a controller-driven keyboard/SR/contrast live pass at Cut 4. Green at each commit.

**Cuts:** (1) global foundations → (2) ARIA sweep → (3) structure & forms → (4) guard + live verify.

---

## Cut 1 — Global foundations

### Task 1: Focus-visible + reduced-motion + skip link

**Files:** `app/globals.css`, `components/app-provider.tsx`; Test `test/a11y-structure.test.ts` (create).

- [ ] **Step 1: Failing structural test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("a11y global foundations", () => {
  const css = read("app/globals.css");
  it("has a global focus-visible indicator for button + a", () => {
    expect(css).toMatch(/button:focus-visible/);
    expect(css).toMatch(/a:focus-visible/);
  });
  it("honors prefers-reduced-motion", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
  it("defines a skip link", () => {
    expect(css).toMatch(/\.skip-link/);
  });
  it("shell renders the skip link + main target", () => {
    const shell = read("components/app-provider.tsx");
    expect(shell).toMatch(/href="#main-content"/);
    expect(shell).toMatch(/id="main-content"/);
  });
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run test/a11y-structure.test.ts`.

- [ ] **Step 3: Append to `app/globals.css`** (after the existing reset/focus area):

```css
/* ---- Accessibility: visible keyboard focus (raw controls; shadcn already rings) ---- */
button:focus-visible,
a:focus-visible,
[role="button"]:focus-visible,
.nav-item:focus-visible,
.nav-user:focus-visible,
.bottom-item:focus-visible {
  outline: 3px solid var(--caramel-deep);
  outline-offset: 2px;
  border-radius: 6px;
}

/* ---- Skip to content ---- */
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 300;
}
.skip-link:focus {
  left: 8px;
  top: 8px;
  width: auto;
  height: auto;
  padding: 8px 14px;
  background: var(--cream);
  color: var(--espresso);
  border: 1px solid var(--caramel-deep);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
}

/* ---- Respect reduced motion ---- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: Add the skip link + main id in `components/app-provider.tsx`** — immediately inside the `#app-root` div (the element at the `<div id="app-root" ...>` line), as the first child:

```tsx
<a href="#main-content" className="skip-link">Skip to content</a>
```
and on the `<main ref={scrollRef} className="main-scroll">` element add `id="main-content" tabIndex={-1}`.

- [ ] **Step 5: Run → pass; tsc.** `npx vitest run test/a11y-structure.test.ts && npx tsc --noEmit 2>&1 | grep -v "^.next/types"; echo done`

### Task 2: Contrast tokens (computed, AA-targeted)

**Files:** `app/globals.css`, `components/ui/button.tsx`, `components/ui/input.tsx`; helper `scripts/contrast-check.mjs` (create, dev-only).

- [ ] **Step 1: Write a contrast calculator** `scripts/contrast-check.mjs` — converts an `oklch(L C H)` string to sRGB → relative luminance → WCAG ratio vs a background, so token choices are verified, not guessed:

```js
// node scripts/contrast-check.mjs : prints ratios for the tokens we touch.
// oklch→linear sRGB (D65) per CSS Color 4, then WCAG relative luminance.
function oklchToRgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const lin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const relLum = (L, C, H) => {
  const [r, g, b] = oklchToRgb(L, C, H).map((x) => Math.max(0, Math.min(1, x)));
  // back to linear for luminance
  const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [r, g, b].map((v) => toLin(lin(v)));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const ratio = (fg, bg) => {
  const a = relLum(...fg) + 0.05, b = relLum(...bg) + 0.05;
  return (Math.max(a, b) / Math.min(a, b)).toFixed(2);
};
const cream = [0.965, 0.012, 78];
console.log("mocha 0.58 on cream:", ratio([0.58, 0.03, 58], cream));
console.log("mocha 0.50 on cream:", ratio([0.50, 0.03, 58], cream));
console.log("caramel-deep 0.52 on cream:", ratio([0.52, 0.115, 50], cream));
console.log("line 0.89 vs cream:", ratio([0.89, 0.018, 74], cream));
console.log("line 0.78 vs cream:", ratio([0.78, 0.02, 74], cream));
```

- [ ] **Step 2: Run it** — `node scripts/contrast-check.mjs`. Use the output to choose the minimal token edits that reach **4.5:1** (tertiary text) / **3:1** (control borders). Iterate L values until the ratios pass (adjust the printed candidates as needed).

- [ ] **Step 3: Apply the chosen values** in `app/globals.css` `:root`:
  - `--mocha`: darken to the L that printed ≥4.5:1 (≈`oklch(0.50 0.030 58)`).
  - Introduce a control-border token at ≥3:1 (e.g. `--control-border: oklch(0.74 0.02 74)`) and point shadcn input/button borders at it (or bump `--line` only if it stays acceptable for dividers). Keep decorative `--line` for card dividers.
  - Link/accent **text**: ensure components use `--caramel-deep` (not `--caramel`) where text-on-cream.
  - Focus ring: in `button.tsx`/`input.tsx` replace `ring-ring/50` with full-opacity ring, or rely on the new `:focus-visible` outline.
  Re-run the checker to confirm every touched pair passes. **Do not change dark-theme tokens** (already pass) — but re-run for dark `--mocha` to confirm no regression.

- [ ] **Step 4: Structural test** — extend `test/a11y-structure.test.ts`: assert `--mocha:` light value changed (e.g. `oklch(0.5`); assert a control-border token exists. Run; tsc; build; **commit Cut 1**:

```bash
git add -A && git commit -m "feat(m5b): a11y foundations — focus-visible, reduced-motion, skip link, AA contrast tokens"
```

---

## Cut 2 — Names, roles & states (ARIA sweep)

### Task 3: Default-hide decorative SVGs + informative exceptions

**Files:** `components/ui.tsx` (`Icon`, `Avatar`, `BeanGlyph`), `components/detail.tsx` (`FlavorRadar`), `components/log-sheet.tsx` (`RemainingRing`), `components/cards.tsx` (`BeanBag`).

- [ ] **Step 1: Failing test** — add to `a11y-structure.test.ts`: `expect(read("components/ui.tsx")).toMatch(/aria-hidden/)` near the Icon `<svg>`; assert `detail.tsx` `FlavorRadar` has `role="img"`.
- [ ] **Step 2:** In `Icon` (`ui.tsx`), add `aria-hidden="true" focusable="false"` to the rendered `<svg>` so all decorative icons stop polluting the AT tree. Same for `Avatar` root (`ui.tsx:11-30`), `BeanGlyph`, `BeanBag`, `RemainingRing`. For **`FlavorRadar`** (`detail.tsx:353`) add `role="img"` + a summarizing `aria-label` (e.g. derive top notes) — informative, not hidden.
- [ ] **Step 3:** Run test → pass; tsc.

### Task 4: Accessible names, states, landmarks (the sweep)

**Files:** `components/app-provider.tsx`, `components/screens.tsx`, `components/cards.tsx`, `components/bag-form.tsx`, `components/log-sheet.tsx`, `components/flavor-wheel.tsx`, `components/detail.tsx`, `app/(legal)/layout.tsx`.

Apply each (read the file, make the exact edit). **Names (`aria-label`):**
- `app-provider.tsx:347` Add-bag button; `:354` nav-user (optional).
- `flavor-wheel.tsx:52` flavor remove → `aria-label={`Remove ${n}`}`; `bag-form.tsx:197` variety remove → `Remove ${v}`.
- `bag-form.tsx:133-144` color swatches → `role="radiogroup" aria-label="Bag color"` on the group; each swatch `role="radio" aria-checked={f.color===c} aria-label`.
- `screens.tsx:369-384` journal view-toggle → each `aria-label` ("Timeline view"/"Grid view"); `screens.tsx:280` + `log-sheet.tsx:222` "Add a bag" dashed buttons → `aria-label="Add a bag to your shelf"`.
- big card buttons (`cards.tsx` bean strip + `BeanCard`/`TrendingCard`/`RoasterCard`, `detail.tsx` roaster button) → concise `aria-label`.

**States:**
- `aria-pressed` on: process filter (`screens.tsx:659`, wrap in `role="group" aria-label="Filter by process"`), brew-method (`log-sheet.tsx:254`), roast ChipRow (`bag-form.tsx:311`), bag selector (`log-sheet.tsx:186`), like/save (`cards.tsx:139-175`), journal view-toggle.
- `aria-current={active?"page":undefined}` on desktop nav (`app-provider.tsx:336`) + BottomItem (`:465`, thread `active`).
- `aria-expanded={open} aria-haspopup="menu"` on BrewMenu trigger (`cards.tsx:210`).
- flavor accordion: swatch `aria-hidden`; count badge sr-only " selected".
- flavor-wheel note buttons: `aria-pressed={on}`; guard onClick when `!on && atMax` (`flavor-wheel.tsx:120`).

**Landmarks:**
- `app-provider.tsx:319` `<aside className="sidebar">` → `<div className="sidebar">`.
- desktop `<nav>` (`:334`) `aria-label="Primary"`; bottom `<nav>` (`:412`) `aria-label="Primary (mobile)"`.
- move `<header className="mobile-top">` (`:385`) out of `<main>` to be its **sibling preceding** `<main>` inside `#app-root` (keep identical markup/classes — reparent only).
- `app/(legal)/layout.tsx:21` footer links → `<nav aria-label="Legal"><ul>…<li>…</li></ul></nav>` (© stays outside the list).
- `detail.tsx:137` bean→roaster: render `<span>` when no `roaster?.id` instead of an inert `<button>`.

- [ ] **Step (per file): edit, then `npx tsc --noEmit` + `npx vitest run` after the batch.** Add targeted structural asserts for a few anchors (Add-bag `aria-label`, nav `aria-current`, process-filter `aria-pressed`). Then build; **commit Cut 2**:

```bash
git add -A && git commit -m "feat(m5b): a11y ARIA sweep — names, states, landmarks; decorative icons hidden"
```

---

## Cut 3 — Structure & forms

### Task 5: Heading order + list semantics
- [ ] `detail.tsx:279` "SCA tasting notes" `<h3>`→`<h2>` (keep visual size via class/style).
- [ ] Add `role="list"` to the collection containers and `role="listitem"` to their mapped children: feed (`screens.tsx:141`), discover grid (`:677`), roaster grid (`detail.tsx:489`), reviews (`detail.tsx:314`), trending (`:651`), journal grids, palate chips (`:569`). (No `<ul>` swap → layout unchanged.)
- [ ] Run tsc + suite.

### Task 6: Per-route titles (server wrappers)

- [ ] **Settings** — `app/(app)/settings/page.tsx` is already a server component: add `export const metadata = { title: "Settings — Cortado", robots: { index: false, follow: false } };`.
- [ ] **Journal / Profile / Feed** — these `page.tsx` are client components. For each, rename the client body to `*-client.tsx` (or it already has a child component) and make `page.tsx` a thin **server** component that `export const metadata = {...}` and renders the client child — mirroring `settings/page.tsx`. Titles: "My Journal — Cortado", "Your Profile — Cortado", "Your feed — Cortado". Mark journal/profile `robots:{index:false}`.
- [ ] **Test** — add to a `test/seo-titles.test.ts` (or extend `a11y-structure`): each of `journal/page.tsx`, `profile/page.tsx`, `settings/page.tsx`, `(app)/page.tsx` source contains `export const metadata` with a `title:`.
- [ ] Build (proves each route still renders); tsc.

### Task 7: Forms
- [ ] `autocomplete` on `login/page.tsx` (email→`email`, password→`current-password`) and `signup-form.tsx` (email→`email`, password→`new-password`, name→`name`).
- [ ] `login/page.tsx` error block → `role="alert"`.
- [ ] In-sheet fields (`bag-form.tsx`, `log-sheet.tsx`): on validation error set `aria-invalid` on the field + link the error text via `aria-describedby`; mark required fields (`required` / `aria-required`).
- [ ] Error toast path: use `toast.error(...)` with assertive semantics (or a `role=alert` region) for failures rather than the polite auto-dismiss. (Check `components/ui/sonner.tsx`.)
- [ ] Run suite + tsc + build; **commit Cut 3**:

```bash
git add -A && git commit -m "feat(m5b): a11y structure & forms — heading order, list roles, route titles, form labelling"
```

---

## Cut 4 — eslint-plugin-jsx-a11y guard + live verify

### Task 8: jsx-a11y in the flat ESLint config
- [ ] `npm i -D eslint-plugin-jsx-a11y`.
- [ ] Read `eslint.config.*` (flat config). Add the plugin + its **recommended** flat ruleset to the React/TSX block.
- [ ] `npm run lint` — fix every issue it surfaces (these are real a11y gaps the audit may have missed). Downgrade any genuinely-noisy/false-positive rule to `warn`/`off` with an inline comment explaining why. Iterate to **green**.
- [ ] Commit:

```bash
git add -A && git commit -m "feat(m5b): add eslint-plugin-jsx-a11y guard + fix flagged issues"
```

### Task 9: Controller-driven live verification + PR
- [ ] **Green gate:** `npm run test` (coffee-pg up) · `npm run build` · `npm run lint` (now jsx-a11y) · `npm run typecheck` · drift. All green.
- [ ] **Keyboard:** Tab from page load → the **skip link** appears first and jumps to main; **visible focus** on every control (nav, FAB, pills, cards, icon buttons, links, legal links, error-page button); logical order; no trap; Escape closes the sheet and restores focus.
- [ ] **Reduced motion:** emulate `prefers-reduced-motion: reduce` (devtools) → animations/transitions stop (feed fade-up, like-pop, sheet slide).
- [ ] **Screen reader (spot):** active nav announces "current page"; toggles announce pressed/not-pressed; the rating + flavor widgets announce role/state; the log sheet announces its name + traps/restores focus; decorative icons are silent; FlavorRadar announces a summary.
- [ ] **Contrast:** devtools spot-check `--mocha` text, links, input borders, focus ring in **both** themes → AA.
- [ ] **Titles:** tab bar shows distinct titles on feed/journal/profile/settings/discover/bean/roaster.
- [ ] Proceed to finishing-a-development-branch (PR) → post the `/code-review` summary comment.

---

## Self-review notes
- **Spec coverage:** Cut 1 ↔ foundations (focus/motion/contrast/skip); Cut 2 ↔ ARIA sweep + Icon default + landmarks; Cut 3 ↔ headings/lists/titles/forms; Cut 4 ↔ jsx-a11y guard + live. Risk table: contrast→Task 2 computed check; Icon-hide→Task 3 FlavorRadar exception + jsx-a11y; header reparent→Task 4 reparent-only + live mobile check; server wrappers→Task 6 mirror settings + build; jsx-a11y flood→Task 8 iterate/downgrade-with-reason.
- **Decisions honored:** nav stays `<button>`+`aria-current` (no Link); collections use `role=list` (no `<ul>`); jsx-a11y (no axe runtime).
- **No placeholders.** Mechanical aria-* edits are an explicit file:line checklist (Task 4) grounded in the audit; jsx-a11y + live SR pass catch any miss.
