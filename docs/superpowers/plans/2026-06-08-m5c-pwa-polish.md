# M5·C — PWA & Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Ship an installable PWA (manifest + code-generated icon set + pre-paint theme-color) and screen-faithful skeleton loaders. Spec: `docs/superpowers/specs/2026-06-08-m5c-pwa-polish-design.md`.

**Verification:** structural `readFileSync` tests + `next build` (no-DB) prerender check + jsx-a11y lint (still gating) + a controller-driven live PWA/skeleton pass. Green at each commit.

**Cuts:** (1) theme-colors + manifest + CSP → (2) icons (generator + apple-icon + Dockerfile) → (3) skeletons + standalone polish → (4) live verify + PR.

---

## Cut 1 — Theme colors + manifest + CSP

### Task 1: `lib/theme-colors.ts` + static viewport theme-color

**Files:** Create `lib/theme-colors.ts`; modify `app/layout.tsx`, `components/app-provider.tsx`; Test `test/pwa.test.ts` (create).

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEME_LIGHT, THEME_DARK } from "@/lib/theme-colors";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("PWA theme colors", () => {
  it("exports the true cream sRGB values", () => {
    expect(THEME_LIGHT).toBe("#f8f3eb");
    expect(THEME_DARK).toBe("#18130e");
  });
  it("root viewport sets a static themeColor from the shared constant", () => {
    const src = read("app/layout.tsx");
    expect(src).toMatch(/themeColor/);
    expect(src).toMatch(/THEME_LIGHT/);
  });
  it("app-provider uses the shared theme constants (no drifting hex)", () => {
    const src = read("components/app-provider.tsx");
    expect(src).toMatch(/THEME_(LIGHT|DARK)/);
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Create `lib/theme-colors.ts`**

```ts
/** Browser-chrome tint = the --cream token converted to sRGB (globals.css
 *  light oklch(0.965 0.012 78) → #f8f3eb, dark oklch(0.19 0.012 64) → #18130e).
 *  One source of truth for viewport.themeColor, the manifest, and the in-app sync. */
export const THEME_LIGHT = "#f8f3eb";
export const THEME_DARK = "#18130e";
```

- [ ] **Step 4: Root `viewport.themeColor`** in `app/layout.tsx` — import the constant and add a single static value (next-themes defaults to light, so a single value is correct and avoids the media-array/querySelector race):

```ts
import { THEME_LIGHT } from "@/lib/theme-colors";
// in the viewport export, replace the theme-color comment with:
  themeColor: THEME_LIGHT,
```

- [ ] **Step 5: `app-provider.tsx`** — replace the inline hex in the theme-color `useEffect` with the constants: `meta.setAttribute("content", isDark ? THEME_DARK : THEME_LIGHT)` and `import { THEME_LIGHT, THEME_DARK } from "@/lib/theme-colors"`. (Keep the effect; it's the post-hydration source of truth.)

- [ ] **Step 6: Run → pass; tsc.**

### Task 2: `app/manifest.ts`

**Files:** Create `app/manifest.ts`; extend `test/pwa.test.ts`.

- [ ] **Step 1: Failing test** (add to `test/pwa.test.ts`):

```ts
import manifest from "@/app/manifest";
describe("web app manifest", () => {
  const m = manifest();
  it("is a standalone installable PWA rooted at /", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.name).toMatch(/Cortado/);
  });
  it("references stable /icons PNGs incl. a maskable", () => {
    const srcs = (m.icons ?? []).map((i) => i.src);
    expect(srcs).toContain("/icons/icon-192.png");
    expect(srcs).toContain("/icons/icon-512.png");
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Create `app/manifest.ts`**

```ts
import type { MetadataRoute } from "next";
import { THEME_LIGHT } from "@/lib/theme-colors";

// Pure static object (no DB/headers) → prerenders at build; no `dynamic` export
// needed. Icons reference stable public/icons PNGs (Next hash-fingerprints
// next/og metadata-route URLs, so the manifest cannot pin those).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cortado — Coffee Journal",
    short_name: "Cortado",
    description: "Log your bags and brews, taste with the SCA flavor wheel, and discover single-origins.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME_LIGHT,
    theme_color: THEME_LIGHT,
    categories: ["food", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 4: Run → pass.**

### Task 3: CSP `manifest-src` + middleware matcher exclusions

**Files:** `lib/security-headers.ts`, `middleware.ts`.

- [ ] **Step 1:** In `buildCsp` (`lib/security-headers.ts`) add `` `manifest-src 'self'` `` to the directives array (near `connect-src`).
- [ ] **Step 2:** In `middleware.ts` matcher `source`, extend the negative-lookahead to also exclude `manifest.webmanifest|apple-icon|opengraph-image|twitter-image` (alongside `icon.svg|robots.txt|sitemap.xml`). Optimization only (CSP on JSON/PNG is inert).
- [ ] **Step 3:** `npx tsc --noEmit`; `npm run lint`; `npm run build > /tmp/c1.log 2>&1` — confirm `/manifest.webmanifest` appears in the route table; no errors. **Commit Cut 1:**

```bash
git add -A && git commit -m "feat(m5c): pre-paint theme-color + web manifest + manifest-src CSP"
```

---

## Cut 2 — Icons (generator + apple-icon + Dockerfile)

### Task 4: Icon generator → `public/icons/*.png`

**Files:** Create `scripts/gen-icons.mjs`; generate + commit `public/icons/{icon-192,icon-512,maskable-512}.png`.

- [ ] **Step 1: Write `scripts/gen-icons.mjs`** — uses `next/og` `ImageResponse` via `React.createElement` (no JSX), text-free, hex literals from `app/icon.svg`, writes PNGs. The bean is an inline `<svg>` (rounded-rect `#3a2a1e` bg + `#c08a45` ellipse + white crease), sized to ~70% of the canvas for `icon-*`, ~58% for the maskable safe-zone:

```js
import { ImageResponse } from "next/og";
import { createElement as h } from "react";
import { mkdirSync, writeFileSync } from "node:fs";

// Draw the brand bean (matches app/icon.svg) at a given canvas size; `inset`
// shrinks the bean for the maskable safe-zone. Hex literals only — satori
// cannot resolve var(--*) or render <text>.
function bean(size, inset) {
  const d = Math.round(size * (1 - inset)); // bean svg box
  return h(
    "div",
    { style: { width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#3a2a1e" } },
    h(
      "svg",
      { width: d, height: d, viewBox: "0 0 32 32" },
      h("g", { transform: "translate(16 16)" },
        h("ellipse", { cx: 0, cy: 0, rx: 7, ry: 10, transform: "rotate(35)", fill: "#c08a45" }),
        h("path", { d: "M -5 -6 Q 0 0 5 6", stroke: "rgba(255,255,255,0.6)", strokeWidth: 1.6, fill: "none", strokeLinecap: "round", transform: "rotate(35)" }),
      ),
    ),
  );
}
async function png(node, size) {
  const res = new ImageResponse(node, { width: size, height: size });
  return Buffer.from(await res.arrayBuffer());
}
mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", await png(bean(192, 0.18), 192));
writeFileSync("public/icons/icon-512.png", await png(bean(512, 0.18), 512));
writeFileSync("public/icons/maskable-512.png", await png(bean(512, 0.34), 512)); // bigger inset → central ~60% safe zone
console.log("icons written to public/icons/");
```

- [ ] **Step 2: Run it** — `node scripts/gen-icons.mjs`. If `next/og`'s `ImageResponse` will not import in a standalone node script (server-only guard), fall back to importing from `@vercel/og` directly (`import { ImageResponse } from "@vercel/og"` — the bundled package next re-exports), or render `app/icon.svg` with the resvg shipped in `node_modules/next/dist/compiled/@vercel/og`. Verify the three PNGs exist and are non-trivial: `ls -l public/icons/ && file public/icons/*.png`.

- [ ] **Step 3: Structural test** (add to `test/pwa.test.ts`):

```ts
import { existsSync, statSync } from "node:fs";
describe("generated icons", () => {
  for (const f of ["public/icons/icon-192.png", "public/icons/icon-512.png", "public/icons/maskable-512.png"]) {
    it(`${f} exists and is non-empty`, () => {
      const p = join(process.cwd(), f);
      expect(existsSync(p)).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(500);
    });
  }
});
```

### Task 5: `app/apple-icon.tsx`

**Files:** Create `app/apple-icon.tsx`; extend `test/pwa.test.ts`.

- [ ] **Step 1: Failing test**

```ts
describe("apple-icon", () => {
  const src = read("app/apple-icon.tsx");
  it("is force-static and DB-free", () => {
    expect(src).toMatch(/export const dynamic = "force-static"/);
    expect(src).not.toMatch(/@\/lib\/(db|queries)/);
  });
});
```

- [ ] **Step 2: Create `app/apple-icon.tsx`** (next/og, 180×180, hex bean, force-static — mirrors `app/opengraph-image.tsx`):

```tsx
import { ImageResponse } from "next/og";

export const dynamic = "force-static"; // no DB → prerenders at build (root force-dynamic does not cascade to metadata routes)
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#3a2a1e" }}>
        <svg width={132} height={132} viewBox="0 0 32 32">
          <g transform="translate(16 16)">
            <ellipse cx={0} cy={0} rx={7} ry={10} transform="rotate(35)" fill="#c08a45" />
            <path d="M -5 -6 Q 0 0 5 6" stroke="rgba(255,255,255,0.6)" strokeWidth={1.6} fill="none" strokeLinecap="round" transform="rotate(35)" />
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 3: Run → pass.**

### Task 6: Dockerfile `COPY public/`

**Files:** `Dockerfile`.

- [ ] **Step 1:** Add `COPY --from=build /app/public ./public` to the runner stage (after the `.next` copy) so `public/icons/*.png` exist at runtime. Add a structural test: `expect(read("Dockerfile")).toMatch(/COPY --from=build \/app\/public/)`.

- [ ] **Step 2: Build (no-DB prerender check)** — `rm -rf .next && npm run build 2>&1 | tee /tmp/c2.log | grep -E "manifest|icon|apple|error|Error"` — confirm `/manifest.webmanifest`, `/icon.svg`, `/apple-icon` appear, all static, no DB error. tsc; lint. **Commit Cut 2:**

```bash
git add -A && git commit -m "feat(m5c): code-generated PWA icon set (public/icons + apple-icon) + Dockerfile public copy"
```

---

## Cut 3 — Skeletons + standalone polish

### Task 7: Skeleton primitive + shimmer

**Files:** Create `components/skeleton.tsx`; add a `.shimmer`/`@keyframes` to `globals.css`.

- [ ] **Step 1:** Add to `globals.css` a `@keyframes shimmer` + a `.skeleton` class (a `--surface-2` block with a moving highlight). CSS animation → the existing `@media (prefers-reduced-motion: reduce)` already neutralizes it.
- [ ] **Step 2:** Create `components/skeleton.tsx` exporting a `Skeleton({ w, h, r })` block (a `<div className="skeleton">` with width/height/border-radius) used by all fallbacks.

### Task 8: App-shell skeleton + 3 leaf skeletons

**Files:** rewrite `app/(app)/loading.tsx`; create `app/(app)/discover/loading.tsx`, `bean/[id]/loading.tsx`, `roaster/[id]/loading.tsx`; Test `test/pwa.test.ts`.

- [ ] **Step 1: Failing test**

```ts
describe("skeletons", () => {
  for (const f of ["app/(app)/loading.tsx", "app/(app)/discover/loading.tsx", "app/(app)/bean/[id]/loading.tsx", "app/(app)/roaster/[id]/loading.tsx"]) {
    it(`${f} exists and uses the Skeleton primitive`, () => {
      const src = read(f);
      expect(src).toMatch(/Skeleton|skeleton/);
    });
  }
});
```

- [ ] **Step 2:** Rewrite `app/(app)/loading.tsx` as an **app-shell skeleton** (a content-area placeholder: a heading block + a column of card skeletons) using `Skeleton`. Keep `role="status" aria-label="Loading"`.
- [ ] **Step 3:** Create the three leaf `loading.tsx`, each mirroring its screen and **sized ≈ a screen-height of skeleton cards** (so back/forward scroll restore isn't clamped): discover = a grid of ~6 bean-card skeletons; bean = a hero block + a few review skeletons; roaster = a header + a grid of bean skeletons. Each file's header comment: "fires because page.tsx awaits the DB". `role="status"`.
- [ ] **Step 4: Run → pass; tsc; lint.**

### Task 9: Standalone polish

**Files:** `globals.css`, `components/app-provider.tsx`.

- [ ] **Step 1:** In `globals.css` `.mobile-top` rule add `padding-top: env(safe-area-inset-top);` (notch clearance in standalone).
- [ ] **Step 2:** In `app-provider.tsx` `mobile-top` header, add a **Sign in** affordance shown when `currentUserId` is null (mirror the desktop sidebar's sign-in button → `router.push("/login")`), so a guest installed-app launch has an entry. Place it in the right-side control cluster.
- [ ] **Step 3: tsc; lint; full suite; build. Commit Cut 3:**

```bash
git add -A && git commit -m "feat(m5c): app-shell + per-screen skeleton loaders; standalone safe-area + guest sign-in CTA"
```

---

## Cut 4 — Live verification + PR

### Task 10: Controller-driven live verification + PR

- [ ] **Step 1: Green gate** — `npm run test` (coffee-pg up) · `npm run build` · `npm run lint` · `npm run typecheck` · drift. All green.
- [ ] **Step 2: Manifest/install** — start prod server (AUTH_URL set); devtools → Application → Manifest: valid, no errors, `installable`; icons render incl. the **maskable preview**; `curl /manifest.webmanifest` shows the icons; `curl /` `<head>` has `<link rel="manifest">` + a `theme-color` meta (pre-JS). Lighthouse PWA installability passes.
- [ ] **Step 3: Icons** — `curl -I /icons/icon-192.png` `/icons/maskable-512.png` `/apple-icon` → 200 image/png; eyeball the bean renders (not blank — proves hex, not `var()`).
- [ ] **Step 4: theme-color** — chrome tint correct in light and dark (toggle in-app); no flash beyond the documented one-frame.
- [ ] **Step 5: Skeletons** — throttle the network; navigate to /discover, a bean, a roaster → the screen-faithful skeleton shows; the app-shell skeleton shows on a hard refresh; **scroll a screen down, navigate away and Back → scroll position is preserved** (the skeleton-height guard).
- [ ] **Step 6: Guest CTA + safe-area** — logged out, the mobile header shows Sign in; 0 CSP console violations.
- [ ] **Step 7:** finishing-a-development-branch (PR) → post the `/code-review` summary comment.

---

## Self-review notes
- **Spec coverage:** theme-colors+viewport (Task 1) ↔ A/B; manifest (2) ↔ C; CSP/middleware (3) ↔ D; generator+icons (4), apple-icon (5), Dockerfile (6) ↔ B; skeletons (7,8) + polish (9) ↔ E/F; live (10) ↔ Testing. Risk table: hashed URLs→public/icons (Task 4); satori var/text→hex+text-free (4,5); theme-color race→single static value + shared consts (1); scroll-restore→sized skeletons (8 + live Step 5); cold-open→app-shell skeleton (8); container icons→Dockerfile (6).
- **Generator risk:** Task 4 Step 2 names the fallback if `next/og` won't import standalone — resolve at execution, do not block.
- **No placeholders.** Offline/service-worker explicitly out of scope (spec G).
