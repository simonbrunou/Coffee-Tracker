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
    trustHost: true,            // required behind a proxy / non-localhost prod
    providers: [Credentials({...}), Google, GitHub],  // bare Google/GitHub use AUTH_* env auto-inference
    callbacks: { jwt, session },
  })
  ```
- `app/api/auth/[...nextauth]/route.ts`: `export const { GET, POST } = handlers`.
- **No split `auth.config.ts` is needed** (it exists only to keep adapters/`pg`
  out of an Edge middleware bundle — and we have no middleware). State this so
  nobody adds the split for no reason.

**The `jwt` callback** (runs on **every** authenticated request — `account` /
`profile` / `user` are only present on the first call after sign-in):

```ts
async jwt({ token, account, profile, user }) {
  if (token.uid) return token                 // already resolved → no DB hit
  if (account) {                              // first sign-in only
    if (account.type === "credentials") {
      token.uid = user.id                     // user = authorize()'s return → our users.id
    } else {                                  // oauth/oidc: resolve-or-create, get OUR id
      token.uid = await resolveOrCreateOAuthUser(account, profile)
    }
  }
  return token
}
```

- `resolveOrCreateOAuthUser` runs inside **one** `withTransaction`: look up
  `accounts` by `(provider, providerAccountId)` → reuse `user_id`; else create a
  `users` row (generated handle + avatar tint; `name`/`image`/`email` from the
  profile, email **display-only**) + an `accounts` row, returning our
  `users.id`. **No email lookup.** Handle-collision (`23505`) retry uses a
  **SAVEPOINT** (a raw `23505` aborts the whole Postgres transaction, so you
  cannot just re-`INSERT` — wrap each attempt in `savepoint`/`rollback to
  savepoint`, or retry the whole transaction).
- **Fails closed:** if the upsert throws (DB down, unrecoverable collision), the
  callback throws → Auth.js denies sign-in → no half-written user, no token.
  Prefer surfacing OAuth-create failure as `AccessDenied` (a `signIn` callback
  is an option if a clean denial page is wanted; `jwt` is acceptable but define
  the failure path).

- **Credentials `authorize(creds)`**: `select id, password_hash from users where
  lower(email) = lower($1) and password_hash is not null`. **Always run a bcrypt
  compare** — if no row is found, compare against a **dummy hash** so the timing
  is identical (otherwise the early return is a user-enumeration timing oracle).
  On success return `{ id, ... }` (→ `token.uid = user.id`); on any failure
  return **`null`** (Auth.js renders `CredentialsSignin` — a single uniform
  error; never throw provider-specific detail).

- `session` callback: `session.user.id = token.uid`.

- **Type augmentation** (required or `session.user.id`/`token.uid` won't
  typecheck):
  ```ts
  declare module "next-auth" { interface Session { user: { id: string } & DefaultSession["user"] } }
  declare module "next-auth/jwt" { interface JWT { uid: string } }
  ```

- **`signIn()` call shapes** (the most error-prone wiring): OAuth buttons →
  `<form action={async () => { "use server"; await signIn("github", { redirectTo: "/" }) }}>`;
  credentials → `await signIn("credentials", formData)`. Server Actions throw the
  Next redirect, so any `try/catch` around `signIn` **must re-throw**
  `isRedirectError(e)` and only render the uniform error for `AuthError`.

- **No global middleware.** Browse is public, and Edge middleware cannot import
  `pg`. Gating is per-action / per-page instead. `auth()` callers must be
  request-scoped (no module-level calls); `app/layout.tsx` is already
  `force-dynamic`.

- **Cookies / CSRF (relied upon knowingly):** Auth.js v5 defaults — `httpOnly`,
  `SameSite=Lax`, `Secure` + `__Host-`/`__Secure-` cookie prefixes in prod, and
  built-in double-submit CSRF on the credentials POST. `trustHost: true` (or a
  pinned `AUTH_URL`) is **required** in prod to prevent host-header/callback
  abuse. Do not "simplify" these away.

### 2b. Credentials signup write-path (`registerUser` server action)

Login and signup are different operations — `authorize()` only *reads*. New
password accounts are created by a dedicated **server action** (not
`authorize()` auto-register):

- **Input + validation:** `name` (required, trimmed, length-bounded), `email`
  (required, format-checked, normalized to lowercase), `password` (policy:
  min 8 chars; be aware bcrypt truncates at 72 **bytes** — reject or document
  over-long input), optional `handle`.
- **Hash:** `bcrypt.hash(password, 12)`.
- **Handle:** if not supplied, generate via the **shared** non-PII generator
  (`user_` + short base36) used by the OAuth path; validate charset/length if
  supplied.
- **Avatar:** assign a default tint from the catalog palette (same strategy the
  OAuth upsert uses) — `users.avatar` is `NOT NULL`.
- **Insert + race:** `insert into users (id, name, handle, email, password_hash,
  avatar, ...) values (...)`. Catch `23505`: on the partial-unique email index →
  friendly "email already registered"; on the handle index → regenerate/retry.
  (Do **not** `SELECT`-then-`INSERT` — that's the email race the index is there
  to stop.)
- **After success:** call `signIn("credentials", ...)` to establish the JWT, then
  redirect to `/`.
- **Acknowledged tension:** the "email already registered" response is itself a
  credential-account enumeration oracle. Accepted for usability; noted so it's a
  conscious choice, not an oversight.
- **Abuse:** signup and the credentials login POST are unauthenticated public
  endpoints; add basic rate-limiting (per IP / per email) — bcrypt cost 12 makes
  unthrottled login a CPU-DoS lever. (Mechanism: see §6.)

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
  from the client.** Removes the `CURRENT_USER_ID` import. (Note: `logBrew`
  against a non-existent `beanId` throws a raw FK `23503`; validate inputs or map
  the error.)
- `lib/types.ts`: `AppData.currentUserId: string | null`.
- `components/data-context.tsx`: `currentUserId` becomes `string | null` on both
  the `DataApi` interface **and** the `DataProvider` prop; `D.user(...)` call
  sites that pass `currentUserId` (e.g. `detail.tsx:447`) need a null guard.
- `components/app-provider.tsx:229-230`: the hardcoded `"You"` / `"@you"` sidebar
  labels must become dynamic (`me?.name` / `me ? "@"+me.handle : …`) or a Sign-in
  button — today they render wrong for any non-`u1` user.
- `lib/queries.ts`: **remove `mine` from `TASTING_COLS`** (see §4) so any site
  still reading `tasting.mine` fails to compile.
- `lib/seed-data.ts`: remove the `CURRENT_USER_ID` export and the seeded user
  (`USERS` becomes `[]`).
- `scripts/db-setup.ts`: still imports `USERS` (now empty) — its insert loop is a
  no-op; no code change required beyond the empty array.

### 3b. Exact touch-list (grep-verified)

`CURRENT_USER_ID`: `lib/seed-data.ts:11`, `lib/queries.ts:3,64,66`,
`app/actions.ts:6,22,79,83`. `currentUserId`: `components/app-provider.tsx`,
`components/data-context.tsx:19,33,40,53,59`, `lib/types.ts:98`.
`mine` read sites: `components/cards.tsx:60`, `components/screens.tsx:141`,
`components/detail.tsx:448` (+ stored in `app/actions.ts:18`, `TASTING_COLS`,
seed). `getAppData` has a single caller, `app/layout.tsx:46` (no-arg, internal
session read — works in the async root server component).

### 4. The `mine` correctness fix (independent of auth, detonated by it)

`tastings.mine` is a stored boolean hardcoded `true` at insert
(`app/actions.ts`). It is read directly by the UI (`components/cards.tsx`,
`components/screens.tsx` journal stats, `components/detail.tsx` profile). With a
single user this is harmless; with real multi-user it means **every user sees
every brew tagged "You."**

Fix: compute ownership at render as `tasting.userId === currentUserId` at **all
three** read sites — `components/cards.tsx:60` (`{tasting.mine && <Tag>You</Tag>}`),
`components/screens.tsx:141` and `components/detail.tsx:448` (both
`D.TASTINGS.filter(t => t.mine)`). The DB column is **kept** (reversible), but
**`mine` is dropped from `TASTING_COLS`** (`lib/queries.ts`) so it is no longer
shipped to the client and any missed read site **fails to compile** rather than
silently leaking another user's brews as "You." This exhaustiveness is the
entire security payoff of the migration.

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
- `/login` and `/signup` redirect to `/` if a session already exists.
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
6. **Credentials hygiene:** bcrypt cost ≥ 12; **uniform errors with a dummy-hash
   compare on the no-user path** (a bare early-return is a timing oracle — §2);
   `password_hash`/`email`/`email_verified` excluded from every client
   projection.
7. **`trustHost: true` / pinned `AUTH_URL`** in prod; rely on Auth.js's default
   `httpOnly`/`SameSite=Lax`/`Secure`-prefix cookies + built-in CSRF knowingly
   (§2).
8. **Rate-limiting** on the unauthenticated signup + credentials-login POSTs
   (per IP / per email). Minimal v1: an in-memory/Postgres fixed-window counter;
   note it is per-instance only. Prevents mass-registration and bcrypt CPU-DoS.

**Structural data-exposure guard (recommended, defer-OK):** introduce a
`PublicUser` type / projection so `email`/`password_hash` can never reach the
client via future drift — `getAppData` ships the whole `users` list to every
visitor, so a convention-only exclusion is fragile.

### 7. Dependencies

- `next-auth@beta` (Auth.js v5). Pin the beta and re-verify callback signatures
  at install; confirm whether it needs a `serverExternalPackages` entry on this
  Next.js 15 / React 19 setup (`pg` already has one).
- `bcryptjs` + `@types/bcryptjs` (pure JS — no native bindings; must stay on the
  Node runtime, which it does since there is no Edge middleware).

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

No test infrastructure exists today. Add **Vitest** (`vitest.config.ts` with
`environment: "node"`, a `test` script in `package.json`, and an alias/stub for
the `server-only` import, which throws outside a Next bundle). Unit-test the pure
logic:

- bcrypt hash / verify round-trip and failure; **dummy-hash timing path**.
- Handle generation + collision-retry (savepoint semantics).
- `resolveOrCreateOAuthUser` (mock the `pg` client): reuse on existing
  `(provider, providerAccountId)`, create otherwise.
- `registerUser`: validation rejects, `23505` → "email taken", success path.
- `requireUserId` gating (mock `auth()` → null session throws).

Integration test (optional, against Docker Postgres): credentials
signup → login.

## Build sequencing (for the implementation plan)

1. **Security backbone + gating UI together.** Schema migration (`accounts`, new
   `users` columns, partial index), `withTransaction` in `lib/db.ts`, remove
   `CURRENT_USER_ID`, make `currentUserId` nullable (incl. `data-context.tsx` +
   the `app-provider.tsx` hardcoded labels), the `mine` fix (drop from
   `TASTING_COLS`), add `requireUserId`/`getCurrentUserId`, gate the three
   actions — **and the logged-out CTAs in the same step.** Rationale: a stub
   `requireUserId` that throws makes every write fail; if the gating UI doesn't
   land together, step 1 leaves the app build-passing but write-broken and
   untestable. With both, logged-out is a coherent, testable state from step 1.
2. **Auth.js providers** — `auth.ts` (+ type augmentation), the route handler,
   Credentials `authorize` (dummy-hash path), `registerUser` server action, the
   `jwt` resolve-or-create upsert (savepoint retry, first-call guard), `session`
   callback, `bcryptjs`, Vitest + unit tests. `requireUserId` becomes real here.
3. **Auth UI** — `/login`, `/signup` (wired to `signIn`/`registerUser`),
   sign-out, already-authenticated redirects; `SETUP.md` / `.env.example` /
   `README.md` updates.

## Out of scope / deferred (future hardening)

- **JWT revocation** via a `sessionVersion` claim checked against `users`.
  **Residual risk (stated honestly — this is now a multi-user app, not
  single-owner):** there is no way to log out one compromised/abused account; a
  stolen JWT is valid until expiry, a password reset does **not** invalidate
  existing sessions, and rotating `AUTH_SECRET` is an all-users logout. Accepted
  for v1; revisit if the user base grows. Use a short session `maxAge` to bound
  exposure.
- **Account deletion** is out of scope; note that deleting a `users` row while a
  JWT is live yields a raw FK `23503` on the next write (`tastings.user_id` has
  no cascade) — handle when deletion is built.
- **Explicit account-linking** UX (link Google/GitHub/password that share an
  email) and the email-verification flows it requires.
- **Denormalization cleanup** beyond `mine`: `tastings.likes` count drift vs the
  `likes` table, and `users.tastings/followers` counters. Pre-existing; noted
  but not addressed here.
