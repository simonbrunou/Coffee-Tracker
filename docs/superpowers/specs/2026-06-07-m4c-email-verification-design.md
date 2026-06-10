# M4·C — Email Verification — Design

**Status:** Approved (design) — pending spec review
**Date:** 2026-06-07
**Milestone:** M4 (auth hardening & compliance), sub-project C. **Scoped to email verification only** — cross-provider account linking was split into its own later milestone (the council found explicit linking is a much sharper, hand-rolled-either-way takeover surface; it deserves a dedicated security design).
**Branch (to create):** `feat/m4c-email-verification`

## Goal

Verify that credential (email+password) users own their email address, and gate content writes behind verification. OAuth users (Google/GitHub) are verified by the provider. This reduces fake signups, enables safe future password-reset, and is a baseline for compliance. Email is sent via **Resend** (real provider) behind an abstraction with a dev fallback.

## Background — current state (verified, incl. a 3-agent architecture dig)

- **No-adapter Auth.js v5 (JWT sessions), confirmed the right call.** Credentials forces JWT; the standard adapter's `createUser` omits `handle`/`avatar` (NOT NULL) so it can't be used unmodified; explicit account-linking is hand-rolled in v5 *regardless* of an adapter. Verification will be hand-rolled against the existing schema (a custom adapter would be net-negative now). To keep a future custom adapter a drop-in: write to the existing `users.email_verified` column (no competing flag) and keep `accounts` adapter-shaped (it already is).
- `users.email_verified` (timestamptz, nullable) exists but is **unused**. `password_hash` is null for OAuth users, non-null for credential users. The partial unique index `lower(email) WHERE password_hash IS NOT NULL` makes credential emails unique.
- `registerUser` (`app/auth-actions.ts`) creates a credential user then auto-`signIn`s. No verification today.
- `resolveOrCreateOAuthUser` keys on `(provider, providerAccountId)`, never email; does **not** set `email_verified`.
- Write actions (`app/actions.ts`, ~14) all start with `requireUserId()` (M4·A: auth + `session_version` revocation via one DB lookup). The JWT is **frozen at login** (`jwt` callback early-returns on `token.uid`) — so a session can't carry a fresh `verified` flag without re-login.
- No email infra, no `resend` dependency, no `verification_tokens` table.

## Decisions (locked by product owner)

1. **Resend** (real provider) for sending, with a **dev fallback** that logs the verification link when no API key is set.
2. **Write-gate**: unverified credential users can sign in + read, but cannot perform content writes until verified. Keep auto-sign-in-on-signup.
3. **No adapter** (hand-rolled), per the architecture dig.

## Architecture

### Cut 1 — Email infrastructure

**Migration 0004 — `verification_tokens`** (`lib/db/schema.ts` → `drizzle/0004`):
```ts
export const verificationTokens = pgTable("verification_tokens", {
  id:        text("id").primaryKey(),                                  // uuid
  userId:    text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email:     text("email").notNull(),                                  // denormalized (display/keying)
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("vt_token_hash_uq").on(t.tokenHash),
  index("vt_user_id_idx").on(t.userId),
  index("vt_expires_at_idx").on(t.expiresAt),
]);
```

**`lib/verification-tokens.ts`** (`server-only`):
- `generateToken()` → `{ raw, hash }`: `raw = crypto.randomBytes(32).toString("base64url")` (256-bit); `hash = createHmac("sha256", AUTH_SECRET).update(raw).digest("hex")`. **HMAC-binding to `AUTH_SECRET`** so a DB-only leak (SQLi/backup) can't forge a valid token.
- `createVerificationToken(db, userId, email)` → `raw`: delete any prior unexpired token for the user (one live link at a time), insert `{id, userId, email, hash, expiresAt = now()+24h}`, return `raw`.
- `consumeVerificationToken(db, raw)` → `{ userId } | null`: **atomic single-use** — `DELETE FROM verification_tokens WHERE token_hash=$1 AND expires_at > now() RETURNING user_id`. The PK/row-lock serializes concurrent attempts; exactly one wins.
- Opportunistic cleanup (~1%, fire-and-forget, like the rate limiter): `DELETE WHERE expires_at < now()`.
- **TTL = 24h** (verification, not login/reset — UX over strictness; mitigated by hash-at-rest, single-use, tokenless redirect, and that triggering the link merely *verifies* an email = the desired outcome, low harm).

**`lib/email.ts`** (`server-only`):
- `sendEmail(to, subject, html): Promise<void>` — in prod, `new Resend(RESEND_API_KEY).emails.send({ from: EMAIL_FROM, to, subject, html })`; **must check the `{ data, error }` result and throw on `error`** (the SDK doesn't throw). **Dev fallback:** if `RESEND_API_KEY` is absent, `logger.info("email_dev_fallback", { to, subject, ...})` (and the caller logs the link) and resolve — so the whole flow works locally without Resend.
- Env: `RESEND_API_KEY`, `EMAIL_FROM`, and the public base URL for links (reuse `AUTH_URL`). `validateEnv`: **warn** (not throw) if `RESEND_API_KEY`/`EMAIL_FROM` absent in prod (the dev fallback is a valid staging mode).
- **Live dependency (flagged):** real sending requires a Resend-**verified sending domain** (or `onboarding@resend.dev`, which only sends to your own registered address). Code + tests complete without it; production send needs it.

### Cut 2 — Verification flow

- **`sendVerificationEmail(userId, email)`** helper: `createVerificationToken` → build link `${AUTH_URL}/api/verify?token=${raw}` → `sendEmail(...)` (+ log the link in dev).
- **`registerUser`** (`app/auth-actions.ts`): unchanged through `createCredentialUser`; **after the successful INSERT** (so the unique index throttles repeat-signup email bombing), call `sendVerificationEmail`, then `signIn` (auto-login; the user is logged in but write-gated). No "check your email" page — the banner (Cut 3) handles prompting.
- **`/api/verify`** Route Handler (`app/api/verify/route.ts`, `GET`): read `token`, `consumeVerificationToken`; on success `UPDATE users SET email_verified = now() WHERE id=$1` and **redirect to a tokenless URL** (`/?verified=1`); on failure redirect to a neutral page (`/?verified=0`) — same message whether invalid/expired/already-used (no enumeration). **Hardcoded/relative redirect only** (no `callbackUrl` param → no open redirect). GET-consumes is acceptable here: a scanner prefetching the link merely verifies the email (the intended outcome), not a login.
- **`resendVerification()`** Server Action: rate-limited by `verify:email:<email>` **and** `verify:ip:<ip>` (M4·B `checkRateLimit`, per-email limit e.g. 5/15min); re-runs `sendVerificationEmail`; **neutral response** ("If your account needs verification, we've sent a link"). The send is gated by a successful token INSERT, so a DB outage (fail-open limiter) can't be exploited to bomb — the insert fails first.
- **OAuth auto-verify** in `resolveOrCreateOAuthUser`: set `email_verified = now()` on creation **only when the provider verified the email** — Google: `profile.email_verified === true`; GitHub: the bundled provider returns the *primary* (not necessarily *verified*) email, so fetch `/user/emails` (via `account.access_token`) and require `primary && verified`, else leave unverified. (Fallback if the GitHub fetch proves fiddly in the plan: don't auto-verify GitHub — those users verify via the email flow.) Lazy-backfill `email_verified` for existing OAuth users on next sign-in if null.

### Cut 3 — Write-gate

- **`getSessionState(db, userId)`** (new in `lib/users-repo.ts`) → `{ sessionVersion, emailVerified: Date|null, hasPassword: boolean }` in one query: `select session_version, email_verified, (password_hash is not null) as has_password from users where id=$1`.
- **Pure predicate** in `lib/auth-guard.ts`: `isWriteAllowed(hasPassword: boolean, emailVerified: Date|null): boolean` → `!(hasPassword && !emailVerified)` (credential users need verification; OAuth always allowed). Unit-tested truth table.
- **`requireVerifiedUserId()`** (new in `lib/auth.ts`): `auth()` → `getSessionState` → `resolveUserOrThrow` (revocation, unchanged) → if `!isWriteAllowed(...)` throw `"Email not verified"` → return id. **One DB query, never stale** (no JWT flag — sidesteps the frozen-JWT problem). `requireUserId` stays as-is for non-content writes.
- Apply `requireVerifiedUserId` to the **content writes** in `app/actions.ts`: `logBrew, addBag, updateBrew, deleteBrew, updateBag, deleteBag, toggleLike, toggleFollowUser, toggleFollowRoaster, toggleSaveTasting, toggleWishlistBean, addComment, updateComment, deleteComment`. Keep plain `requireUserId` for `deleteAccount`/`signOutAllDevices` (a user must be able to manage/leave their account unverified). A coverage test asserts every content-write export uses the verified gate.
- **Banner UI:** `getAppData` returns a new `needsEmailVerification: boolean` (current user only — computed `hasPassword && !emailVerified`; **not** added to the shared `User` type, to avoid leaking other users' verification status). A "Verify your email" banner in the shell (with a resend button) shows when true; a `?verified=1` success toast on return. **Do not leak the raw `email_verified` timestamp to the client** (the projection-guard invariant) — only the derived boolean.

## Data flow

- **Credential signup:** validate → insert user → `sendVerificationEmail` (after insert) → auto-`signIn` → logged in, write-gated, banner shown. Click link → `/api/verify` consumes token + sets `email_verified` → redirect `/?verified=1`. Next write call → `requireVerifiedUserId` reads fresh DB state → allowed (no re-login needed).
- **OAuth signup:** provider verifies email → `email_verified` set on creation → no gate.
- **Write attempt (unverified credential):** `requireVerifiedUserId` throws `"Email not verified"` → action surfaces the error.

## Error handling
- Email send failure (Resend `error`): `sendEmail` throws → `sendVerificationEmail` caller logs; signup still succeeds (user can resend). Dev (no key): logs the link, never errors.
- Verify endpoint: invalid/expired/used → neutral redirect (no enumeration). DB error → caught, neutral failure.
- Write-gate: a DB outage makes `requireVerifiedUserId` throw (fail-closed on writes, consistent with `requireUserId`).

## Testing
**Unit:**
- `verification-tokens`: `generateToken` (raw ≠ hash; hash is HMAC of raw+secret; unique per call); `consumeVerificationToken` (valid → userId, expired → null, already-used → null) via fakeClient; SQL shape (`delete … returning user_id`).
- `isWriteAllowed` truth table: credential+unverified → false; credential+verified → true; OAuth(no password)+unverified → true.
- `requireVerifiedUserId` (mock `auth` + `getSessionState`): unverified credential throws; verified passes; OAuth passes; revocation (sv mismatch) still throws.
- `sendEmail`: dev fallback logs when no key (no throw); throws when Resend returns `error` (mock the client).
- `registerUser`: sends verification **after** a successful insert (not before/​on collision).
- `resendVerification`: rate-limited; neutral response.

**Integration (real Postgres):**
- `verification_tokens` cascade (delete user → tokens gone).
- Consume-once atomicity (concurrent `DELETE … RETURNING` on one token → exactly one wins) — mirrors the rate-limit concurrency test.

**Live (dev + with a Resend key):**
- Signup → dev log shows the verify link (no key) → click → `email_verified` set → a write that was blocked now succeeds **on the same session** (proves the DB-read gate, no re-login); banner disappears.
- Resend works + is rate-limited + neutral.
- Google OAuth signup → auto-verified → writes immediately.

## Out of scope (M4·C)
- **Cross-provider account linking** (its own milestone, with a dedicated security design — CSRF-bound link nonce + wrong-user guard; hand-rolled, no-adapter).
- Magic-link / Auth.js Email provider (would require an adapter).
- Password reset (future — verification unblocks it).
- A scheduled token-cleanup cron (opportunistic prune suffices at this scale).

## Risks
- **Frozen-JWT staleness** — avoided by design: the gate is a live DB read (`getSessionState`), never a JWT claim.
- **Resend verified-domain dependency** — code/tests complete without it; production send needs a verified domain (or the dev fallback). Flagged for ops.
- **GitHub email not verified** — the bundled provider picks *primary*, not *verified*; we fetch `/user/emails` (or don't auto-verify GitHub). Don't blanket-trust the provider email.
- **Email bombing** — neutralized by sending only after a successful insert (unique index throttles repeats) + per-email/per-IP rate limit + neutral responses.
- **Token leak via logs** — consume + redirect to a tokenless URL; never add the token to a logger call; Referrer-Policy already blocks the cross-origin Referer leak.
- **Projection leak** — expose only a derived `needsEmailVerification` boolean for the current user; keep the raw timestamp server-side (projection-guard test enforces).
