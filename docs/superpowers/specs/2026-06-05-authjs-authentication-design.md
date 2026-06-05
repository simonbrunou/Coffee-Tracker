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
- **Deploy target:** **publicly hosted, multi-user.** This keeps the full
  hardening set in scope — rate-limiting, the dummy-hash timing defense, and
  Vitest are all v1, not gold-plating (decided after a proportionality review).
- **Per-user revocation:** **write-path `sessionVersion` is in v1** (§6.11) — the
  council showed the check is cheap when placed at the auth boundary
  (`requireUserId`), not the `jwt` hot path. Only **read-path** revocation is
  deferred (see "Out of scope").

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
| `session_version` | `int not null default 0` | Bumped to revoke a user's JWTs (§ revocation). |
| `created_at` | `timestamptz not null default now()` | |

- **Partial unique index (explicitly named):** `create unique index
  users_email_lower_uq on users (lower(email)) where password_hash is not null;`
  — at most one password account per email, while OAuth rows may share an email.
  The name matters: `registerUser` branches on `err.constraint` to tell an email
  collision (`users_email_lower_uq`) from a handle collision (`users_handle_key`,
  the auto-name of `handle text not null unique`) — both surface as `23505`.
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

**Migration mechanics:** `scripts/db-setup.ts` drops & recreates from
`db/schema.sql` (no migration tooling). Add `drop table if exists accounts
cascade;` **before** `drop table if exists users cascade;` (the new FK), and
ensure `create table accounts` comes **after** `create table users`. No data to
preserve (seed is empty). The existing `users` insert loop in `db-setup.ts` is a
no-op once `USERS` is `[]`.

**Projection invariant (hard rule — this app is publicly hosted):**
`password_hash`, `email`, and `email_verified` are **never** added to any
client-facing projection. `getAppData` ships the full `getUsers()` result to
**every visitor, including logged-out ones**, and the migration is adding
sensitive columns to that same `users` table — so this is a live leak risk, not
hygiene. `getUsers` (`lib/queries.ts`) already selects an explicit safe column
list; keep it, and add a unit assertion that its column list excludes the three
sensitive columns so a future widening fails the test.

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

- `resolveOrCreateOAuthUser` runs inside **one** `withTransaction` (a plain
  `BEGIN`/`COMMIT` — no savepoints needed, see below): look up `accounts` by
  `(provider, providerAccountId)` → reuse `user_id`; else create a `users` row
  + an `accounts` row, returning our `users.id`. **No email lookup.** The two
  inserts must be atomic, or a crash between them orphans a `users` row with no
  `accounts` link and the next login creates a *second* user.
- **Handle generation (up-front, collision-proof — no retry loop):** generate
  `user_` + 10 random base36 chars (~52 bits) and insert once. At ~2.8e15
  combinations a collision is astronomically unlikely, so a handle `23505` is
  treated as a genuine (essentially never) error that propagates, **not** a
  designed control-flow path. This deletes the savepoint machinery entirely.
  Handles are non-PII and never derived from email/name (shared with
  `registerUser`).
- **Fails closed:** if the upsert throws (DB down, the ~never handle collision),
  the callback throws → Auth.js denies sign-in → no half-written user, no token.
  Prefer surfacing OAuth-create failure as `AccessDenied` (a `signIn` callback
  is an option if a clean denial page is wanted; `jwt` is acceptable but define
  the failure path).
- **First-call guard is intentional:** `if (token.uid) return token` must **not**
  add a live `users`-existence lookup — that would hit the DB on every request.
  A stale `uid` (deleted user) surfaces as a `23503` on the next write and is
  handled there (account deletion is out of scope; see deferred).

- **Credentials `authorize(creds)`**: `select id, password_hash, session_version
  from users where lower(email) = lower($1) and password_hash is not null`.
  **Always run a bcrypt compare** — if no row is found, compare against a **dummy
  hash** so the timing is identical (otherwise the early return is a
  user-enumeration timing oracle). On success return `{ id, sessionVersion }`; on
  any failure return **`null`** (Auth.js renders `CredentialsSignin` — a single
  uniform error; never throw provider-specific detail).

- **Stamp `token.sv` at sign-in:** in the `jwt` first-call branch, set
  `token.sv` alongside `token.uid` — from `user.sessionVersion` (credentials) or
  the value returned by `resolveOrCreateOAuthUser` (OAuth; new rows = 0). Used by
  the write-path revocation check (§ revocation / §3). Not re-read in the `jwt`
  callback (that keeps the first-call guard DB-free).

- `session` callback: `session.user.id = token.uid`; expose `token.sv` as
  `session.sessionVersion`.

- **Type augmentation** (required or the custom claims won't typecheck):
  ```ts
  declare module "next-auth" {
    interface Session { user: { id: string } & DefaultSession["user"]; sessionVersion: number }
  }
  declare module "next-auth/jwt" { interface JWT { uid: string; sv: number } }
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
`authorize()` auto-register).

- **Location & signature:** `registerUser` lives in a new `app/auth-actions.ts`
  (`"use server"`) — kept separate from `app/actions.ts` so the `/signup` client
  form imports only auth actions. Return contract:
  `registerUser(input): Promise<{ error: string }>` on a handled failure, or it
  **throws the redirect** on success (never returns). The form renders `error`
  when present.
- **Input + validation:** `name` (required, trimmed, length-bounded), `email`
  (required, format-checked, normalized to lowercase), `password` (policy:
  min 8 chars; reject > 72 **bytes** since bcrypt silently truncates there),
  optional `handle`.
- **Hash:** `bcrypt.hash(password, 12)`.
- **Handle:** if not supplied, generate via the **shared** up-front generator
  (`user_` + 10 random base36) — collision-proof, no retry; validate
  charset/length if user-supplied.
- **Avatar:** assign a default tint from the catalog palette (same strategy the
  OAuth upsert uses) — `users.avatar` is `NOT NULL`.
- **Insert + race:** `insert into users (...) values (...)` **then catch
  `23505`** (do **not** `SELECT`-then-`INSERT` — that's the race the index
  stops). Branch on `err.constraint`: `users_email_lower_uq` → return
  `{ error: "email already registered" }`; `users_handle_key` → (essentially
  never) regenerate once or surface a generic error.
- **After success — ordering matters:** the `signIn("credentials", { email,
  password, redirectTo: "/" })` call must be **outside** the INSERT's
  `try/catch`, because `signIn` throws the Next redirect (`NEXT_REDIRECT`) and it
  must not be swallowed by the `23505` handler. Any wrapping `try/catch` around
  `signIn` must re-throw `isRedirectError(e)`.
- **Acknowledged tension:** the "email already registered" response is itself a
  credential-account enumeration oracle. Accepted for usability; the dummy-hash
  timing defense on the *login* path (§2) still holds, so the two paths are
  consistent (signup leaks existence by design; login does not leak via timing).
- **Abuse:** signup and the credentials-login POST are unauthenticated public
  endpoints — rate-limited per §6.8 (this app is publicly hosted; bcrypt cost 12
  makes unthrottled login a CPU-DoS lever).

### 3. Current-user plumbing (replaces `CURRENT_USER_ID`)

- New `lib/auth.ts` (server-only helpers):
  - `getCurrentUserId(): Promise<string | null>` → `(await auth())?.user?.id ?? null`
  - `requireUserId(): Promise<string>` → throws if null, **and enforces
    revocation**: one indexed `select session_version from users where id=$1`,
    compared to the session's `sessionVersion`; mismatch (or no row) → treat as
    unauthenticated (throw). This is the write-path revocation gate — one PK
    lookup per mutation, **zero** added cost on read/navigation (the `jwt`
    first-call guard is untouched). Reads are **not** revocation-checked in v1
    (browse is public anyway; see deferred for read-path revocation).
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
- `lib/queries.ts`: **remove `mine` from `TASTING_COLS`**, **`lib/types.ts`:
  remove `mine` from the `Tasting` interface**, and `app/actions.ts:18`: stop
  writing `mine`. All three are required — dropping it from the SQL alone does
  **not** error (see §4); removing it from the *type* is what makes the read
  sites fail to compile.
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
`Tasting` type at `lib/types.ts:77`, seed). `getAppData` has a single caller,
`app/layout.tsx:46` (no-arg, internal session read — works in the async root
server component).

**New files (creation-only):** `auth.ts` (root NextAuth config + type
augmentation), `app/api/auth/[...nextauth]/route.ts`, `lib/auth.ts`
(`getCurrentUserId`/`requireUserId`), `app/auth-actions.ts` (`registerUser`),
`lib/rate-limit.ts` (§6.8), `app/login/page.tsx`, `app/signup/page.tsx`,
`vitest.config.ts`, `.env.example`. **Docs:** `SETUP.md`, `README.md` (drop the
"no auth / single user" line).

### 4. The `mine` correctness fix (independent of auth, detonated by it)

`tastings.mine` is a stored boolean hardcoded `true` at insert
(`app/actions.ts`). It is read directly by the UI (`components/cards.tsx`,
`components/screens.tsx` journal stats, `components/detail.tsx` profile). With a
single user this is harmless; with real multi-user it means **every user sees
every brew tagged "You."**

Fix: compute ownership at render as `tasting.userId === currentUserId` at **all
three** read sites — `components/cards.tsx:60` (`{tasting.mine && <Tag>You</Tag>}`),
`components/screens.tsx:141` and `components/detail.tsx:448` (both
`D.TASTINGS.filter(t => t.mine)`).

**The compile-time gate requires removing `mine` from the `Tasting` _type_, not
just the SQL.** `lib/db.ts` runs `pool.query<Tasting>(...)` — the row type is a
caller assertion, so dropping `mine` from `TASTING_COLS` alone leaves
`Tasting.mine: boolean` on the type and the read sites keep compiling (silently
getting `undefined` at runtime — a worse, silent regression). So: remove `mine`
from **`lib/types.ts` (`Tasting`)**, from **`TASTING_COLS`**, and stop writing it
in **`app/actions.ts`**. Only then do the three `t.mine` sites throw TS2339,
forcing each to switch to the ownership check. The DB column is kept
(reversible). This compile-time exhaustiveness is the entire security payoff.

### 5. UI

- `app/login/page.tsx` — email + password form, plus "Continue with Google" /
  "Continue with GitHub" buttons.
- `app/signup/page.tsx` — name, email, password (+ optional handle, else
  auto-generated), plus the OAuth buttons.
- **Sign-out:** a button in the sidebar user block (a `"use server"` form
  calling `signOut({ redirectTo: "/" })`).
- **Logged-out states (specified, not "or"):**
  - Sidebar user block (`app-provider.tsx:229-230`): when `me` is null, replace
    the name/handle with a **"Sign in" button** → `/login` (not dynamic labels).
  - `ProfileScreen` (`detail.tsx:458`, currently `if (!me) return null`):
    **redirect to `/login`** rather than rendering blank.
  - Write triggers (Log a brew, Add a bag, like): when `currentUserId` is null,
    the control routes to `/login` instead of opening the sheet.
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
3. **Handle generation:** random, non-PII, **up-front** (`user_` + 10 base36) —
   collision-proof, single insert, no retry loop / no savepoints (§2). Never
   derived from email/name.
4. **`getAppData` is session-aware:** logged-out → `currentUserId: null`,
   `likedIds: []`.
5. **`mine` computed, not trusted** (§4 — requires the `Tasting`-type removal).
6. **Credentials hygiene:** bcrypt cost ≥ 12; **uniform errors with a dummy-hash
   compare on the no-user path** (a bare early-return is a timing oracle — §2);
   `password_hash`/`email`/`email_verified` excluded from every client
   projection (§1 invariant + the `getUsers` column-list assertion).
7. **`trustHost: true` / pinned `AUTH_URL`** in prod; rely on Auth.js's default
   `httpOnly`/`SameSite=Lax`/`Secure`-prefix cookies + built-in CSRF knowingly
   (§2).
8. **Session `maxAge` (quantified — the load-bearing exposure bound):**
   `session: { strategy: "jwt", maxAge: 1800 }` (30-min rolling). Caps how long a
   stolen/stale token survives on any path not covered by per-user revocation,
   and is the fallback for whatever revocation is deferred (see "Out of scope").
9. **Rate-limiting (publicly hosted — required, fully specified):** `lib/rate-
   limit.ts` exporting `checkRateLimit(key): boolean`.
   - **Store:** module-level `Map<string, { count: number; resetAt: number }>`
     (in-memory, **per-instance** — documented limitation; swap to Postgres/KV
     if/when running multi-instance).
   - **Keys:** two independent windows checked per request — `ip:<ip>` and
     `email:<lowercased-email>`; either tripping blocks. IP from the forwarded
     header (trustHost-aware).
   - **Window / limit:** fixed 15-minute window; **10** attempts per key per
     window for both `/signup` and the credentials-login path.
   - **On trip:** the action returns `{ error: "Too many attempts, try again
     later." }` (login) or the signup `{ error }` shape — no bcrypt run, no DB
     hit. Called at the **top** of `registerUser` and inside Credentials
     `authorize()` before the DB lookup.
10. **Projection guard:** the §1 `getUsers` column-list assertion is the
   structural defense against `email`/`password_hash` drift — preferred over a
   separate `PublicUser` type (the explicit column list already *is* the
   projection; the test prevents it widening).
11. **Per-user revocation (write-path, in v1):** `users.session_version` stamped
   into the JWT (`token.sv`) at sign-in and re-checked in `requireUserId()` (§3).
   Bumping `session_version` (`update users set session_version =
   session_version + 1 where id=$1`) instantly invalidates that user's existing
   tokens for all **write** actions. v1 ships the mechanism + the check; the
   triggers wire to it as built — a "log out everywhere" / disable-account
   control, a future password-reset action (which bumps in the same statement),
   and immediate incident response via a manual bump. Cost: one `int` column +
   ~3 lines of token plumbing + one PK lookup per mutation. Read-path revocation
   is deferred (see "Out of scope").

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
`environment: "node"`, a `test` script in `package.json`, the `@/*` path alias —
via `vite-tsconfig-paths` or `resolve.alias` — so `@/lib/*` imports resolve, and
an alias/stub mapping the `server-only` import to an empty module since it throws
outside a Next bundle). Unit-test the pure logic:

- bcrypt hash / verify round-trip and failure; **dummy-hash timing path**.
- Handle generation (format + uniqueness of `user_` + 10 base36).
- `getUsers` column-list assertion (excludes `email`/`password_hash`/
  `email_verified`) — the §1 projection guard.
- `resolveOrCreateOAuthUser` (mock the `pg` client): reuse on existing
  `(provider, providerAccountId)`, create otherwise.
- `registerUser`: validation rejects, `23505` → "email taken", success path.
- `requireUserId` gating (mock `auth()` → null session throws; **and a
  `session_version` mismatch throws** — the write-path revocation check).

Integration test (optional, against Docker Postgres): credentials
signup → login.

## Build sequencing (for the implementation plan)

1. **Security backbone + gating UI together.** Schema migration (`accounts`, new
   `users` columns, partial index), `withTransaction` in `lib/db.ts`, remove
   `CURRENT_USER_ID`, make `currentUserId` nullable (incl. `data-context.tsx` +
   the `app-provider.tsx` labels), the `mine` fix (remove from `Tasting` type +
   `TASTING_COLS` + actions — §4), add `requireUserId`/`getCurrentUserId`, gate
   the three actions — **and the logged-out CTAs in the same step.** Rationale: a
   stub `requireUserId` that throws makes every write fail; if the gating UI
   doesn't land together, step 1 leaves the app build-passing but write-broken
   and untestable. With both, logged-out is a coherent, testable state.
2. **Auth.js providers** — `auth.ts` (+ type augmentation), the route handler,
   Credentials `authorize` (dummy-hash path), `registerUser` (`app/auth-
   actions.ts`), `lib/rate-limit.ts`, the `jwt` resolve-or-create upsert
   (first-call guard, plain `BEGIN`/`COMMIT`, up-front handle), `session`
   callback, `bcryptjs`, Vitest + unit tests. `requireUserId` becomes real here.
   **Once the base is stable, add the write-path `sessionVersion` check** (§6.11)
   to `requireUserId` + stamp `token.sv` — last, so it layers onto a working,
   tested auth core rather than complicating its bring-up.
3. **Auth UI** — `/login`, `/signup` (wired to `signIn`/`registerUser`),
   sign-out, already-authenticated redirects; `SETUP.md` / `.env.example` /
   `README.md` updates.

## Out of scope / deferred (future hardening)

- **Read-path JWT revocation.** v1 ships **write-path** revocation (§6.11): a
  revoked session is blocked from all mutations immediately. What's deferred is
  enforcing revocation on **reads** — a revoked user can still load authenticated
  read state (their own likes/journal view) until the token's `maxAge` (≤30 min)
  elapses. Closing this means adding the `session_version` check to `getAppData`
  (one extra parallel PK lookup per render — cheap, since `getAppData` already
  fans out 5 queries). **Residual risk:** read-only, bounded by `maxAge`; no
  write can be performed by a revoked session. Acceptable for v1; add the
  `getAppData` check if read-side leakage becomes a concern.
- **Account deletion** is out of scope; note that deleting a `users` row while a
  JWT is live yields a raw FK `23503` on the next write (`tastings.user_id` has
  no cascade) — handle when deletion is built.
- **Explicit account-linking** UX (link Google/GitHub/password that share an
  email) and the email-verification flows it requires.
- **Denormalization cleanup** beyond `mine`: `tastings.likes` count drift vs the
  `likes` table, and `users.tastings/followers` counters. Pre-existing; noted
  but not addressed here.
