# M4·D — Legal / Compliance Pages — Design

**Date:** 2026-06-07
**Branch:** `feat/m4d-legal-compliance`
**Status:** Approved design (Architecture B), grounded by a 10-agent code audit (`m4d-legal-fact-audit`)

## Goal

Add a Privacy Policy, Terms of Service, and a Cookie Notice as **always-available, DB-independent** pages, and surface them where users consent — without coupling them to the app's data-loading shell. Content is a *tailored draft* whose every factual claim is grounded in the codebase, carrying a visible "Template — review with counsel" disclaimer.

## Why a restructure (the driving constraint)

Today **every** route renders under `app/layout.tsx`, which is `force-dynamic` and calls `getAppData()` (a Postgres read). A DB outage therefore 500s the entire site — including the legal pages people most need when something is wrong. The fix isolates the DB dependency to the actual app so legal pages survive an outage and carry no app chrome.

### Architecture B — thin shared root + nested `(app)` layout (chosen)

Keep **one minimal, DB-independent root layout**; move `getAppData()` + `AppProvider` *down* into a new `(app)/layout.tsx`. Legal pages get their own `(legal)` group with simple chrome.

Considered and rejected: **(A) full multiple-root-layouts** (delete `app/layout.tsx`, give each group its own `<html>`/`<body>`). It forces a `global-not-found.tsx` full-document file (the global 404 otherwise has no root layout to render into), duplicates `error.tsx`/`loading.tsx` per group, duplicates the nonce+theme plumbing, and turns every app↔legal navigation into a full page reload. Its only benefit — a *completely different document shell* for legal pages — is undesirable; we want the same fonts and theme, just without the data shell. **B delivers the same user-visible outcome with far less risk** and every existing special file keeps working unchanged.

## File map

> The route-group folders `(app)` and `(legal)` are **URL-invisible** — `/`, `/privacy`, `/terms`, `/cookies` all resolve normally, and app↔legal stays client-side navigation (shared root).

### Stays at `app/` root (DB-independent surface)
- `app/layout.tsx` — **rewritten minimal** (see below).
- `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx` — unchanged; keep working because the root layout still provides `<html>`/`<body>`.
- `app/globals.css`, `app/icon.svg` — unchanged.
- `app/api/**` (`health`, `csp-report`, `verify`, `auth/[...nextauth]`) — **must NOT move into a route group.** `/api/verify` redirects to `/?verified=1|0` (consumed by the home page) and `/api/csp-report` is the CSP `Reporting-Endpoints` target; both URLs must stay stable.
- `app/actions.ts`, `app/account-actions.ts`, `app/auth-actions.ts`, `app/verify-actions.ts` — `"use server"` modules imported via the `@/app/...` alias; not route files. Keep in place (moving them breaks those imports).

### Moves into `app/(app)/` (the data shell)
- `page.tsx` (the `/` feed)
- `discover/`, `journal/`, `profile/`, `settings/`, `login/`, `signup/`
- **`bean/[id]/`, `roaster/[id]/`** ← *audit-caught omission; these call `useShell()` and crash without `AppProvider`*
- `loading.tsx` (scoped here so the spinner covers `getAppData`, not legal pages)

**Invariant (load-bearing):** *any route whose component tree calls `useShell()` **or** `useData()` must live under `(app)`* (or otherwise have an `AppProvider` ancestor). `AppProvider` mounts **two** throwing contexts — `ShellContext` (`useShell`) and `DataProvider` (`useData`) — and both throw if their provider is absent. Verified consumers: `useShell` in `page`, `journal`, `discover-client`, `profile`, `bean-client`, `roaster-client`; `useData` in `components/{settings,screens,cards,detail,comment-thread,log-sheet}`. All are reachable only from the routes in the move list above, so the list is complete once `bean`/`roaster` are included.

### New files
- `app/(app)/layout.tsx` — `const initialData = await getAppData()` → `<AppProvider initialData={initialData}>{children}</AppProvider>`. The **only** place the DB dependency now lives.
- `app/(legal)/layout.tsx` — minimal chrome: a Cortado wordmark linking `/`, the article container, and a footer cross-linking the three legal pages + copyright. **No `AppProvider`, no `getAppData`.**
- `app/(legal)/privacy/page.tsx`, `app/(legal)/terms/page.tsx`, `app/(legal)/cookies/page.tsx` — server components, **no DB import**.

### The rewritten root `app/layout.tsx`
Keeps: `<html>`/`<body>`, `next/font` instances + `globals.css`, `ThemeProvider` (with the per-request nonce from `headers()`), `Toaster`, `metadata`, `viewport`, and **`export const dynamic = "force-dynamic"`**. Removes: the `getAppData()` call and `AppProvider`. Still reads `headers()` for the nonce, so it stays dynamic (required by the strict CSP) but **never touches Postgres**.

## Cross-cutting correctness (CSP / nonce / rendering)

- **`force-dynamic` stays in the minimal root layout.** It cascades to both nested groups; `middleware.ts:4-7` warns that the strict nonce CSP blanks any statically-rendered route. Do **not** drop it or rely on per-page declarations.
- **The CSP/nonce is produced by `middleware.ts`** for every matched path, independent of which layout renders. The matcher excludes only static assets, so `/privacy`, `/terms`, `/cookies` are covered with **no matcher change**. The root layout's job is only to forward the nonce to `ThemeProvider` so next-themes' pre-paint inline script is allowed on legal pages too.
- **`not-found.tsx` stays at root** and renders inside the minimal root layout (no app chrome). It uses only Tailwind + `next/link` (no `useShell`/`useData`), so this is safe and acceptable for a 404. An in-shell `app/(app)/not-found.tsx` is an optional future nicety, not in scope.
- **`error.tsx` stays at root.** A `getAppData()` failure thrown in `(app)/layout.tsx` bubbles to the *root* `error.tsx` (rendered inside the DB-independent root layout) — exactly the graceful degradation we want. `global-error.tsx` still catches a root-layout crash.
- **`getAppData()` will run on `/login` and `/signup`** (now under `(app)`). This is **pre-existing behavior** (they already render under the `getAppData` root layout today) — no regression. A future `(auth)` group to skip the read for anonymous visitors is deferred.

## Legal-layout authoring constraints (from `globals.css`)
- `globals.css` applies a universal reset `* { margin:0; padding:0; box-sizing:border-box }` and `html, body { height:100% }`. The `(legal)` layout/pages must therefore: (a) use **natural document flow** (no `height:100%` + `overflow:hidden` wrapper) so the window scrolls and content isn't clipped — `overflow:hidden` lives only on `#app-root` inside `AppProvider`, which legal pages don't render; and (b) **supply their own typographic spacing** (max-width container, paragraph/heading margins) since no user-agent margins survive the reset.
- Legal pages honor the persisted theme (root `ThemeProvider`) but do not render the in-app theme toggle (it lives in `AppProvider`). A static `theme-color` meta in the legal layout is an optional cosmetic touch.

## Content specification

Every page renders, at the top: a visible disclaimer box — **"⚠️ Template — review with qualified counsel before relying on this."** — and **"Last updated: 7 June 2026."** Owner-supplied values appear inline as clearly-marked `[PLACEHOLDER: …]` tokens (listed in *Owner inputs* below). All factual statements below are verified against the code by the audit; citations are in the audit artifact.

### Privacy Policy (`/privacy`)

**1. Who we are / controller** — `[PLACEHOLDER: controller legal name]`, contact `[PLACEHOLDER: contact email]`.

**2. What we collect.**
- *Account data* (stored in Postgres `users`): email address (stored in plaintext at rest in the DB); password — credential signups only — stored **only** as a bcrypt hash (`bcryptjs`, cost 12), never in plaintext; display name; public handle (username; auto-generated or user-chosen); avatar tint (a colour, not an image); bio (public); OAuth avatar URL (stored but **never displayed**); email-verified timestamp; an internal session-revocation counter; account-creation time.
- *OAuth identities* (`accounts`): the provider name and your account ID at that provider. We do **not** store OAuth access or refresh tokens.
- *Your content*: coffee bags, brews/tastings (ratings, brew parameters, free-text notes), comments, likes, follows (people and roasters), saved tastings, and wishlist items.
- *Technical data*: your IP address and email address are processed for login/sign-up rate-limiting and held transiently (target ~15 minutes); an authentication session cookie (see Cookie Notice); email-verification tokens (stored as a keyed HMAC hash alongside your email, target 24-hour lifetime).

**3. What is public vs private.** Public to any visitor: display name, handle, avatar, bio, your reviews/comments, and follower/following/review counts. Private (visible only to you): your email, password, and your bag-inventory fields (bag weight, purchase date, amount remaining, owned/where-bought).

**4. Why we process it / legal bases** *(behind the disclaimer; GDPR framing)*: to provide the service (contract), to authenticate you and keep the service secure incl. rate-limiting (legitimate interest), and to send transactional verification email (contract). `[PLACEHOLDER: confirm legal bases / consent model with counsel]`.

**5. Who we share it with (processors).** Real recipients only:
- **Google** and **GitHub** — *if* you choose OAuth sign-in: they receive the sign-in request and return your profile (name, email, verified flag, avatar URL). For GitHub we additionally call `api.github.com/user/emails` to confirm your primary email is verified.
- **Resend** — transactional email provider; receives your email address, subject, and the message body (e.g. a verification link) to deliver verification email. Used only when email sending is configured.
- **Hosting & database provider** — `[PLACEHOLDER: hosting provider + region]`; **database** `[PLACEHOLDER: Postgres host — self-hosted (Coolify-internal) or external managed provider + region]`.
- We do **not** use analytics, advertising, tracking, or session-replay services, and we self-host our web fonts (no Google Fonts CDN request) and never load an external avatar/image CDN. (State affirmatively.)

**6. Retention.** Account and content data are kept until you delete your account. Verification tokens target a 24-hour lifetime; rate-limit records target ~15 minutes. *Honest caveat:* these short-lived records are pruned on a **best-effort** basis (not a guaranteed deadline), so state them as target windows after which data becomes eligible for deletion. Server logs are retained per `[PLACEHOLDER: log retention period]`.

**7. Your rights & deletion.** You can delete your account at any time from **Settings**; this hard-deletes your account and cascades to your OAuth links, bags (and the tastings/likes/saves/comments on them), and your own tastings, likes, comments, follows, saves, wishlist, and verification tokens. *Honest caveats (do NOT promise total erasure):* (a) rate-limit records containing your email/IP are not linked to your account and persist until their short prune window; (b) application/error logs may contain your email or IP and are not purged by deletion (host-managed retention); (c) deleting your account also removes other users' likes/saves/comments on the content you had shared. Data export/access requests are fulfilled via `[PLACEHOLDER: how DSAR/export requests are handled]` (no self-service export feature today).

**8. Security.** Passwords are bcrypt-hashed; sessions are signed/encrypted; strict CSP, HSTS, and other security headers are enforced. Transport encryption to the database is `[PLACEHOLDER: confirm TLS posture for external DB]`.

**9. Children.** Not directed to children under `[PLACEHOLDER: 13 / 16]`.

**10. International transfers** `[PLACEHOLDER]`. **11. Changes to this policy.** **12. Contact** `[PLACEHOLDER: contact email]`.

### Terms of Service (`/terms`)
Acceptance & eligibility (minimum age `[PLACEHOLDER]`); account responsibilities (accurate info, safeguard credentials); acceptable use (no illegal/infringing content in reviews or photos, no scraping/automated abuse, no disruption); user content & licence (you retain ownership; you grant Cortado a non-exclusive licence to host and display your content within the service; you are responsible for what you post); service provided "as is", availability may change; termination (we may suspend/remove for violations; you may delete your account at any time from Settings); disclaimers & limitation of liability `[PLACEHOLDER: confirm with counsel]`; governing law/jurisdiction `[PLACEHOLDER]`; changes to terms; contact `[PLACEHOLDER]`.

### Cookie Notice (`/cookies`)
**Notice only — no consent banner**, because the app sets only strictly-necessary cookies plus one functional browser-storage preference. All cookies are first-party, host-only, `HttpOnly`, `SameSite=Lax`, and `Secure` in production; names carry `__Secure-`/`__Host-` prefixes in production (HTTPS) and are unprefixed in local development.

- **Session token** — `__Secure-authjs.session-token` (dev: `authjs.session-token`). Holds your signed/encrypted login session (contains your user id, a session-version, and your name/email/avatar). Persistent with a **sliding ~30-minute expiry** (refreshed on each request); may be split across numbered cookies (`.0`, `.1`, …) for larger OAuth sessions. Strictly necessary.
- **CSRF token** — `__Host-authjs.csrf-token` (dev: `authjs.csrf-token`). Protects auth endpoints. Browser-session cookie. Strictly necessary.
- **Callback URL** — `__Secure-authjs.callback-url` (dev: `authjs.callback-url`). Remembers where to send you after sign-in. Browser-session cookie. Functional for sign-in.
- **Transient OAuth cookies** — set **only during an active Google/GitHub sign-in**: `authjs.pkce.code_verifier` (~15 min), `authjs.state` (~15 min), `authjs.nonce` (session). Strictly necessary for OAuth security.
- These cookies are cleared when you sign out.
- **Theme preference** — stored under the `theme` key in your browser's **localStorage** (not a cookie) by next-themes to remember light/dark mode. Functional; persists until you clear browser storage.
- **No analytics, advertising, or tracking cookies or trackers.** Signing in with Google/GitHub redirects you to those providers, which set their own cookies under their own policies.

## Discoverability surfaces
- **Signup form** (`(app)/signup/signup-form.tsx`): add an agreement line beneath the submit button — "By creating an account you agree to our **Terms** and **Privacy Policy**." (linked to `/terms`, `/privacy`).
- **Settings** (`components/settings.tsx`, which is inside `(app)`): add a small "Legal" section linking Privacy / Terms / Cookies.
- **`(legal)` footer**: cross-links the three pages + a back-to-app link + copyright.
- *Out of scope:* legal links in the fixed app sidebar/bottom-nav (would disrupt the fixed-height shell) — deferred polish.

## Testing strategy

**Structural tests** (Vitest, `readFileSync` pattern as in `test/write-gate-coverage.test.ts`):
- Root `app/layout.tsx` does **not** import `getAppData` or `AppProvider` (DB-independence guard) **and** retains `export const dynamic = "force-dynamic"` (CSP guard).
- `app/(app)/layout.tsx` imports `getAppData` and `AppProvider`.
- Moved route files exist at their `(app)/` paths (incl. `(app)/bean/[id]/page.tsx`, `(app)/roaster/[id]/page.tsx`) and no longer at the old paths.
- Each legal page exists at `(legal)/{privacy,terms,cookies}/page.tsx` and imports **no** DB module (`@/lib/db`, `@/lib/queries`, `getAppData`).
- Each legal page's source contains its main heading, the "Template — review with counsel" disclaimer marker, and a "Last updated" string.
- `app/api/**` route handlers remain under `app/api/` (URLs unchanged).

**Live verification (controller-driven):**
- `docker stop coffee-pg` → `/privacy`, `/terms`, `/cookies` still return 200 with content; app routes degrade to `error.tsx` (no hang). Restart `coffee-pg`.
- Regression: `bean/[id]` and `roaster/[id]` still render after the move (they use `useShell`).
- No CSP console violations on legal pages (nonce present; next-themes inline script allowed); legal pages honor the persisted theme.
- Signup agreement links, Settings legal links, and legal footer links all navigate correctly.
- Green gate: full unit + integration suite, `build`, `lint`, and the Drizzle drift check.

## Risks & mitigations (from the audit)

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | Routes using `useShell`/`useData` crash if left outside `(app)` (esp. `bean`, `roaster`) | Move **all** such routes into `(app)`; encode the `useShell`-OR-`useData` invariant in the plan |
| 2 | Strict CSP blanks pages if `force-dynamic` is dropped or a route prerenders statically | Keep `force-dynamic` in the minimal root layout (cascades to all groups) |
| 3 | `api/` URLs break if moved into a group | Keep `app/api/**` at root; assert in tests |
| 4 | Legal pages clipped / edge-to-edge (global reset + `height:100%`) | `(legal)` layout uses natural document flow + own max-width container + own spacing |
| 5 | Content over-promises ("total erasure") or names non-existent third parties | Honest caveats baked in (rate-limit/log residue, best-effort prune, public-vs-private fields); processors limited to Google/GitHub/Resend/host |
| 6 | 404 renders without app chrome | Accepted for a 404; `not-found.tsx` stays at root by deliberate choice |

## Out of scope / deferred
- In-app sidebar/bottom-nav legal links beyond Settings.
- Self-service data export (DSAR/portability) feature.
- A scheduled cron purge for `rate_limits` / `verification_tokens` (would let the policy promise hard deletion deadlines) and a deletion-time purge of `rate_limits` PII.
- Cookie consent banner (not needed — only strictly-necessary cookies).
- An `(auth)` route group to skip `getAppData` for anonymous `/login` `/signup` visitors.

## Owner inputs required (inline `[PLACEHOLDER]` tokens)
Controller legal name; contact email; governing law / jurisdiction; minimum age (13/16); hosting provider + region; Postgres host (self-hosted vs external managed) + region; log retention period; DSAR/export fulfillment process; external-DB TLS posture; confirmation of legal bases / consent model.
