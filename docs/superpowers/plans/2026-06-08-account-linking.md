# Account-Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Checkbox (`- [ ]`) steps. Green at each commit.

**Goal:** Let a logged-in user connect/disconnect Google & GitHub and add/remove a password on ONE account (always keeping ≥1 method), hand-rolled in no-adapter Auth.js v5. Spec: `docs/superpowers/specs/2026-06-08-account-linking-design.md`.

**Architecture:** Lazy-init `auth.ts` so the `signIn` callback can read a per-provider link-nonce cookie via the `req` closure. The link decision lives in the `signIn` callback: validate+consume the nonce, atomically link to the **nonce's** user, and **return a redirect string** (no throw → clean reject + preserves the actor's session). Server actions handle disconnect/password with atomic, race-safe SQL guards + `bumpSessionVersion` re-stamped via `unstable_update`.

**Tech Stack:** Next.js 15 App Router, Auth.js v5 (`next-auth@5.0.0-beta.31`, JWT, no adapter), raw `pg`, Drizzle (migrations only), Vitest.

**Verification:** unit + integration (`coffee-pg` up) + `tsc` + `lint` + drizzle drift + a controller-driven live OAuth pass (incl. the session-preservation spike).

**Cuts:** (0) lazy-init refactor + live spike → (1) migration 0006 + link-tokens + getAuthMethods → (2) linkOAuthStart + signIn-callback link branch → (3) disconnect/removePassword/setPassword guards → (4) Settings UI → (5) live verify + PR.

## File structure

- **Create:** `lib/link-tokens.ts`, `lib/account-link-repo.ts`, `app/account-link-actions.ts`, `drizzle/0006_*.sql` (generated), `test/account-linking.test.ts`, `test/integration/account-linking.test.ts`.
- **Modify:** `auth.ts` (lazy init + signIn link branch), `lib/db/schema.ts` (link_tokens), `lib/signup-validation.ts` (extract `validatePassword`), `lib/register-errors.ts` (map handle? already maps email; reuse), `components/settings.tsx` + `app/(app)/settings/page.tsx` + `settings-client.tsx` (Sign-in methods UI).

---

## Cut 0 — Lazy-init auth.ts + session-preservation spike

### Task 1: Refactor `auth.ts` to the lazy-init factory (behavior-preserving)

**Files:** Modify `auth.ts`; Test `test/account-linking.test.ts` (create).

- [ ] **Step 1: Failing structural test** (`test/account-linking.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("auth.ts lazy init", () => {
  const src = read("auth.ts");
  it("uses the NextAuth(async (req) => config) factory form", () => {
    expect(src).toMatch(/NextAuth\(\s*async\s*\(\s*req/);
  });
  it("still exports the handlers + exposes unstable_update", () => {
    expect(src).toMatch(/export const \{[^}]*handlers[^}]*\} = NextAuth/);
    expect(src).toMatch(/unstable_update/);
  });
});
```

- [ ] **Step 2: Run → fail.** `npx vitest run test/account-linking.test.ts`

- [ ] **Step 3: Refactor `auth.ts`** — wrap the existing config object in `NextAuth(async (req) => ({ ... }))`. Keep EVERY existing provider/callback identical (Credentials authorize, jwt, session). Add `req` param (unused for now — a later task reads `req.cookies`). Destructure `unstable_update`:

```ts
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth(async (req) => ({
  session: { strategy: "jwt", maxAge: 1800 },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [ /* …unchanged Google, GitHub, Credentials… */ ],
  callbacks: { /* …unchanged jwt, session… */ },
}));
```

(`req` is the `NextRequest` on the OAuth-callback Route Handler, `undefined` when called from a server action's `signIn()` — both correct. The factory body runs per-request; the provider list + callbacks are rebuilt each call, which is fine.)

- [ ] **Step 4: Run → pass; full suite + tsc + build (no-DB).** The refactor changes no behavior — `test/auth-guard.test.ts`, `test/middleware.test.ts`, login/oauth tests must stay green.

- [ ] **Step 5: Commit.** `git add -A && git commit -m "refactor(auth): lazy-init NextAuth factory (req closure) + expose unstable_update"`

### Task 2: Live spike — confirm a `signIn`-callback string return preserves the actor's session

**Files:** temporary edit to `auth.ts` (reverted at end). No commit of the probe.

- [ ] **Step 1:** Temporarily add a `signIn` callback to the lazy config that, when `req?.cookies?.get("link_probe")` is set, returns the string `"/settings?probe=1"` (no DB writes):

```ts
async signIn({ account }) {
  if (req?.cookies?.get("link_probe")?.value && account?.provider === "google") return "/settings?probe=1";
  return true;
},
```

- [ ] **Step 2:** Build + start a prod server (AUTH_URL set, real Google creds in `.env.local`). Log in as user A (credentials). In devtools set a `link_probe=1` cookie. Trigger a Google sign-in (`/api/auth/signin/google` or a temp button).
- [ ] **Step 3: OBSERVE** — after the Google round-trip + the `/settings?probe=1` redirect: is the session **still user A** (string-return short-circuited sign-in → session preserved), or was it switched to the Google identity / a new user?
  - **Session preserved → PATH A** (primary): the link write + reject live in the `signIn` callback; `jwt` untouched. Cuts 2-3 below use Path A.
  - **Session switched / errored → PATH B** (fallback): `signIn` returns `true`; the **`jwt`** callback consumes the nonce, links, and sets `token.uid = nonce.userId` + `token.sv = live session_version`; reject is surfaced via a `pages.error: "/settings"` mapping. (Path B code deltas are noted inline in Cut 2.)
- [ ] **Step 4:** Revert the probe edit (`git checkout auth.ts` keeps the Task-1 lazy-init commit). Record the chosen path in the PR description + at the top of Cut 2. **Do not proceed to Cut 2 until the path is decided.**

---

## Cut 1 — link_tokens table + lib + getAuthMethods

### Task 3: `link_tokens` table (migration 0006)

**Files:** Modify `lib/db/schema.ts`; generate `drizzle/0006_*.sql`.

- [ ] **Step 1: Add to `lib/db/schema.ts`** (mirror `verificationTokens`):

```ts
export const linkTokens = pgTable(
  "link_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lt_token_hash_uq").on(t.tokenHash),
    index("lt_user_id_idx").on(t.userId),
    index("lt_expires_at_idx").on(t.expiresAt),
  ],
);
```

- [ ] **Step 2: Generate + apply.** `npx drizzle-kit generate --name link_tokens` → `drizzle/0006_*.sql` (a `CREATE TABLE link_tokens` + FK + 3 indexes, mirroring 0004). `npm run db:setup && npx drizzle-kit check` → migrate ok, `Everything's fine`.
- [ ] **Step 3: Migrate the test DB too** so integration tests see it: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coffee_tracker_test npx tsx scripts/db-setup.ts`.
- [ ] **Step 4: Commit.** `git add lib/db/schema.ts drizzle/ && git commit -m "feat(linking): migration 0006 — link_tokens table"`

### Task 4: `lib/link-tokens.ts` (HMAC single-use, provider-scoped)

**Files:** Create `lib/link-tokens.ts`; extend `test/account-linking.test.ts`.

- [ ] **Step 1: Failing test** (add to `test/account-linking.test.ts`) — structural (the real consume is covered by the integration test):

```ts
describe("link-tokens lib", () => {
  const src = read("lib/link-tokens.ts");
  it("HMAC-binds to AUTH_SECRET and consumes provider-scoped + single-use", () => {
    expect(src).toMatch(/createHmac\("sha256", process\.env\.AUTH_SECRET/);
    expect(src).toMatch(/delete from link_tokens where token_hash = \$1 and provider = \$2 and expires_at > now\(\)/i);
    expect(src).toMatch(/delete from link_tokens where user_id = \$1 and provider = \$2/i); // prior-per-user-provider
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Create `lib/link-tokens.ts`** (mirror `lib/verification-tokens.ts`, but provider-scoped):

```ts
import "server-only";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import type { Queryable } from "@/lib/users-repo";

const TTL = "10 minutes";

function hashToken(raw: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(raw).digest("hex");
}

/** Mint a single-use link nonce for (userId, provider); drop any prior one for that
 *  pair (one live link attempt per provider). Returns the raw token (goes in the cookie). */
export async function createLinkToken(db: Queryable, userId: string, provider: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.query(`delete from link_tokens where user_id = $1 and provider = $2`, [userId, provider]);
  await db.query(
    `insert into link_tokens (id, user_id, provider, token_hash, expires_at)
     values ($1, $2, $3, $4, now() + $5::interval)`,
    [`lt-${randomUUID()}`, userId, provider, hashToken(raw), TTL],
  );
  if (Math.random() < 0.01) {
    Promise.resolve(db.query(`delete from link_tokens where expires_at < now()`)).catch(() => {});
  }
  return raw;
}

/** Atomic single-use consume scoped to provider. Returns the userId or null. */
export async function consumeLinkToken(db: Queryable, raw: string, provider: string): Promise<{ userId: string } | null> {
  const { rows } = await db.query(
    `delete from link_tokens where token_hash = $1 and provider = $2 and expires_at > now() returning user_id`,
    [hashToken(raw), provider],
  );
  const row = rows[0] as { user_id: string } | undefined;
  return row ? { userId: row.user_id } : null;
}
```

- [ ] **Step 4: Run → pass; tsc.**

### Task 5: `getAuthMethods` (`lib/account-link-repo.ts`)

**Files:** Create `lib/account-link-repo.ts`; Test `test/integration/account-linking.test.ts` (create).

- [ ] **Step 1: Create `lib/account-link-repo.ts`** with `getAuthMethods`:

```ts
import "server-only";
import { query } from "@/lib/db";

/** The user's live sign-in methods for the Settings UI. */
export async function getAuthMethods(userId: string): Promise<{ hasPassword: boolean; providers: string[] }> {
  const [u, a] = await Promise.all([
    query<{ has: boolean }>(`select password_hash is not null as has from users where id = $1`, [userId]),
    query<{ provider: string }>(`select provider from accounts where user_id = $1 order by provider`, [userId]),
  ]);
  return { hasPassword: u.rows[0]?.has ?? false, providers: a.rows.map((r) => r.provider) };
}
```

- [ ] **Step 2: Integration test** (`test/integration/account-linking.test.ts`) — model on `test/integration/scoped-queries.test.ts` (the `vi.mock("@/lib/auth")` first + `testPool` + truncate-incl-`accounts`+`link_tokens` pattern). Assert: a user with a password + a google account → `{ hasPassword: true, providers: ["google"] }`; an oauth-only user → `{ hasPassword: false, providers:[...] }`. Also test `consumeLinkToken` (provider-scoped single-use: a second consume returns null; wrong provider returns null).

- [ ] **Step 3: Run integration** (`coffee-pg` up): `npm run test:integration` → green. tsc. **Commit Cut 1:** `git add -A && git commit -m "feat(linking): link-tokens lib + getAuthMethods"`

---

## Cut 2 — linkOAuthStart + signIn-callback link branch

> **PATH (from Task 2):** the code below is **Path A** (link in the `signIn` callback, return redirect string). If Task 2 chose **Path B**, the link write + `token.uid`/`token.sv` set move into the `jwt` callback and `signIn` returns `true`/redirect only for reject; the SQL + cookie are identical.

### Task 6: `linkAccount` repo fn (atomic, takeover-safe)

**Files:** Modify `lib/account-link-repo.ts`; extend `test/integration/account-linking.test.ts`.

- [ ] **Step 1: Add `linkAccount` to `lib/account-link-repo.ts`** — insert in a transaction; 23505 re-read decides idempotent-vs-reject:

```ts
import { randomUUID } from "node:crypto";
import { withTransaction } from "@/lib/db";

/** Link (provider, providerAccountId) to userId. Returns "linked" | "already" | "taken".
 *  unique(provider, provider_account_id) is the real guard; the pre-check is advisory. */
export async function linkAccount(provider: string, providerAccountId: string, userId: string): Promise<"linked" | "already" | "taken"> {
  return withTransaction(async (c) => {
    const existing = await c.query(
      `select user_id from accounts where provider = $1 and provider_account_id = $2`,
      [provider, providerAccountId],
    );
    if (existing.rows.length) {
      return (existing.rows[0] as { user_id: string }).user_id === userId ? "already" : "taken";
    }
    try {
      await c.query(
        `insert into accounts (id, user_id, type, provider, provider_account_id)
         values ($1, $2, $3, $4, $5)`,
        [`acc-${randomUUID()}`, userId, "oauth", provider, providerAccountId],
      );
      return "linked";
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
      const row = await c.query(`select user_id from accounts where provider = $1 and provider_account_id = $2`, [provider, providerAccountId]);
      return (row.rows[0] as { user_id: string } | undefined)?.user_id === userId ? "already" : "taken";
    }
  });
}
```

- [ ] **Step 2: Integration tests:** link to U attaches the row to U; a second identical link → `"already"`; a link of a `(provider, id)` already owned by V (with userId=U) → `"taken"` and the row still belongs to V. Run → green.

### Task 7: `linkOAuthStart` action + the `signIn` link branch

**Files:** Create `app/account-link-actions.ts`; Modify `auth.ts`; extend `test/account-linking.test.ts`.

- [ ] **Step 1: Failing structural test** (add): `app/account-link-actions.ts` sets the cookie immediately before `signIn` and `auth.ts` reads the per-provider cookie + calls `consumeLinkToken`/`linkAccount`:

```ts
describe("link start + signIn branch", () => {
  it("sets the per-provider Lax cookie right before signIn", () => {
    const src = read("app/account-link-actions.ts");
    expect(src).toMatch(/link_nonce_/);
    expect(src).toMatch(/sameSite:\s*"lax"/);
    expect(src).toMatch(/httpOnly:\s*true/);
    // cookie set is the statement before signIn (no try/catch around signIn)
    expect(src).toMatch(/cookies\(\)[\s\S]{0,400}signIn\(/);
  });
  it("auth.ts link branch reads the per-provider cookie + consumes + links + redirect-strings", () => {
    const src = read("auth.ts");
    expect(src).toMatch(/link_nonce_/);
    expect(src).toMatch(/consumeLinkToken/);
    expect(src).toMatch(/linkAccount/);
    expect(src).toMatch(/\/settings\?linkError=taken/);
  });
});
```

- [ ] **Step 2: Create `app/account-link-actions.ts`** with `linkOAuthStart` (validate provider, mint nonce, set cookie, signIn):

```ts
"use server";
import { cookies } from "next/headers";
import { signIn } from "@/auth";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { createLinkToken } from "@/lib/link-tokens";

const poolDb = { query: (text: string, params?: unknown[]) => pool.query(text, params) };
const LINKABLE = new Set(["google", "github"]);

export async function linkOAuthStart(provider: string): Promise<void> {
  const uid = await requireUserId();
  if (!LINKABLE.has(provider)) throw new Error("Unsupported provider");
  const raw = await createLinkToken(poolDb, uid, provider);
  // Set-cookie MUST be immediately before signIn (no try/catch): both Set-Cookie
  // headers ride the one 302 to the provider; SameSite=Lax survives the top-level
  // OAuth redirect back to /api/auth/callback.
  (await cookies()).set(`link_nonce_${provider}`, raw, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 600 });
  await signIn(provider, { redirectTo: "/settings" }); // redirect throws — last statement
}
```

- [ ] **Step 3: Add the `signIn` callback link branch to `auth.ts`** (inside the lazy config; Path A). It runs in the OAuth-callback request, so `req.cookies` is present:

```ts
async signIn({ account }) {
  // Only OAuth callbacks; credentials sign-in has no link nonce.
  if (!account || account.type === "credentials") return true;
  const raw = req?.cookies?.get(`link_nonce_${account.provider}`)?.value;
  if (!raw) return true; // normal OAuth login/signup → jwt resolves as today
  // LINK PATH. Clear the cookie + consume the nonce atomically.
  (await import("next/headers")).cookies().then((c) => c.delete(`link_nonce_${account.provider}`)).catch(() => {});
  const consumed = await consumeLinkToken(queryDb, raw, account.provider);
  if (!consumed) return "/settings?linkError=expired";
  const result = await linkAccount(account.provider, account.providerAccountId, consumed.userId);
  if (result === "taken") return "/settings?linkError=taken";
  // "linked" | "already": return a redirect STRING → short-circuits sign-in, so the
  // actor's existing session (consumed.userId) is preserved, no session switch.
  return "/settings?linked=1";
},
```

Add imports to `auth.ts`: `import { consumeLinkToken } from "@/lib/link-tokens";` and `import { linkAccount } from "@/lib/account-link-repo";` (`queryDb` already defined). **Path B delta:** if Task 2 chose B, `signIn` returns `true` on the link path and sets nothing; move the `consumeLinkToken`+`linkAccount` call into the `jwt` callback's `account` branch (before `resolveOrCreateOAuthUser`), and on success set `token.uid = consumed.userId; token.sv = (await getSessionVersion(queryDb, consumed.userId)) ?? 0; return token;` (skip `resolveOrCreateOAuthUser`); surface `taken`/`expired` via `pages.error: "/settings"`.

- [ ] **Step 4: tsc; lint; full unit suite.** **Commit Cut 2:** `git add -A && git commit -m "feat(linking): linkOAuthStart + signIn-callback link branch (atomic, redirect-string reject)"`

---

## Cut 3 — disconnect + removePassword + setPassword (atomic guards)

### Task 8: `unlinkAccount` + `removeUserPassword` (atomic last-method guard)

**Files:** Modify `lib/account-link-repo.ts`; extend `test/integration/account-linking.test.ts`.

- [ ] **Step 1: Add to `lib/account-link-repo.ts`** — single conditional SQL; `rowCount === 0` means the guard blocked it:

```ts
/** Remove an OAuth method iff ≥1 method remains. Returns true if removed. */
export async function unlinkAccount(userId: string, provider: string): Promise<boolean> {
  const { rowCount } = await query(
    `delete from accounts where user_id = $1 and provider = $2
       and ((select count(*) from accounts where user_id = $1) > 1
            or (select password_hash is not null from users where id = $1))`,
    [userId, provider],
  );
  return (rowCount ?? 0) > 0;
}

/** Remove the password iff ≥1 OAuth method remains. Returns true if removed. */
export async function removeUserPassword(userId: string): Promise<boolean> {
  const { rowCount } = await query(
    `update users set password_hash = null
     where id = $1 and password_hash is not null
       and (select count(*) from accounts where user_id = $1) > 0`,
    [userId],
  );
  return (rowCount ?? 0) > 0;
}
```

- [ ] **Step 2: Integration tests:** a user with password + google → `unlinkAccount(google)` true (password remains); an oauth-only user with ONE google → `unlinkAccount(google)` **false** (would be last); password-only user → `removeUserPassword` false; user with password+google → `removeUserPassword` true. Run → green.

### Task 9: `setUserPassword` (null/unverified-email guards, single UPDATE)

**Files:** Modify `lib/account-link-repo.ts`, `lib/signup-validation.ts`; extend tests.

- [ ] **Step 1: Extract `validatePassword` in `lib/signup-validation.ts`** (DRY — `validateSignup` calls it):

```ts
export function validatePassword(password: string): { ok: true } | { ok: false; error: string } {
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (new TextEncoder().encode(password).length > 72) return { ok: false, error: "Password is too long." };
  return { ok: true };
}
```

Replace the inline length checks in `validateSignup` with `const pw = validatePassword(input.password); if (!pw.ok) return { ok: false, error: pw.error };`.

- [ ] **Step 2: Add `setUserPassword` to `lib/account-link-repo.ts`** — guards then single UPDATE:

```ts
/** Add a password to an OAuth-only account. Returns "" on success or a user-facing error. */
export async function setUserPassword(userId: string, passwordHash: string): Promise<string> {
  const { rows } = await query<{ has: boolean; email: string | null; verified: boolean }>(
    `select password_hash is not null as has, email, email_verified is not null as verified from users where id = $1`,
    [userId],
  );
  const u = rows[0];
  if (!u) return "Account not found.";
  if (u.has) return "You already have a password.";
  if (!u.email) return "Add an email to your account before setting a password.";
  if (!u.verified) return "Verify your email before adding a password.";
  try {
    await query(`update users set password_hash = $2 where id = $1`, [userId, passwordHash]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return "An account with that email already has a password.";
    throw e;
  }
  return "";
}
```

(The partial `users_email_lower_uq` (WHERE `password_hash IS NOT NULL`) fires when `password_hash` flips non-null → 23505 if the email collides with a credential user; mapped to the friendly string.)

- [ ] **Step 3: Integration tests:** oauth user with verified email → `setUserPassword` returns `""` and `has_password` flips true; oauth user with NULL email → returns the "add an email" error, no write; oauth user with unverified email → "verify your email" error; a second `setUserPassword` (now has password) → "already have a password"; email collision with an existing credential user → the 23505 friendly error. Run → green.

### Task 10: The disconnect/password server actions

**Files:** Modify `app/account-link-actions.ts`; extend `test/account-linking.test.ts`.

- [ ] **Step 1: Failing structural test** (add): the actions bump+`unstable_update` on removal and guard last-method:

```ts
describe("disconnect / password actions", () => {
  const src = read("app/account-link-actions.ts");
  it("removal bumps session_version then re-stamps via unstable_update", () => {
    expect(src).toMatch(/bumpSessionVersion/);
    expect(src).toMatch(/unstable_update/);
  });
  it("returns the last-method error string", () => {
    expect(src).toMatch(/at least one sign-in method/i);
  });
});
```

- [ ] **Step 2: Add the actions to `app/account-link-actions.ts`:**

```ts
import { unstable_update } from "@/auth";
import { hashPassword } from "@/lib/passwords";
import { validatePassword } from "@/lib/signup-validation";
import { bumpSessionVersion, getSessionVersion } from "@/lib/users-repo";
import { unlinkAccount, removeUserPassword, setUserPassword } from "@/lib/account-link-repo";

const queryDb = poolDb; // same wrapper

/** Revoke OTHER devices (bump) but keep this session live (re-stamp its JWT). */
async function bumpAndKeepCurrent(userId: string): Promise<void> {
  await bumpSessionVersion(poolDb, userId);
  await unstable_update({ sessionVersion: (await getSessionVersion(queryDb, userId)) ?? 0 });
}

export async function unlinkOAuth(provider: string): Promise<{ error: string }> {
  const uid = await requireUserId();
  if (!(await unlinkAccount(uid, provider))) return { error: "You must keep at least one sign-in method." };
  await bumpAndKeepCurrent(uid);
  return { error: "" };
}

export async function removePassword(): Promise<{ error: string }> {
  const uid = await requireUserId();
  if (!(await removeUserPassword(uid))) return { error: "You must keep at least one sign-in method." };
  await bumpAndKeepCurrent(uid);
  return { error: "" };
}

export async function setPassword(password: string): Promise<{ error: string }> {
  const uid = await requireUserId();
  const v = validatePassword(password);
  if (!v.ok) return { error: v.error };
  const err = await setUserPassword(uid, await hashPassword(password));
  return { error: err };
}
```

(`session({ session, token })` must keep mapping `token.sv` → `session.sessionVersion` so `unstable_update({ sessionVersion })` re-stamps correctly; it already does. If Task 2/live shows `unstable_update` can't set `sv`, fall back to `signOut({ redirectTo: "/login?reason=disconnected" })` after the bump — documented intentional logout.)

- [ ] **Step 3: tsc; lint; suite. Commit Cut 3:** `git add -A && git commit -m "feat(linking): unlink/removePassword (atomic last-method guard) + setPassword + bump+unstable_update"`

---

## Cut 4 — Settings "Sign-in methods" UI

### Task 11: Settings section + server-fetch

**Files:** Modify `app/(app)/settings/page.tsx`, `settings-client.tsx`, `components/settings.tsx`; extend `test/account-linking.test.ts`.

- [ ] **Step 1:** `app/(app)/settings/page.tsx` already server-fetches `discoverable` (Public Profiles). Add `getAuthMethods(uid)` and pass it:

```tsx
import { getAuthMethods } from "@/lib/account-link-repo";
// in SettingsPage, after the uid guard:
const [discoverable, authMethods] = await Promise.all([getDiscoverable(uid), getAuthMethods(uid)]);
return <SettingsClient discoverable={discoverable} authMethods={authMethods} />;
```

`settings-client.tsx`: add `authMethods: { hasPassword: boolean; providers: string[] }` to the props and pass through to `SettingsScreen`.

- [ ] **Step 2:** `components/settings.tsx` — add `authMethods` to the props and a **"Sign-in methods"** `<section>` before "Public profile". For each of `google`/`github`: if linked → a `Disconnect` button (`<form action={unlinkOAuth.bind(null, provider)}>`), else a `Connect` button (`<form action={linkOAuthStart.bind(null, provider)}>`). For password: if `hasPassword` → a `Remove password` button (`removePassword`), else an inline add-password field posting to `setPassword`. Compute `methodCount = (hasPassword?1:0) + providers.length`; **disable** every removal control when `methodCount <= 1` with a hint "You must keep at least one sign-in method." Read `?linked=1`/`?linkError=<code>` from `useSearchParams` → a toast/inline note.

(Show the actual control code in the implementation; mirror the existing `signOutAllDevices`/`setDiscoverable` `<form action={...}>` patterns already in this file.)

- [ ] **Step 3: tsc; lint; suite; build (no-DB). Commit Cut 4:** `git add -A && git commit -m "feat(linking): Settings Sign-in methods UI (connect/disconnect/add-remove password)"`

---

## Cut 5 — Live verification + PR

### Task 12: Controller-driven live verification + PR

- [ ] **Step 1: Green gate** — `npm test` (coffee-pg up) · `npm run build` · `npm run lint` · `npm run typecheck` · `npx drizzle-kit check`. All green.
- [ ] **Step 2: Seed** a credential user A (verified) + a separate Google-only user. Start prod (AUTH_URL + real Google/GitHub creds).
- [ ] **Step 3: Link** — as A, Settings → Connect Google → returns `/settings?linked=1`, **session still A**, Google now listed; `getAuthMethods` shows both.
- [ ] **Step 4: Takeover** — as A, try to connect the Google that already belongs to the other user → `/settings?linkError=taken`, no switch, the other user's row intact.
- [ ] **Step 5: Add-password** — as a Google-only (verified) user, add a password → can then log in at `/login` with email+password.
- [ ] **Step 6: Disconnect + revocation** — as A (logged in on two browsers), Disconnect Google in browser 1 → browser 1 **stays logged in** (unstable_update), browser 2 dies on next request (bump). Last-method removal is blocked.
- [ ] **Step 7: setPassword guards** — null-email (a GitHub no-email user) → "add an email" error; unverified → "verify your email" error.
- [ ] **Step 8:** in-harness `security-reviewer` + `pr-review-toolkit:code-reviewer` over `git diff main...HEAD` (no git-state changes). Apply real findings.
- [ ] **Step 9:** finishing-a-development-branch (PR) → post the `/code-review` summary comment. State the chosen Path (A/B) + the `unstable_update`-vs-signOut outcome in the PR body.

---

## Self-review notes
- **Spec coverage:** lazy-init+spike (T1,T2) ↔ §A; link_tokens (T3,T4) ↔ §D; getAuthMethods (T5) ↔ §C/§D; linkAccount+linkOAuthStart+signIn branch (T6,T7) ↔ §A/§B; unlink/removePassword/setPassword (T8,T9,T10) ↔ §B/§C; UI (T11) ↔ §E; live (T12) ↔ Testing. Guards: takeover (T6), atomic last-method (T8), setPassword null/unverified/23505 (T9), bump+unstable_update (T10).
- **Path A/B:** Task 2 decides; Cut 2/Cut 3 note the B deltas inline so neither path has placeholders.
- **Type consistency:** `getAuthMethods → {hasPassword, providers}` used in T5/T11; `linkAccount → "linked"|"already"|"taken"` used in T6/T7; `unlinkAccount`/`removeUserPassword → boolean`, `setUserPassword → string` (error) used in T8/T9/T10; `consumeLinkToken → {userId}|null` (T4/T7).
- **No placeholders.** Change-existing-password is out of scope (only add/remove).

---

## Revisions from the adversarial plan review (AUTHORITATIVE — supersede the tasks above)

All 4 lenses verdicted "execute with fixes" and **verified Path A is correct against `@auth/core` source** (a `signIn` string-return returns before `handleLoginOrRegister`/the session-cookie write — the actor's session is preserved, no switch). Apply ALL:

### R1 — jwt `trigger:"update"` branch (BLOCKER, all 4 lenses, verified): `unstable_update` is a no-op without it.
`auth.ts` jwt starts with `if (token.uid) return token`. On `unstable_update`, `@auth/core` calls `jwt({token, trigger:"update", session})` with a token that already has `uid` → it returns unchanged → `token.sv` is NEVER re-stamped → after `bumpSessionVersion` the actor's cookie keeps the OLD `sv` → `isLiveSession` (strict `===`) fails → **the actor is logged out** (defeating the whole `unstable_update` point). **Fix (do this in Task 1's lazy-init refactor):** add `trigger`/`session` to the jwt destructure and, as the **first** lines of the jwt callback (BEFORE `if (token.uid) return token`):
```ts
if (trigger === "update" && typeof session?.sessionVersion === "number") {
  token.sv = session.sessionVersion;
  return token;
}
```
Add a test asserting the re-stamp (e.g. an integration/structural check that the branch exists + sv flows). This must land regardless of anything else.

### R2 — Atomic last-method guard via row lock (BLOCKER, sql lens, verified MVCC): single-statement is NOT race-safe.
Two concurrent unlinks of DIFFERENT providers (google + github, no password) each snapshot `count=2` under READ COMMITTED → both delete → **zero methods, lockout**. The single statement only serializes same-row deletes. **Fix:** wrap `unlinkAccount` AND `removeUserPassword` in `withTransaction` with `SELECT id FROM users WHERE id = $1 FOR UPDATE` as the FIRST statement (serializes all method-removals for that user), then the conditional delete/update, then return `rowCount > 0`. Example for `unlinkAccount`:
```ts
export async function unlinkAccount(userId: string, provider: string): Promise<boolean> {
  return withTransaction(async (c) => {
    await c.query(`select id from users where id = $1 for update`, [userId]);
    const { rowCount } = await c.query(
      `delete from accounts where user_id = $1 and provider = $2
         and ((select count(*) from accounts where user_id = $1) > 1
              or (select password_hash is not null from users where id = $1))`,
      [userId, provider],
    );
    return (rowCount ?? 0) > 0;
  });
}
```
`removeUserPassword` mirrors it (FOR UPDATE, then the guarded UPDATE). The integration "concurrency" test now actually holds.

### R3 — Cookie `secure` flag (CONCERN, real dev footgun): don't hardcode `true`.
`secure: true` is dropped by browsers over http localhost → the link_nonce never reaches the callback → the flow silently MERGES the actor into the OAuth identity. Auth.js derives `secure` from the URL. **Fix (Task 7):** `secure: process.env.NODE_ENV === "production"` (keep `httpOnly`, `sameSite:"lax"`, `path:"/"`, `maxAge:600`).

### R4 — Drop the in-callback cookie delete (CONCERN, unreliable): rely on DB single-use.
Mutating cookies via `next/headers` inside the `signIn` callback isn't merged onto Auth.js's own returned Response (it builds its own cookie jar) — the delete is a no-op and a smell. **Fix (Task 7 Step 3):** REMOVE the `(await import("next/headers")).cookies()...delete(...)` line entirely. `consumeLinkToken` (atomic `DELETE…RETURNING`) is the real single-use guard; the cookie expires at `maxAge=600`. The signIn callback's link branch becomes: read `req.cookies` → `if (!raw) return true` → consume → link → return redirect string.

### R5 — `setUserPassword` self-guarding UPDATE (CONCERN, TOCTOU): add `AND password_hash IS NULL`.
The SELECT-then-UPDATE can double-write under a self-race. **Fix (Task 9):** `update users set password_hash = $2 where id = $1 and password_hash is null` and check `rowCount === 0` → return "You already have a password." (keeps the friendly pre-checks for the null/unverified-email messages; the UPDATE clause is the atomic backstop). Keep the 23505→friendly-email-error catch.

### R6 — `linkAccount` uses the real `account.type` (CONCERN, data consistency): not literal "oauth".
Google's provider type is `oidc` (resolveOrCreateOAuthUser stores the real type). **Fix (Task 6/7):** thread `account.type` from the signIn callback into `linkAccount(provider, providerAccountId, userId, type)` and insert `type` (not the literal "oauth"), matching the signup path.

### R7 — Task 2 spike is now CONFIRMATION, not a gate (verified): proceed on Path A.
Source proves Path A. Keep the live spike (Task 2) as a one-time confirmation (log `req.cookies.get("link_nonce_google")` is non-empty in the callback + observe session preserved), but DO NOT block on it and DO NOT build Path B. Remove the "pick A vs B" framing; Path B stays only as a documented contingency if the live run contradicts the source (it won't).

### R8 — Flesh out the Settings UI (CONCERN, under-specified): concrete JSX in Task 11.
Provide the actual section: compute `const methodCount = (hasPassword ? 1 : 0) + providers.length;`. For each of `["google","github"]`: linked → `<form action={unlinkOAuth.bind(null, p)}><Button variant="outline" type="submit" disabled={methodCount <= 1}>Disconnect {label}</Button></form>`; not linked → `<form action={linkOAuthStart.bind(null, p)}><Button variant="outline" type="submit">Connect {label}</Button></form>`. Password row: `hasPassword` → a `removePassword` form (Button disabled when `methodCount <= 1`); else an inline `<input type="password">` + a `setPassword` form. A `useSearchParams()` read of `linked`/`linkError` → an inline note (map `taken`→"That account is already linked to another Cortado account.", `expired`→"That link expired — try again."). Mirror the existing `setDiscoverable`/`signOutAllDevices` `<form action>` blocks already in `components/settings.tsx`. Add a structural test asserting the section references `linkOAuthStart`, `unlinkOAuth`, `setPassword`, `removePassword` and the `methodCount <= 1` disable.

### R9 — Integration test skeleton (CONCERN): make Task 5 setup concrete.
`test/integration/account-linking.test.ts`: `const TABLES = "users, accounts, link_tokens";` truncated `restart identity cascade` in `beforeAll`/`afterAll` (FKs covered). `vi.mock("@/lib/auth", ...)` is needed ONLY if the test imports `app/account-link-actions.ts` (which pulls `@/auth`); the repo fns (`@/lib/account-link-repo`) import only `@/lib/db`, so a repo-only test needs no auth mock. Seed users/accounts directly via `pool.query`.

### R10 — Strengthen the cookie-ordering structural test (CONCERN, Task 7 Step 1).
The `/cookies()…signIn(/` proximity regex is weak. Add: `expect(read("app/account-link-actions.ts")).not.toMatch(/try\s*\{[\s\S]{0,800}signIn\(/)` (signIn must not be inside a try block — its redirect must throw uncaught).

### R11 — Docs/nits.
- Migration 0006 prose: "mirrors 0004's structure (id, user_id, token_hash, expires_at, created_at) with **`provider`** replacing `email`."
- `setUserPassword` 23505 keeps the inline "An account with that email already has a password." string (clearer than `mapRegisterError`'s generic); note the divergence is intentional. Catch only 23505, rethrow others.
- PR security note: the `?linkError=taken` reject is an accepted, low-value registration oracle (the actor already controls that OAuth identity) — documented decision, not an oversight.
