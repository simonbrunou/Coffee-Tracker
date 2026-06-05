# Auth.js v5 Authentication — Design

**Date:** 2026-06-05
**Status:** Approved (design); pending implementation plan
**Branch:** `feat/authjs-authentication`

## Summary

Cortado currently has no authentication. A single hardcoded constant
`CURRENT_USER_ID = "u1"` is the only identity, seeded as one `users` row so the
`tastings.user_id` / `likes.user_id` foreign keys always resolve. This design
replaces that constant with real per-request identity using **Auth.js v5
(next-auth)**, supporting three sign-in methods — **Credentials (email +
password), Google OAuth, GitHub OAuth** — while keeping the app's existing
domain `users` table as the single source of identity.

### Decisions locked during brainstorming

- **Library:** Auth.js v5 (`next-auth@beta`).
- **Providers:** Credentials + Google + GitHub.
- **Session strategy:** JWT (forced — the Credentials provider is incompatible
  with Auth.js database sessions).
- **Gating:** Browse is public; **writes are gated** (log a brew, add a bag,
  like, view "your" journal/profile require login).
- **Seed:** No users seeded; `CURRENT_USER_ID` removed.
- **Identity bridge:** **Approach A** — JWT, **no Auth.js adapter**, we persist
  users ourselves. Chosen by a model-diverse council over the official
  `@auth/pg-adapter` (Approach B, collides with `NOT NULL handle`/`avatar` and
  the text-id convention; Credentials bypasses it anyway) and a separate
  auth-identity table (Approach C, permanent join tax for marginal benefit).
- **Account linking:** **Separate accounts per provider.** Identity keys on
  `(provider, providerAccountId)`, never on email. Email becomes display-only.
  Same email via Google + GitHub + password produces distinct journals unless
  explicitly linked later (deferred).

## Threat model / why "separate accounts, no email linking"

Keying identity on a shared email is an account-takeover vector:

- **GitHub** OAuth does not assert a verified email; verification requires a
  separate `GET /user/emails` call and can still be unverified.
- **Credentials** has no email verification at all unless we build one.

So "merge accounts that share an email" would let an attacker pre-register
`victim@example.com` (via GitHub or credentials, neither verified) and have the
victim's later login fold into the attacker's row. Auth.js gates exactly this
behind a flag literally named `allowDangerousEmailAccountLinking`. By keying on
`(provider, providerAccountId)` and treating email as display-only, this vector
does not exist — and the design is simpler.

## Architecture

### 1. Schema (`db/schema.sql`)

Additions to `users`:

| Column | Type | Notes |
|---|---|---|
| `email` | `text` | Display-only. **Not** globally unique. |
| `email_verified` | `timestamptz null` | Reserved; not enforced in v1. |
| `image` | `text null` | OAuth avatar URL (distinct from `avatar` tint). |
| `password_hash` | `text null` | Only credential users have one. |
| `created_at` | `timestamptz not null default now()` | |

- **Partial unique index:** `create unique index on users (lower(email)) where
  password_hash is not null;` — at most one password account per email, while
  OAuth rows may share an email.
- `users.id` stays `text`, generated server-side as `u-${randomUUID()}`
  (matches the `t-`/`b-` convention in `app/actions.ts`).

New `accounts` table (OAuth linkage only):

```sql
create table accounts (
  id                  text primary key,
  user_id             text not null references users(id) on delete cascade,
  type                text not null,            -- 'oauth' | 'oidc'
  provider            text not null,            -- 'google' | 'github'
  provider_account_id text not null,
  created_at          timestamptz not null default now(),
  unique (provider, provider_account_id)
);
```

Credentials identity is handled via `users.email` + `users.password_hash` + the
partial unique index — no `accounts` row needed.

`password_hash`, `email`, and `email_verified` are **never** added to any
client-facing projection (`getUsers` in `lib/queries.ts` already selects an
explicit column list — keep it that way).

### 2. Auth.js wiring

- `auth.ts` (repo root):
  ```ts
  export const { handlers, auth, signIn, signOut } = NextAuth({
    session: { strategy: "jwt" },
    pages: { signIn: "/login" },
    providers: [Credentials({...}), Google, GitHub],
    callbacks: { jwt, session },
  })
  ```
- `app/api/auth/[...nextauth]/route.ts`: `export const { GET, POST } = handlers`.
- **OAuth upsert in the `jwt` callback** on first sign-in (when `account` and
  `profile` are present), inside a transaction: look up `accounts` by
  `(provider, providerAccountId)` → reuse `user_id`; else create a `users` row
  (generated handle + avatar tint, `name`/`image`/`email` from the profile) and
  an `accounts` row. Sets `token.uid = users.id`. **No email lookup.**
- **Credentials `authorize()`**: `select id, password_hash from users where
  lower(email) = lower($1) and password_hash is not null`; `bcrypt.compare`
  (cost 12); return a **uniform error** for "no such email" and "wrong password"
  alike (no user-enumeration oracle).
- `session` callback: `session.user.id = token.uid`.
- **No global middleware.** Browse is public, and Edge middleware cannot import
  `pg`. Gating is per-action / per-page instead.

### 3. Current-user plumbing (replaces `CURRENT_USER_ID`)

- New `lib/auth.ts` (server-only helpers):
  - `getCurrentUserId(): Promise<string | null>` → `(await auth())?.user?.id ?? null`
  - `requireUserId(): Promise<string>` → throws if null.
- `lib/db.ts`: add `withTransaction(fn)` / `getClient()` (a real transaction
  primitive does not exist today — only autocommit `query()`).
- `lib/queries.ts`: `getAppData()` reads the session.
  `currentUserId` is nullable; `likedIds` is `[]` when logged out
  (`getLikedTastingIds` is only called when there is a user).
- `app/actions.ts`: `logBrew`, `addBag`, `toggleLike` each start with
  `const userId = await requireUserId()` and use it. **Identity is never taken
  from the client.** Removes the `CURRENT_USER_ID` import.
- `lib/types.ts`: `AppData.currentUserId: string | null`.
- `lib/seed-data.ts`: remove the `CURRENT_USER_ID` export and the seeded user.
- `scripts/db-setup.ts`: no longer seeds users.

### 4. The `mine` correctness fix (independent of auth, detonated by it)

`tastings.mine` is a stored boolean hardcoded `true` at insert
(`app/actions.ts`). It is read directly by the UI (`components/cards.tsx`,
`components/screens.tsx` journal stats, `components/detail.tsx` profile). With a
single user this is harmless; with real multi-user it means **every user sees
every brew tagged "You."**

Fix: compute ownership at render as `tasting.userId === currentUserId` wherever
`mine` is currently read. The column is **kept** (reversible) but no longer
trusted.

### 5. UI

- `app/login/page.tsx` — email + password form, plus "Continue with Google" /
  "Continue with GitHub" buttons.
- `app/signup/page.tsx` — name, email, password (+ optional handle, else
  auto-generated), plus the OAuth buttons.
- Sign-out control in the profile / sidebar.
- Logged-out write affordances (Log a brew, Add a bag, like buttons,
  your-journal / your-profile) show a sign-in CTA / redirect to `/login`. The
  client already guards a missing `me` (`components/app-provider.tsx`,
  `components/detail.tsx`); extend those to show the CTA when `currentUserId` is
  `null`.
- **No client `SessionProvider`** — `currentUserId` continues to flow from the
  server via `AppData`.

### 6. Security hardening (from the council)

Mandatory in v1:

1. **Server-derived identity, always.** `requireUserId()` in every action; no id
   ever accepted from the client. (Highest-priority item — the difference
   between auth and security theater.)
2. **No email account-linking;** `accounts (provider, provider_account_id)` is
   unique; identity never keys on email.
3. **Handle generation:** random, non-PII (e.g. `user_` + short base36), with a
   collision-retry loop catching unique violations (`23505`) inside the upsert
   transaction. Never derived from email/name.
4. **`getAppData` is session-aware:** logged-out → `currentUserId: null`,
   `likedIds: []`.
5. **`mine` computed, not trusted** (section 4).
6. **Credentials hygiene:** bcrypt cost ≥ 12, uniform errors, `password_hash`
   excluded from every client projection.

### 7. Dependencies

- `next-auth@beta` (Auth.js v5).
- `bcryptjs` + `@types/bcryptjs` (pure JS — no native bindings, no
  `serverExternalPackages` entry needed; cost is irrelevant for this app).

### 8. Environment variables (must be added by hand)

Writing `.env*` is blocked by a repo hook, so these are **documented** in
`SETUP.md` and a committed `.env.example`, for the developer to fill in:

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
- (optional) `AUTH_URL`

The developer registers the Google and GitHub OAuth apps; callback URL
`/api/auth/callback/{google,github}`.

### 9. Testing

No test infrastructure exists today. Add **Vitest** and unit-test the pure
logic:

- bcrypt hash / verify round-trip and failure.
- Handle generation + collision-retry.
- `resolveOrCreateUser` (mock the `pg` client): reuse on existing
  `(provider, providerAccountId)`, create otherwise.
- `requireUserId` gating (null session → throws).

Integration test (optional, against the Docker Postgres): credentials
signup → login.

## Build sequencing (for the implementation plan)

1. **Security backbone** — schema migration (`accounts`, new `users` columns,
   partial index), `withTransaction` in `lib/db.ts`, remove `CURRENT_USER_ID`,
   make `currentUserId` nullable, add `requireUserId`/`getCurrentUserId`
   (stubbed to `null` until Auth.js lands), gate the three actions, and the
   `mine` fix.
2. **Auth.js providers** — `auth.ts`, the route handler, Credentials
   `authorize`, OAuth upsert in the `jwt` callback, `session` callback,
   `bcryptjs`, Vitest + unit tests.
3. **UI** — `/login`, `/signup`, sign-out, logged-out CTAs; `SETUP.md` /
   `.env.example` updates.

## Out of scope / deferred (future hardening)

- **JWT revocation** via a `sessionVersion` claim checked against `users`
  (acceptable to omit for a single-owner app; documented as the only
  software-side revocation under a JWT strategy).
- **Explicit account-linking** UX (link Google/GitHub/password that share an
  email) and the email-verification flows it requires.
- **Denormalization cleanup** beyond `mine`: `tastings.likes` count drift vs the
  `likes` table, and `users.tastings/followers` counters. Pre-existing; noted
  but not addressed here.
