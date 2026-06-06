# M3·A — CI/CD & Quality Gates — Design

**Date:** 2026-06-06
**Status:** Implemented (2026-06-06). 3 commits on `feat/m3-ci`; PR #6 CI run PASSED (npm ci -> typecheck -> 83 tests -> eslint -> build, 1m2s). npm audit = 0 vulnerabilities; next bump browser-smoke confirmed reconciliation intact. Branch protection = manual UI step (token lacks admin).
**Branch:** `feat/m3-ci` (off `main`, M2 merged @ `98f9065`)
**Council review:** ratified by a focused two-member council (ops/feasibility — Sonnet; contrarian/red-team — Opus), scaled to this config sub-project's lower novelty. The council made three material amendments (see "What the council changed").

## Summary

First of M3's four sub-projects (CI · Ops hardening · Migrations · Pagination). Cortado has **no CI, no ESLint at all** (`next lint` is a phantom — ESLint isn't installed, and Next 15 deprecated the command), no Node pin, and an open **critical Next.js RCE** (the "22" Dependabot alerts reduce to ~21 Next advisories + 1 postcss, all cleared by bumping `next` 15.5.4 → 15.5.19). 83 tests and `tsc` are green but **gate nothing** — they're never run on a PR.

This sub-project stands up an enforced quality gate: a GitHub Actions workflow (`tsc` + `vitest` + `eslint` + `build`), a real flat-config ESLint setup, the security bump, Dependabot automation, and a Node pin — landed as **three clean commits** so the load-bearing security bump is isolated and bisectable.

## Goals

- Every PR to `main` runs `tsc --noEmit` + `vitest run` + `eslint .` + `next build` and must pass.
- ESLint actually exists and lints the **app code only** (not the huge vendored trees).
- The critical Next.js RCE is closed; future dependency updates are automated.
- Node version is pinned and consistent (CI + local).
- **No regression** to the M1/M2 `useOptimistic`+`revalidatePath` reconciliation (verified after the `next` bump).

## Non-goals (deferred)

- **CD / auto-deploy** → the M3 Ops sub-project (needs the deploy-target decision).
- **Branch protection automation** → the active `gh` token lacks the `administration` scope, so this is a **documented one-time GitHub-UI step**, not an automated one.
- **Coverage reporting / e2e (Playwright) in CI** → later (YAGNI now; keep the gate fast).
- **`tsc`/`vitest` matrix across Node versions** → pin one (20).

## Locked decisions (product owner + council)

1. **ESLint**: flat config + `eslint-config-next` + `typescript-eslint`, recommended ruleset, **fix error-level violations now** (the surface is tiny — see §C). The `lint` script becomes `eslint .`.
2. **Vulns**: full remediation = bump `next`/`eslint-config-next` → `15.5.19` (clears the critical RCE + postcss); add `.github/dependabot.yml`.
3. **CI**: GitHub Actions on PR + push to `main`; `tsc` + `vitest` + `eslint` + `build`; no DB service.
4. **Node pin** = 20 (README says "Node 20+").
5. Three isolated commits; the **`next` bump is its own commit** with a browser smoke.

## What the council changed (vs. the pre-council framing)

- **The vuln is a critical RCE, isolated for bisect.** `npm audit`'s "2 vulnerabilities" is the package count; the advisory set includes a **critical Next.js RCE**. The `next` 15.5.4→15.5.19 bump spans 15 patch releases carrying RSC/middleware/cache fixes that *could* alter request handling. **Adopted:** the bump is its own commit, verified with `tsc`+tests+build **and a browser smoke** of the optimistic-toggle / revalidate flows, so any regression is bisectable against M1/M2.
- **Branch protection can't be automated (token lacks admin).** Verified via `gh auth status` (scopes: `repo`, `read:org`, `admin:public_key` — no administration). **Adopted:** document the exact GitHub-UI steps; do not ship a `gh api` step that 403s.
- **`react-hooks/exhaustive-deps` stays `warn`, not `error`.** The app-provider scroll/popstate/theme effects (`components/app-provider.tsx` ~`:109-158`) and the comment-thread fetch (`components/comment-thread.tsx:18`) are *intentionally* `[]`/`[pathname]`/`[tastingId]` with explanatory comments. Erroring this rule under a "fix-all" mandate is the single path by which the gate would *introduce* a scroll/theme regression. **Adopted:** exhaustive-deps stays at Next's default `warn`; add explicit `// eslint-disable-next-line react-hooks/exhaustive-deps` (alongside the existing comments) on the intentional effects; CI does **not** use `--max-warnings 0` (errors block, warnings inform).

## Architecture

### A. Security bump (commit 1)

`next` is exact-pinned (`"next": "15.5.4"`), so it won't auto-update. Run:
```
npm install next@15.5.19 eslint-config-next@15.5.19
```
This regenerates `package-lock.json` (must be committed, or `npm ci` fails on mismatch). `eslint-config-next` is added here so its version tracks `next`. Verify: `tsc --noEmit`, `vitest run` (83), `npm run build`, **and a browser smoke**: dev server up, sign in, log a brew + toggle a like/save (the `useOptimistic`+`revalidatePath` path), confirm in-place re-base still works (no 500, counts reconcile). This isolates any 15.5.19 behavior change.

### B. ESLint flat config (commit 2)

Install (devDeps): `eslint@^9`, `eslint-config-next@15.5.19` (already from commit 1), `typescript-eslint@^8`, `@eslint/eslintrc` (for `FlatCompat` — `eslint-config-next` still ships a legacy config; the bridge is the standard Next 15 migration path).

`eslint.config.mjs`:
```js
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default tseslint.config(
  // Global ignores MUST be a standalone object (flat config; .eslintignore is dead).
  { ignores: [
      ".agents/**", ".claude/**", ".playwright-mcp/**", ".next/**",
      "node_modules/**", "coverage/**", "docs/**", "next-env.d.ts",
      "*.config.js", "*.config.mjs",
  ] },
  ...compat.extends("next/core-web-vitals"),   // includes @next/next + react-hooks (exhaustive-deps = warn)
  ...tseslint.configs.recommended,             // recommended, NOT strictTypeChecked
);
```

- **`ignores` is the #1 footgun** — it must cover the vendored `.agents/` (197 files), `.claude/`, `.playwright-mcp/`, plus `.next`/`node_modules`/`docs`. In flat config, `.eslintignore` is silently ignored.
- Use `tseslint.configs.recommended` (not `strictTypeChecked`) — strict would surface noise in the shadcn `components/ui/*` primitives.
- **Fix the error-level violations** (council estimate, verified small): the two `<a href>`→`next/link` in `app/login/page.tsx` + `app/signup/signup-form.tsx` (`@next/next/no-html-link-for-pages`), and ~5 unused `catch (e)` bindings (`@typescript-eslint/no-unused-vars`) in `app/auth-actions.ts`, `components/bag-form.tsx`, `components/log-sheet.tsx`, `components/comment-thread.tsx`, `lib/db.ts` (drop the binding → `catch {}` or rename `_e`).
- Add `// eslint-disable-next-line react-hooks/exhaustive-deps` on the intentional effects so the warnings don't accrue.
- `package.json`: `"lint": "eslint ."`, add `"typecheck": "tsc --noEmit"`.

### C. CI workflow + hardening (commit 3)

`.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - name: Type-check
        run: npm run typecheck
      - name: Test
        run: npm test
      - name: Lint
        run: npm run lint            # errors block; warnings (exhaustive-deps) inform — no --max-warnings 0
      - name: Build
        run: npm run build
        env: { AUTH_SECRET: "ci-build-placeholder-not-a-secret" }
```
- **No Postgres service needed**: all 18 test files mock `@/lib/db`; `next build` is force-dynamic (no prerender), `pg.Pool` is lazy (no connect at build), and `auth.ts` reads no env at module scope. The dummy `AUTH_SECRET` only suppresses a next-auth-beta build-time warning (not a secret; not in GitHub Secrets).
- Step order = cheapest-fails-first (tsc → test → lint → build). Build kept in CI (catches webpack/RSC issues `tsc` misses; the Google-Fonts fetch in `app/layout.tsx` works on GitHub runners — noted risk, low).

`.github/dependabot.yml`:
```yaml
version: 2
updates:
  - { package-ecosystem: "npm", directory: "/", schedule: { interval: "weekly" }, open-pull-requests-limit: 5 }
  - { package-ecosystem: "github-actions", directory: "/", schedule: { interval: "weekly" } }
```

Hardening:
- `.nvmrc` → `20`; `package.json` `"engines": { "node": ">=20" }`.
- `tsconfig.json` `exclude`: add `".agents"`, `".claude"`, `"docs"` (forward guard so a future vendored `.ts` can't break `tsc`).

**Branch protection (manual, documented):** after CI lands and runs once, in GitHub → Settings → Branches → Add rule for `main`: require status check **`ci`** to pass before merge, require branches up to date. (The `gh` token lacks the `administration` scope to do this via API.)

## Testing / verification

- **Unit tests unchanged** (83); they validate the suite still passes after the `next` bump.
- **Self-validating CI**: the workflow's first run on the PR proves the gate works end-to-end (tsc/test/lint/build all green in the runner).
- **Local pre-flight** before pushing each commit: `npm run typecheck && npm test && npm run lint && npm run build`.
- **Browser smoke after the `next` bump** (commit 1): the reconciliation regression check above.
- No new unit tests are added (this is config/tooling, not app logic) — the existing suite + the workflow itself are the verification.

## Risks

- **`eslint-config-next`@9-flat-config via FlatCompat** — possible peer-dep friction (ESLint 9 + typescript-eslint v8 + TS 5.7.3 on the floor). Mitigation: install in commit 2 and resolve any peer warnings then (`--legacy-peer-deps` only if genuinely needed; prefer correct version alignment).
- **`next` 15.5.19 behavior change** — mitigated by the isolated commit + browser smoke.
- **Google-Fonts fetch at build** — works on standard GitHub runners; low risk.
- **Branch protection** depends on a manual step — flagged, not automated.

## Build sequence (for the plan)

1. **Commit 1 — security bump**: `npm install next@15.5.19 eslint-config-next@15.5.19`; `tsc`+tests+build; browser smoke; commit.
2. **Commit 2 — ESLint**: install eslint/typescript-eslint/@eslint/eslintrc; `eslint.config.mjs` with `ignores`; `lint`/`typecheck` scripts; fix error-level violations + add the exhaustive-deps disables; `eslint .` clean (0 errors); commit.
3. **Commit 3 — CI + hardening**: `ci.yml`, `dependabot.yml`, `.nvmrc`, `engines`, `tsconfig` excludes; local pre-flight green; commit.
4. **PR** → its first CI run is the end-to-end proof. Document the manual branch-protection step in the PR body.
