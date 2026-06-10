# Account-Linking — Design

**Date:** 2026-06-08
**Branch:** `feat/account-linking`
**Status:** Approved design, pressure-tested by the 4-lens model-diverse `account-linking-council` (CSRF/takeover, Auth.js-v5 mechanics, lockout/race, contrarian). The council reshaped the mechanism (see §A); all fixes folded in.

## Goal

Let a logged-in user **connect/disconnect** multiple sign-in methods (password + Google + GitHub) on ONE account, hand-rolled (no Auth.js adapter). Security-critical: account-takeover-sensitive.

## Locked decisions (product owner)

1. **Full scope:** connect/disconnect OAuth + add/remove password, always keeping **≥1** method.
2. **No email-match** required to link a provider (the link nonce is the auth boundary).
3. **No step-up re-auth** in v1 (revocation-checked session + single-use nonce).
4. **bumpSessionVersion on removal** (disconnect / remove-password), not on add.

## A. Mechanism (council-reshaped — the load-bearing part)

The original "the `jwt` callback reads the link cookie" is **impossible**: Auth.js v5 (`@auth/core` beta.31) jwt/signIn callbacks receive `{token, user, account, profile, trigger, isNewUser}` — no request/cookies (verified in source). The corrected mechanism:

- **Lazy-init `auth.ts`** — `export const { handlers, auth, signIn, signOut } = NextAuth(async (req) => ({ ...config }))`. The factory receives the `NextRequest` when the OAuth-callback Route Handler fires (so the callback closure can read `req.cookies`); `req` is `undefined` when called from a server action's `signIn()` (correct — the nonce is only read at the callback). This is the prerequisite for the whole feature.
- **`linkOAuthStart(provider)`** (server action, `requireUserId` → U): mint a single-use HMAC link token (new `link_tokens` table, migration 0006; mirrors `verification_tokens` — HMAC-to-`AUTH_SECRET` hash at rest, `user_id=U, provider, expires_at = now()+10min`), set the **raw** token in a **per-provider** cookie `link_nonce_<provider>` (`httpOnly, SameSite=Lax, Secure, Path=/, Max-Age=600`), **then** `await signIn(provider, { redirectTo: "/settings" })`. Set-cookie-then-signIn is one server-action response; the cookie rides the 302 to the provider and survives the round-trip (verified: Auth.js sets its own state/PKCE cookies the same way). **Ordering is load-bearing:** `cookies().set(...)` MUST be the line immediately before `await signIn(...)`, not inside a try/catch.
- **`signIn` callback** (runs before `jwt`, has `req` via the lazy closure, can **return a redirect string**): the entire link decision lives here.
  - Read `req.cookies.get("link_nonce_" + account.provider)`. **No nonce → `return true`** (normal login/signup — `jwt` resolves/creates as today, unchanged).
  - Nonce present → in ONE `withTransaction`: **atomically consume** the token (`DELETE FROM link_tokens WHERE token_hash=$1 AND provider=$2 AND expires_at>now() RETURNING user_id`); clear the cookie.
    - Consume returns null (expired/invalid) → `return "/settings?linkError=expired"`.
    - Got `U`. **Takeover pre-check + atomic INSERT:** `INSERT INTO accounts (provider, provider_account_id, user_id=U)`; on `23505` (the `unique(provider, providerAccountId)` backstop) re-`SELECT` the owner — **same user U → idempotent success**; **different user → `return "/settings?linkError=taken"`** (no move, no session switch).
    - Success → `return "/settings?linked=1"`.
  - **Returning a redirect string short-circuits the sign-in, so U's existing session is preserved** (no new session minted, no `token.uid` change). This is the clean no-throw reject path AND the no-session-switch link path in one.
- **`jwt` callback** — unchanged for the link path (only runs on real sign-ins, i.e. the no-nonce path).

**BUILD-TIME SPIKE (Task 1 of the plan):** prove that a `signIn`-callback **string return preserves the caller's existing session** (does not sign them in as the OAuth identity, does not 500). If Auth.js v5 beta does NOT preserve it, fall back to: `signIn` returns `true`, the `jwt` callback (lazy `req` closure) consumes the nonce + links + sets `token.uid = U` AND `token.sv = live session_version` (mirror `auth.ts` `getSessionVersion`), and the takeover/expired reject is surfaced via a `pages.error`-routed `/settings`. The spike picks the path before any operation code is written.

## B. Guards (the security core)

- **Wrong-user/CSRF:** the link targets the **nonce's** `user_id` (only U's authed `requireUserId` session can mint it); single-use + `SameSite=Lax` + the user authenticating to their *own* provider closes forced-link. Verified by the council: an attacker can neither link their own provider into a victim's account nor a victim's provider into theirs.
- **Takeover:** `(provider, providerAccountId)` already owned by a different user → reject (redirect string); the DB `unique` constraint is the real backstop, the pre-check is advisory; 23505 re-read decides idempotent-vs-reject.
- **Last-method (atomic, no TOCTOU):** removal is ONE conditional SQL statement —
  - unlink: `DELETE FROM accounts WHERE provider=$1 AND user_id=$2 AND ((SELECT count(*) FROM accounts WHERE user_id=$2) > 1 OR (SELECT password_hash IS NOT NULL FROM users WHERE id=$2)) RETURNING id`
  - remove-password: `UPDATE users SET password_hash=NULL WHERE id=$1 AND password_hash IS NOT NULL AND (SELECT count(*) FROM accounts WHERE user_id=$1) > 0 RETURNING id`
  - `rowCount === 0` → "You must keep at least one sign-in method." Wrap in `withTransaction`.
- **`setPassword` (add password to an OAuth-only account):** reject if the user already has a password (changing an existing password is out of scope). **Reject if `email IS NULL`** (GitHub users can have null email → otherwise an unusable credential + catch-22 lockout). **Require `email_verified IS NOT NULL`** (else a can-login-but-can't-write degraded state under `requireVerifiedUserId`; offer the existing resend-verification). Validate the password with the existing signup rules. Set `password_hash` in a single UPDATE; the partial `users_email_lower_uq` (WHERE `password_hash IS NOT NULL`) fires on the flip — map its 23505 to "that email already has a password account" (reuse `mapRegisterError`). No bump (adding a method).
- **Session revocation on removal:** `bumpSessionVersion(U)` then **`unstable_update`** to re-stamp the actor's current JWT with the new `sv` — the actor stays signed in, **other** devices (old `sv`) die on their next request (this is what "revoke on disconnect" actually intends). If `unstable_update` proves unavailable, fall back to an explicit `signOut({ redirectTo: "/login?reason=disconnected" })` (intentional logout with a landing page) — never a silent next-navigation logout.

## C. Operations (server actions, all `requireUserId`)

`linkOAuthStart(provider)` · `unlinkOAuth(provider)` · `setPassword(pw)` · `removePassword()` — in a new `app/account-link-actions.ts`. Reads: `getAuthMethods(userId) → { hasPassword: boolean, providers: string[] }`.

## D. Data + libs

- **migration 0006** `link_tokens` (`id, user_id, provider, token_hash, expires_at`, index on `token_hash`), mirrors `verification_tokens`.
- `lib/link-tokens.ts` — `createLinkToken(db, userId, provider)` (delete prior per `(user_id, provider)` + 1% expired-prune, like `verification-tokens`) and `consumeLinkToken(db, raw, provider)` (atomic `DELETE…RETURNING`).
- Repo fns (transaction-aware, in a new `lib/account-link-repo.ts`): `linkAccount`, `unlinkAccount` (atomic guard), `setUserPassword` (atomic, guarded), `removeUserPassword` (atomic guard), `getAuthMethods`.

## E. UI

A **"Sign-in methods"** section in `/settings` (`components/settings.tsx`, fed a server-fetched `getAuthMethods`): rows for Password / Google / GitHub with Connect / Disconnect / Add-password / Remove-password, each disabled when it would remove the last method. `/settings?linked=1|linkError=<code>` → a toast/inline message. The add-password row uses an inline password field + the existing validation.

## F. Out of scope

Changing an existing password (password-reset, separate); step-up re-auth; per-method (vs coarse) session revocation; auto-merge by email; a `pages.error` redesign beyond what the fallback path needs.

## Testing

- **Unit:** `link-tokens` mint/consume (provider-scoped, single-use, HMAC); `getAuthMethods` shape; the atomic last-method guard SQL carries the `count>1 OR has_password` predicate; `setPassword` rejects null/unverified email; `mapRegisterError` maps the handle/email constraints; migration 0006 drift.
- **Integration (DB):** two users; link happy-path attaches `(provider, id)` to the **nonce's** user even when the OAuth identity is new/other; **takeover** (id already owned by another user) does not move the row or switch session; no-nonce OAuth still creates/resolves as today; last-method guard blocks the final removal **under concurrency** (two racing deletes leave ≥1); `setPassword` email-uniqueness 23505 → friendly; remove/unlink bump `session_version`.
- **Live (the security spike + the flow):** (1) the `signIn`-string-return **session-preservation** spike; (2) connect Google to a password account → both methods work, session stays; (3) takeover attempt → `/settings?linkError=taken`, no switch; (4) disconnect → other devices die, this one stays (or the documented logout); (5) add-password to a Google account → can then log in with email+password; (6) last-method removal blocked; (7) 0 CSP violations.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| jwt/signIn callback can't read cookies | lazy-init `auth.ts`; read `req.cookies` in the closure |
| Reject throws → generic `?error=Configuration` page | reject via a `signIn`-callback **redirect string**, never throw |
| signIn string-return might switch the session | **Task-1 build-time spike**; documented jwt-fallback |
| cookie lost across the OAuth redirect | `SameSite=Lax httpOnly`, set immediately before `signIn`, per-provider name (verified to survive) |
| concurrent last-method removal → lockout | single atomic conditional SQL + `rowCount` check |
| takeover via INSERT race | one transaction + `unique(provider,providerAccountId)` 23505 re-read |
| setPassword on null/unverified email → unusable/degraded | reject unless email present + verified |
| bump logs out the actor mid-flow | `unstable_update` re-stamp (fallback: intentional signOut) |
