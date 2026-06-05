# Auth.js v5 Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `CURRENT_USER_ID = "u1"` with real per-request authentication using Auth.js v5 (email+password, Google, GitHub), so Cortado is a publicly-hosted, multi-user coffee journal with public browse and gated writes.

**Architecture:** Auth.js v5 with the **JWT session strategy** (forced by the Credentials provider) and **no database adapter** — we persist users into the existing domain `users` table ourselves. OAuth identity keys on `(provider, providerAccountId)` (an `accounts` table), never on email — so there is no cross-provider account linking and no takeover vector. The current user's id is carried on the JWT (`token.uid`), surfaced as `session.user.id`, and read at the authorization boundary (`requireUserId()` in server actions, `getAppData()` in the layout). Per-user revocation rides a `users.session_version` claim checked on write paths.

**Tech Stack:** Next.js 15 App Router, React 19, raw `pg` (no ORM), Postgres (Docker), `next-auth@beta`, `bcryptjs`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-05-authjs-authentication-design.md` (read it first).

---

## Conventions for the implementer

- **Run commands from the repo root** `/home/sbrn/Projects/Coffee-Tracker`.
- **Database:** the local Docker Postgres `coffee-pg`; `npm run db:setup` drops & recreates from `db/schema.sql` (no migration tooling, no data to preserve — the seed is empty).
- **`.env*` files are blocked by a repo hook** — you cannot write them. Env vars are documented in `SETUP.md` / `.env.example`; the developer fills `.env.local` by hand. Where a task needs env to run, it says so.
- **TDD:** pure logic gets a failing test first. DB-touching and Auth.js-callback code is structured so the pure parts are unit-tested and the DB parts take an injected client (tested with a fake), with the wiring verified by `tsc`/build.
- **Type-check** with `npx tsc --noEmit`. **Tests** with `npm test`.
- Commit after each task (messages end with the Co-Authored-By trailer the repo uses; omitted here for brevity — match existing history).

## File map (what each new/changed file is responsible for)

**New — pure logic (unit-tested directly):**
- `lib/passwords.ts` — `hashPassword`, `verifyPassword`, `DUMMY_HASH` (timing-safe no-user path).
- `lib/handles.ts` — `generateHandle()` (`user_` + 10 base36); `isValidHandle()`.
- `lib/avatar.ts` — `randomAvatarTint()` (pick from the catalog palette).
- `lib/rate-limit.ts` — `checkRateLimit(key)` fixed-window in-memory limiter.
- `lib/signup-validation.ts` — `validateSignup(input)` (pure field validation).

**New — server-only (DB ops; injected client → unit-testable with a fake):**
- `lib/users-repo.ts` — `findCredentialUserByEmail`, `createCredentialUser`, `resolveOrCreateOAuthUser`, `getSessionVersion`, `bumpSessionVersion`.

**New — Auth.js wiring:**
- `auth.ts` (repo root) — `NextAuth(...)` config + callbacks + TS module augmentation.
- `app/api/auth/[...nextauth]/route.ts` — re-exports `handlers`.
- `lib/auth.ts` (server-only) — `getCurrentUserId`, `requireUserId` (boundary + revocation check).
- `app/auth-actions.ts` — `registerUser` server action.

**New — UI:**
- `app/login/page.tsx`, `app/signup/page.tsx` — auth forms.

**New — infra/tests:**
- `vitest.config.ts`, `test/stubs/server-only.ts`, `test/**/*.test.ts`.
- `.env.example`.

**Modified:**
- `db/schema.sql` — `accounts` table, new `users` columns, named partial index, drops.
- `lib/db.ts` — add `withTransaction`.
- `lib/types.ts` — `AppData.currentUserId: string | null`; remove `Tasting.mine`.
- `lib/queries.ts` — session-aware `getAppData`; drop `mine` from `TASTING_COLS`.
- `lib/seed-data.ts` — remove `CURRENT_USER_ID` and the seeded user.
- `scripts/db-setup.ts` — drop the `CURRENT_USER_ID` import path (uses `USERS`, now `[]`).
- `app/actions.ts` — `requireUserId()` per action; stop writing `mine`.
- `components/data-context.tsx` — `currentUserId: string | null`; null-safe `user()` callers.
- `components/app-provider.tsx` — dynamic sidebar identity / Sign-in button; gate write triggers.
- `components/cards.tsx`, `components/screens.tsx`, `components/detail.tsx` — compute ownership from `userId`, not `mine`.
- `SETUP.md`, `README.md` — auth setup; drop "no auth / single user".

---

# Milestone 1 — Security backbone + gating UI

Outcome: the app runs fully **logged-out** (browse works; writes route to `/login`), `CURRENT_USER_ID` is gone, `currentUserId` is nullable end-to-end, and the `mine` cross-user bug is fixed with a compile-time gate. `requireUserId`/`getCurrentUserId` exist as **temporary stubs** (logged-out) until Milestone 2 wires Auth.js. The `/login` route itself arrives in Milestone 3 — mid-branch the gate target 404s; the branch is not deployed until all three milestones land.

## Task 1: Vitest test harness

**Files:**
- Create: `vitest.config.ts`, `test/stubs/server-only.ts`, `test/smoke.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install dev deps**

Run:
```bash
npm install -D vitest vite-tsconfig-paths
```

- [ ] **Step 2: Create the `server-only` stub**

`server-only` throws when imported outside a Next server bundle; alias it to an empty module in tests.

Create `test/stubs/server-only.ts`:
```ts
// Stub for the `server-only` package under Vitest (Node env, no Next bundle).
export {};
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths()], // resolves the @/* alias from tsconfig.json
  test: { environment: "node", include: ["test/**/*.test.ts"] },
  resolve: {
    alias: { "server-only": path.resolve(__dirname, "test/stubs/server-only.ts") },
  },
});
```

- [ ] **Step 4: Add test scripts to `package.json`**

In the `"scripts"` block add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 5: Write a smoke test**

Create `test/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run it**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts test package.json package-lock.json
git commit -m "test: add Vitest harness with @/ alias and server-only stub"
```

## Task 2: Schema — `accounts` table, new `users` columns, named index

**Files:**
- Modify: `db/schema.sql`

- [ ] **Step 1: Add the new `users` columns**

In `db/schema.sql`, the `create table users (...)` block currently ends with `bio text not null default ''`. Add the auth columns before the closing `);`:
```sql
  bio       text not null default '',
  email           text,                              -- display-only; NOT globally unique
  email_verified  timestamptz,
  image           text,                              -- OAuth avatar URL (distinct from avatar tint)
  password_hash   text,                              -- only credential users
  session_version int  not null default 0,           -- bump to revoke a user's JWTs
  created_at      timestamptz not null default now()
```

- [ ] **Step 2: Add the named partial unique index on email**

Immediately after the `create table users (...);` statement, add:
```sql
-- At most one *password* account per email; OAuth rows may share an email.
-- Named explicitly so registerUser can branch on err.constraint.
create unique index users_email_lower_uq on users (lower(email)) where password_hash is not null;
```

- [ ] **Step 3: Add the `accounts` table (after `users`, before `beans`)**

```sql
create table accounts (
  id                  text primary key,
  user_id             text not null references users(id) on delete cascade,
  type                text not null,              -- 'oauth' | 'oidc'
  provider            text not null,              -- 'google' | 'github'
  provider_account_id text not null,
  created_at          timestamptz not null default now(),
  unique (provider, provider_account_id)
);
```

- [ ] **Step 4: Add the `accounts` drop (correct order)**

At the top of the file, the drops run `likes → tastings → beans → users → roasters`. `accounts` references `users`, so it must drop **before** `users`. Add as the first drop:
```sql
drop table if exists accounts cascade;
drop table if exists likes cascade;
```

- [ ] **Step 5: Apply the schema**

Ensure Docker Postgres is up and `DATABASE_URL` is available (see `SETUP.md`). Run:
```bash
npm run db:setup
```
Expected: `✓ Schema created`, seed lines (0 roasters/users/beans/tastings/likes), `✅ Database ready.`

- [ ] **Step 6: Verify the new columns and index exist**

Run:
```bash
docker exec coffee-pg psql -U postgres -d coffee_tracker -c "\d+ users" -c "\di users_email_lower_uq" -c "\d accounts"
```
Expected: `users` shows `email`, `password_hash`, `session_version`, etc.; the partial unique index and `accounts` table exist.

- [ ] **Step 7: Commit**

```bash
git add db/schema.sql
git commit -m "feat(db): add accounts table + auth columns on users"
```

## Task 3: `withTransaction` in `lib/db.ts`

**Files:**
- Modify: `lib/db.ts`
- Test: `test/db.test.ts`

- [ ] **Step 1: Write the failing test**

The OAuth upsert needs an atomic multi-statement transaction. `withTransaction` acquires a client, runs `BEGIN`, the callback, then `COMMIT` — or `ROLLBACK` on throw — and always releases. Test with a fake pool.

Create `test/db.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { makeWithTransaction } from "@/lib/db";

function fakePool() {
  const calls: string[] = [];
  const client = {
    query: vi.fn(async (text: string) => { calls.push(text); return { rows: [] }; }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) };
  return { pool, client, calls };
}

describe("withTransaction", () => {
  it("commits and releases on success", async () => {
    const { pool, client, calls } = fakePool();
    const withTransaction = makeWithTransaction(pool as never);
    const result = await withTransaction(async (c) => { await c.query("select 1"); return 42; });
    expect(result).toBe(42);
    expect(calls).toEqual(["BEGIN", "select 1", "COMMIT"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back and releases on throw", async () => {
    const { pool, client, calls } = fakePool();
    const withTransaction = makeWithTransaction(pool as never);
    await expect(withTransaction(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(calls).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- db`
Expected: FAIL (`makeWithTransaction` is not exported).

- [ ] **Step 3: Implement**

Append to `lib/db.ts` (after the existing `query` export):
```ts
import type { PoolClient } from "pg";

/** Factory so the transaction helper is unit-testable with a fake pool. */
export function makeWithTransaction(p: Pick<Pool, "connect">) {
  return async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = (await p.connect()) as PoolClient;
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
}

/** App-wide transaction runner bound to the shared pool. */
export const withTransaction = makeWithTransaction(pool);
```

- [ ] **Step 4: Run it to verify pass**

Run: `npm test -- db`
Expected: PASS (2 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts test/db.test.ts
git commit -m "feat(db): add withTransaction helper"
```

## Task 4: Remove `CURRENT_USER_ID` and the seeded user; make `currentUserId` nullable; remove `Tasting.mine`

**Files:**
- Modify: `lib/seed-data.ts`, `lib/types.ts`

- [ ] **Step 1: Remove the seeded user and the constant in `lib/seed-data.ts`**

Replace lines 10–11 (the `CURRENT_USER_ID` doc + export) — delete them entirely. Then replace the `USERS` export (lines ~32–37) with an empty array:
```ts
export const ROASTERS: Roaster[] = [];

/** Users are created by signup / OAuth — none are seeded. */
export const USERS: User[] = [];

export const BEANS: Bean[] = [];
```
(Leave `FLAVORS`, `FLAVOR_COLORS`, `flavorColor`, `PROCESSES`, `ROAST_LEVELS`, `BREW_METHODS`, `TASTINGS`, `LIKED_SEED` as they are.)

- [ ] **Step 2: Make `AppData.currentUserId` nullable and remove `Tasting.mine`**

In `lib/types.ts`: in the `Tasting` interface, **delete** the line `mine: boolean;` (currently line 77). In `AppData`, change:
```ts
  currentUserId: string | null;
```

- [ ] **Step 3: Type-check to see the expected breakages**

Run: `npx tsc --noEmit`
Expected: FAIL — errors at `lib/queries.ts` (uses `CURRENT_USER_ID`, `mine` in `TASTING_COLS` type), `app/actions.ts` (`CURRENT_USER_ID`, writes `mine`), `components/cards.tsx:60`, `components/screens.tsx:141`, `components/detail.tsx:448` (`t.mine`), `components/data-context.tsx`/`components/app-provider.tsx` (`currentUserId` type). These are fixed in Tasks 5–9. This is the intended compile-time gate.

- [ ] **Step 4: Commit (red state is expected; the milestone compiles green after Task 9)**

```bash
git add lib/seed-data.ts lib/types.ts
git commit -m "refactor: remove CURRENT_USER_ID seed + Tasting.mine; nullable currentUserId"
```

## Task 5: Temporary `lib/auth.ts` stub + `app/actions.ts` gating

**Files:**
- Create: `lib/auth.ts`
- Modify: `app/actions.ts`

- [ ] **Step 1: Create the temporary auth helpers**

Until Milestone 2 wires Auth.js, the app is always logged-out. `lib/auth.ts`:
```ts
import "server-only";
// TEMPORARY (Milestone 1): no Auth.js yet, so nobody is authenticated.
// Milestone 2 replaces these with real auth() + session_version checks.

export async function getCurrentUserId(): Promise<string | null> {
  return null;
}

export async function requireUserId(): Promise<string> {
  throw new Error("Unauthenticated");
}
```

- [ ] **Step 2: Gate the three actions**

In `app/actions.ts`: remove `import { CURRENT_USER_ID } from "@/lib/seed-data";` and add `import { requireUserId } from "@/lib/auth";`.

`logBrew` — add as the first line of the body and replace `CURRENT_USER_ID`; also stop writing `mine` (the column keeps its `default false`):
```ts
export async function logBrew(input: LogBrewInput): Promise<Tasting> {
  const userId = await requireUserId();
  if (!input.beanId) throw new Error("logBrew: beanId is required");
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const id = `t-${randomUUID()}`;
  const { rows } = await query<Tasting>(
    `insert into tastings
       (id, user_id, bean_id, rating, brew, dose, ratio, temp, note, likes, comments, time)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, 'now')
     returning ${TASTING_COLS}`,
    [id, userId, input.beanId, rating, input.brew, input.dose, input.ratio, input.temp, input.note],
  );
  return rows[0];
}
```
(Note: removed `mine` from the insert column list and its `true` value, and the `'now'` literal stays. `TASTING_COLS` loses `mine` in Task 6, so this returning clause stays valid.)

`addBag` — first line:
```ts
  const userId = await requireUserId();
```
(`addBag` does not store a user id today; the call still enforces auth. Leave the rest unchanged.)

`toggleLike` — replace both `CURRENT_USER_ID` usages:
```ts
export async function toggleLike(tastingId: string, liked: boolean): Promise<void> {
  const userId = await requireUserId();
  if (liked) {
    await query(
      `insert into likes (user_id, tasting_id) values ($1, $2) on conflict do nothing`,
      [userId, tastingId],
    );
  } else {
    await query(`delete from likes where user_id = $1 and tasting_id = $2`, [userId, tastingId]);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts app/actions.ts
git commit -m "feat(auth): temporary requireUserId stub + gate write actions"
```

## Task 6: Session-aware `getAppData`; drop `mine` from `TASTING_COLS`

**Files:**
- Modify: `lib/queries.ts`

- [ ] **Step 1: Drop `mine` from `TASTING_COLS`**

In `lib/queries.ts`, `TASTING_COLS` currently ends `... time, mine`. Change it to end at `time` (remove `, mine`):
```ts
export const TASTING_COLS = `
  id, user_id as "userId", bean_id as "beanId", rating, brew, dose, ratio,
  temp, note, likes, comments, time`;
```

- [ ] **Step 2: Make `getAppData` read the session**

Replace the `import { CURRENT_USER_ID } from "./seed-data";` line with `import { getCurrentUserId } from "./auth";`, and rewrite `getAppData`:
```ts
export async function getAppData(): Promise<AppData> {
  const currentUserId = await getCurrentUserId();
  const [roasters, users, beans, tastings, likedIds] = await Promise.all([
    getRoasters(),
    getUsers(),
    getBeans(),
    getTastings(),
    currentUserId ? getLikedTastingIds(currentUserId) : Promise.resolve<string[]>([]),
  ]);
  return { roasters, users, beans, tastings, likedIds, currentUserId };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: `lib/queries.ts` and `app/actions.ts` errors are gone; remaining errors are only in `components/*` (Tasks 7–9).

- [ ] **Step 4: Commit**

```bash
git add lib/queries.ts
git commit -m "feat(queries): session-aware getAppData; drop mine from TASTING_COLS"
```

## Task 7: Fix the `mine` read sites (ownership via `userId`)

**Files:**
- Modify: `components/cards.tsx`, `components/screens.tsx`, `components/detail.tsx`

- [ ] **Step 1: `components/cards.tsx`**

The `TastingCard` receives `tasting` but not the current user. Add `useData` if not already imported (check the top of the file; `useData` comes from `./data-context`). Inside the component body (near the top, where `ago` etc. are computed) add:
```ts
  const D = useData();
  const isMine = tasting.userId === D.currentUserId;
```
Then replace line 60 `{tasting.mine && <Tag accent>You</Tag>}` with:
```tsx
            {isMine && <Tag accent>You</Tag>}
```

- [ ] **Step 2: `components/screens.tsx` (Journal)**

Replace line 141 `const mine = D.TASTINGS.filter((t) => t.mine);` with:
```ts
  const mine = D.currentUserId ? D.TASTINGS.filter((t) => t.userId === D.currentUserId) : [];
```

- [ ] **Step 3: `components/detail.tsx` (Profile)**

Replace line 448 `const mine = D.TASTINGS.filter((t) => t.mine);` with:
```ts
  const mine = D.currentUserId ? D.TASTINGS.filter((t) => t.userId === D.currentUserId) : [];
```

- [ ] **Step 4: Commit (type-check still red until Task 8 fixes data-context types)**

```bash
git add components/cards.tsx components/screens.tsx components/detail.tsx
git commit -m "fix: compute tasting ownership from userId, not stored mine"
```

## Task 8: `data-context.tsx` — nullable `currentUserId` + null-safe `user()` callers

**Files:**
- Modify: `components/data-context.tsx`, `components/detail.tsx`

- [ ] **Step 1: Widen the types in `data-context.tsx`**

Change the `DataApi` interface field (line 19) and the `DataProvider` prop type (line 40) both to:
```ts
  currentUserId: string | null;
```

- [ ] **Step 2: Null-guard the `user(currentUserId)` call in `detail.tsx`**

`detail.tsx:447` is `const me = D.user(D.currentUserId);` — `user()` takes `string`. Change to:
```ts
  const me = D.currentUserId ? D.user(D.currentUserId) : undefined;
```
(The existing `if (!me) return null;` below it already handles the undefined case; Task 9 changes the logged-out behavior to redirect.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: only `app-provider.tsx` errors remain (it passes `currentUserId` and reads `me`).

- [ ] **Step 4: Commit**

```bash
git add components/data-context.tsx components/detail.tsx
git commit -m "refactor: currentUserId is string | null through the data context"
```

## Task 9: `app-provider.tsx` — dynamic identity, Sign-in button, gated write triggers

**Files:**
- Modify: `components/app-provider.tsx`

- [ ] **Step 1: Add a router push helper and gate the write triggers**

`me` is already `users.find((u) => u.id === currentUserId)` (line 119) and is `undefined` when logged out. Add a gate: when there is no current user, write triggers route to `/login` instead of opening the sheet. Replace `openBrew`/`openAddBag` (lines 141–142):
```ts
  const openBrew = (beanId?: string) => {
    if (!currentUserId) return router.push("/login");
    setLog({ open: true, mode: "brew", preset: beanId ?? null });
  };
  const openAddBag = () => {
    if (!currentUserId) return router.push("/login");
    setLog({ open: true, mode: "bag", preset: null });
  };
```
And gate likes — at the top of `toggleLike` (line 121):
```ts
  const toggleLike = (id: string) => {
    if (!currentUserId) { router.push("/login"); return; }
    const willLike = !likes.has(id);
```

- [ ] **Step 2: Replace the hardcoded sidebar identity with a dynamic block / Sign-in button**

Replace the `nav-user` button block (lines 226–232) with:
```tsx
              {me ? (
                <button onClick={() => router.push("/profile")} className="nav-user" style={{ flex: 1, minWidth: 0 }}>
                  <Avatar user={me} size={36} />
                  <div style={{ textAlign: "left", minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{me.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--mocha)" }}>@{me.handle}</div>
                  </div>
                </button>
              ) : (
                <Button variant="outline" onClick={() => router.push("/login")} style={{ flex: 1 }}>
                  Sign in
                </Button>
              )}
```

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds. The whole milestone now compiles green.

- [ ] **Step 4: Manual smoke (logged-out)**

Run `npm run dev`, open the app. Expected: feed/discover render; the sidebar shows **Sign in**; clicking **Log a brew**, the FAB, **Add a bag**, or a like routes to `/login` (which 404s until Milestone 3 — expected mid-branch).

- [ ] **Step 5: Commit**

```bash
git add components/app-provider.tsx
git commit -m "feat(ui): dynamic sidebar identity + gate write triggers to /login"
```

---

# Milestone 2 — Auth.js core (providers, signup, rate-limit, revocation)

Outcome: real authentication works end-to-end at the server/data layer — credentials login, Google/GitHub OAuth, signup, rate-limiting, and write-path `session_version` revocation. `lib/auth.ts` stops being a stub. (UI forms come in Milestone 3, but you can exercise sign-in via the Auth.js default routes / tests.)

## Task 10: Install Auth.js + bcryptjs; document env

**Files:**
- Modify: `package.json`, `SETUP.md`
- Create: `.env.example`

- [ ] **Step 1: Install**

Run:
```bash
npm install next-auth@beta bcryptjs
npm install -D @types/bcryptjs
```

- [ ] **Step 2: Verify the installed `next-auth` major**

Run: `node -e "console.log(require('next-auth/package.json').version)"`
Expected: a `5.x` (beta) version. If callback signatures differ from this plan at implementation time, prefer the installed version's docs (Context7 `/websites/authjs_dev`) and adjust.

- [ ] **Step 3: Create `.env.example`**

```bash
# Auth.js — generate a secret with: npx auth secret  (or: openssl rand -base64 33)
AUTH_SECRET=
# Set in production (behind a proxy) or leave unset for localhost; trustHost is on.
# AUTH_URL=https://your-host/
# Google OAuth (console.cloud.google.com → Credentials → OAuth client)
#   Authorized redirect URI: <origin>/api/auth/callback/google
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
# GitHub OAuth (github.com/settings/developers → New OAuth App)
#   Authorization callback URL: <origin>/api/auth/callback/github
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
# Existing
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coffee_tracker
```

- [ ] **Step 4: Document in `SETUP.md`**

Add a short "Authentication" section: list the env vars above, note the developer must register Google + GitHub OAuth apps with the callback URLs `<origin>/api/auth/callback/{google,github}`, and that `.env.local` must be edited by hand (the assistant cannot write it).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example SETUP.md
git commit -m "build(auth): add next-auth@beta + bcryptjs; document env"
```

## Task 11: Password helpers (`lib/passwords.ts`)

**Files:**
- Create: `lib/passwords.ts`, `test/passwords.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, DUMMY_HASH } from "@/lib/passwords";

describe("passwords", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("hunter2-correct-horse");
    expect(hash).not.toBe("hunter2-correct-horse");
    expect(await verifyPassword("hunter2-correct-horse", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("right-password-123");
    expect(await verifyPassword("wrong-password-123", hash)).toBe(false);
  });

  it("DUMMY_HASH is a valid bcrypt hash that never matches realistic input", async () => {
    expect(DUMMY_HASH).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword("anything-at-all", DUMMY_HASH)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- passwords`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** A real cost-12 bcrypt hash of a random string, used to equalize timing on the
 *  no-user login path so credential login is not a user-enumeration oracle. */
export const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO3Q9p3l3w5b3p8u5dQz3sJ9b3kqg2pme";
```

- [ ] **Step 4: Run it to verify pass**

Run: `npm test -- passwords`
Expected: PASS (3 tests). (If the DUMMY_HASH assertion fails because the literal isn't a valid bcrypt string, regenerate it once with `node -e "console.log(require('bcryptjs').hashSync('dummy-no-match',12))"` and paste the result.)

- [ ] **Step 5: Commit**

```bash
git add lib/passwords.ts test/passwords.test.ts
git commit -m "feat(auth): password hash/verify + dummy hash for timing safety"
```

## Task 12: Handle + avatar helpers

**Files:**
- Create: `lib/handles.ts`, `lib/avatar.ts`, `test/handles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { generateHandle, isValidHandle } from "@/lib/handles";

describe("handles", () => {
  it("generates user_ + 10 base36 chars", () => {
    const h = generateHandle();
    expect(h).toMatch(/^user_[0-9a-z]{10}$/);
  });

  it("generates distinct handles across calls", () => {
    const set = new Set(Array.from({ length: 50 }, () => generateHandle()));
    expect(set.size).toBe(50);
  });

  it("validates user-supplied handles", () => {
    expect(isValidHandle("theo_brews")).toBe(true);
    expect(isValidHandle("ab")).toBe(false);            // too short
    expect(isValidHandle("Has Spaces")).toBe(false);
    expect(isValidHandle("nope!")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- handles`
Expected: FAIL.

- [ ] **Step 3: Implement `lib/handles.ts`**

```ts
import { randomBytes } from "node:crypto";

/** Non-PII, collision-proof handle: `user_` + 10 base36 chars (~52 bits). */
export function generateHandle(): string {
  let s = "";
  while (s.length < 10) {
    s += randomBytes(8).readUInt32BE(0).toString(36);
  }
  return "user_" + s.slice(0, 10);
}

/** 3–30 chars, lowercase letters/digits/underscore. */
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(handle);
}
```

- [ ] **Step 4: Implement `lib/avatar.ts`**

```ts
import { FLAVORS } from "@/lib/seed-data";

const TINTS = Object.values(FLAVORS);

/** Pick a default avatar tint (hex) for a new user. */
export function randomAvatarTint(): string {
  return TINTS[Math.floor(Math.random() * TINTS.length)] ?? "#b07a3c";
}
```

- [ ] **Step 5: Run it to verify pass**

Run: `npm test -- handles`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/handles.ts lib/avatar.ts test/handles.test.ts
git commit -m "feat(auth): handle generator/validator + avatar tint picker"
```

## Task 13: Signup validation (`lib/signup-validation.ts`)

**Files:**
- Create: `lib/signup-validation.ts`, `test/signup-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { validateSignup } from "@/lib/signup-validation";

describe("validateSignup", () => {
  it("accepts a good signup and normalizes email", () => {
    const r = validateSignup({ name: "  Theo ", email: "Theo@Example.COM", password: "longenough1", handle: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe("theo@example.com");
      expect(r.value.name).toBe("Theo");
    }
  });

  it("rejects a short password", () => {
    const r = validateSignup({ name: "Theo", email: "t@e.com", password: "short", handle: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects a password over 72 bytes", () => {
    const r = validateSignup({ name: "Theo", email: "t@e.com", password: "a".repeat(73), handle: "" });
    expect(r.ok).toBe(false);
  });

  it("rejects a malformed email and an invalid handle", () => {
    expect(validateSignup({ name: "T", email: "nope", password: "longenough1", handle: "" }).ok).toBe(false);
    expect(validateSignup({ name: "T", email: "t@e.com", password: "longenough1", handle: "Bad Handle" }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- signup-validation`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { isValidHandle } from "@/lib/handles";

export interface SignupInput { name: string; email: string; password: string; handle: string }
export interface CleanSignup { name: string; email: string; password: string; handle: string | null }
export type SignupResult = { ok: true; value: CleanSignup } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup(input: SignupInput): SignupResult {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) return { ok: false, error: "Please enter your name." };

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email." };

  const password = input.password;
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (new TextEncoder().encode(password).length > 72) return { ok: false, error: "Password is too long." };

  const handleRaw = input.handle.trim();
  const handle = handleRaw === "" ? null : handleRaw.toLowerCase();
  if (handle !== null && !isValidHandle(handle)) {
    return { ok: false, error: "Handle must be 3–30 lowercase letters, digits, or underscores." };
  }

  return { ok: true, value: { name, email, password, handle } };
}
```

- [ ] **Step 4: Run it to verify pass**

Run: `npm test -- signup-validation`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/signup-validation.ts test/signup-validation.test.ts
git commit -m "feat(auth): pure signup validation"
```

## Task 14: Rate limiter (`lib/rate-limit.ts`)

**Files:**
- Create: `lib/rate-limit.ts`, `test/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, __resetRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimit());

  it("allows up to the limit then blocks", () => {
    for (let i = 0; i < 10; i++) expect(checkRateLimit("ip:1.2.3.4")).toBe(true);
    expect(checkRateLimit("ip:1.2.3.4")).toBe(false);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < 10; i++) checkRateLimit("ip:a");
    expect(checkRateLimit("ip:a")).toBe(false);
    expect(checkRateLimit("ip:b")).toBe(true);
  });

  it("resets after the window", () => {
    const now = { t: 0 };
    const clock = () => now.t;
    for (let i = 0; i < 10; i++) checkRateLimit("ip:x", clock);
    expect(checkRateLimit("ip:x", clock)).toBe(false);
    now.t = 15 * 60 * 1000 + 1;
    expect(checkRateLimit("ip:x", clock)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- rate-limit`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// Fixed-window in-memory limiter. PER-INSTANCE ONLY — swap to Postgres/KV when
// running multiple instances. 10 attempts per key per 15-minute window.
const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 10;

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Returns true if the action is allowed (and records it); false if rate-limited. */
export function checkRateLimit(key: string, clock: () => number = Date.now): boolean {
  const now = clock();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= LIMIT) return false;
  b.count += 1;
  return true;
}

/** Test-only reset. */
export function __resetRateLimit(): void {
  buckets.clear();
}
```

- [ ] **Step 4: Run it to verify pass**

Run: `npm test -- rate-limit`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/rate-limit.ts test/rate-limit.test.ts
git commit -m "feat(auth): fixed-window in-memory rate limiter"
```

## Task 15: Users repository (`lib/users-repo.ts`)

**Files:**
- Create: `lib/users-repo.ts`, `test/users-repo.test.ts`

These functions take an injected query-runner (`Queryable`) so they unit-test with a fake and run in production against the pool or a transaction client.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { resolveOrCreateOAuthUser, findCredentialUserByEmail } from "@/lib/users-repo";

function fakeClient(responses: Array<{ rows: unknown[] }>) {
  const queries: Array<{ text: string; params: unknown[] }> = [];
  let i = 0;
  const client = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      queries.push({ text, params });
      return responses[i++] ?? { rows: [] };
    }),
  };
  return { client, queries };
}

describe("resolveOrCreateOAuthUser", () => {
  it("reuses the existing user when the account row exists", async () => {
    const { client, queries } = fakeClient([{ rows: [{ user_id: "u-existing" }] }]);
    const id = await resolveOrCreateOAuthUser(client, {
      provider: "github", providerAccountId: "gh-123", name: "Theo", email: "t@e.com", image: null, type: "oauth",
    });
    expect(id).toBe("u-existing");
    expect(queries).toHaveLength(1); // only the account lookup
  });

  it("creates a user + account when none exists", async () => {
    const { client, queries } = fakeClient([
      { rows: [] },          // account lookup → miss
      { rows: [] },          // insert users
      { rows: [] },          // insert accounts
    ]);
    const id = await resolveOrCreateOAuthUser(client, {
      provider: "google", providerAccountId: "g-9", name: "Mara", email: "m@e.com", image: "http://x/y", type: "oidc",
    });
    expect(id).toMatch(/^u-/);
    expect(queries[1].text).toMatch(/insert into users/i);
    expect(queries[2].text).toMatch(/insert into accounts/i);
    // session_version 0 on a new row; handle generated
    expect(queries[1].params).toContain(0);
  });
});

describe("findCredentialUserByEmail", () => {
  it("lowercases the email and returns the row", async () => {
    const { client, queries } = fakeClient([{ rows: [{ id: "u-1", password_hash: "h", session_version: 2 }] }]);
    const row = await findCredentialUserByEmail(client, "Theo@Example.com");
    expect(row).toEqual({ id: "u-1", password_hash: "h", session_version: 2 });
    expect(queries[0].params).toEqual(["theo@example.com"]);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- users-repo`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import { generateHandle } from "@/lib/handles";
import { randomAvatarTint } from "@/lib/avatar";

/** Minimal shape shared by the pool and a transaction client. */
export interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

export interface OAuthProfile {
  provider: string;
  providerAccountId: string;
  type: string;            // 'oauth' | 'oidc'
  name: string | null;
  email: string | null;
  image: string | null;
}

/** Find the user behind an OAuth account, or create a fresh user + account.
 *  Keys ONLY on (provider, providerAccountId) — never email. Run inside a
 *  transaction in production so the two inserts are atomic. */
export async function resolveOrCreateOAuthUser(db: Queryable, p: OAuthProfile): Promise<string> {
  const found = await db.query(
    `select user_id from accounts where provider = $1 and provider_account_id = $2`,
    [p.provider, p.providerAccountId],
  );
  if (found.rows.length > 0) return (found.rows[0] as { user_id: string }).user_id;

  const userId = `u-${randomUUID()}`;
  await db.query(
    `insert into users (id, name, handle, avatar, email, image, session_version)
     values ($1, $2, $3, $4, $5, $6, 0)`,
    [userId, p.name ?? "Coffee drinker", generateHandle(), randomAvatarTint(), p.email, p.image],
  );
  await db.query(
    `insert into accounts (id, user_id, type, provider, provider_account_id)
     values ($1, $2, $3, $4, $5)`,
    [`acc-${randomUUID()}`, userId, p.type, p.provider, p.providerAccountId],
  );
  return userId;
}

export interface CredentialRow { id: string; password_hash: string; session_version: number }

export async function findCredentialUserByEmail(db: Queryable, email: string): Promise<CredentialRow | null> {
  const { rows } = await db.query(
    `select id, password_hash, session_version from users
     where lower(email) = lower($1) and password_hash is not null`,
    [email.toLowerCase()],
  );
  return (rows[0] as CredentialRow) ?? null;
}

/** Insert a credential user. Throws the raw pg error (caller inspects 23505 /
 *  err.constraint). `handle` null → generated. */
export async function createCredentialUser(
  db: Queryable,
  u: { name: string; email: string; passwordHash: string; handle: string | null; avatar: string },
): Promise<string> {
  const userId = `u-${randomUUID()}`;
  await db.query(
    `insert into users (id, name, handle, avatar, email, password_hash, session_version)
     values ($1, $2, $3, $4, $5, $6, 0)`,
    [userId, u.name, u.handle ?? generateHandle(), u.avatar, u.email, u.passwordHash],
  );
  return userId;
}

export async function getSessionVersion(db: Queryable, userId: string): Promise<number | null> {
  const { rows } = await db.query(`select session_version from users where id = $1`, [userId]);
  return rows.length ? (rows[0] as { session_version: number }).session_version : null;
}

export async function bumpSessionVersion(db: Queryable, userId: string): Promise<void> {
  await db.query(`update users set session_version = session_version + 1 where id = $1`, [userId]);
}
```

- [ ] **Step 4: Run it to verify pass**

Run: `npm test -- users-repo`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/users-repo.ts test/users-repo.test.ts
git commit -m "feat(auth): users repository (oauth upsert, credential lookup/create, session_version)"
```

## Task 16: Auth.js config (`auth.ts`) + route handler

**Files:**
- Create: `auth.ts`, `app/api/auth/[...nextauth]/route.ts`

This task has no unit test (it wires the framework); it is verified by `tsc` and, at the end, a real sign-in in Milestone 3 / via the Auth.js routes. Follow the installed `next-auth@beta` docs if a signature differs.

- [ ] **Step 1: Create `auth.ts` at the repo root**

```ts
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { pool, withTransaction } from "@/lib/db";
import { findCredentialUserByEmail, resolveOrCreateOAuthUser } from "@/lib/users-repo";
import { verifyPassword, DUMMY_HASH } from "@/lib/passwords";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    sessionVersion: number;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    sv: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 1800 }, // 30-min rolling
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Google,
    GitHub,
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds) => {
        const email = String(creds?.email ?? "");
        const password = String(creds?.password ?? "");
        const user = await findCredentialUserByEmail(pool, email);
        // Always run a bcrypt compare (dummy hash on the no-user path) to keep
        // timing identical → no user-enumeration oracle.
        const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
        if (!user || !ok) return null;
        return { id: user.id, sessionVersion: user.session_version } as unknown as { id: string };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
      if (token.uid) return token; // already resolved — no DB hit on the hot path
      if (account) {
        if (account.type === "credentials") {
          token.uid = (user as { id: string }).id;
          token.sv = (user as unknown as { sessionVersion?: number }).sessionVersion ?? 0;
        } else {
          token.uid = await withTransaction((client) =>
            resolveOrCreateOAuthUser(client, {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              type: account.type,
              name: (profile?.name as string) ?? null,
              email: (profile?.email as string) ?? null,
              image: (profile?.picture as string) ?? (profile?.avatar_url as string) ?? null,
            }),
          );
          token.sv = 0; // freshly resolved/created user starts at 0
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid;
      session.sessionVersion = token.sv;
      return session;
    },
  },
});
```

- [ ] **Step 2: Create the route handler**

`app/api/auth/[...nextauth]/route.ts` — `auth.ts` exports `handlers`, not `GET`/`POST` directly, so destructure them:
```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If `account.providerAccountId`/`profile` typings differ in the installed beta, adjust per its types — the shape above matches Auth.js v5.)

- [ ] **Step 4: Commit**

```bash
git add auth.ts app/api/auth
git commit -m "feat(auth): NextAuth v5 config (credentials+google+github, jwt, no adapter)"
```

## Task 17: Make `lib/auth.ts` real (boundary + write-path revocation)

**Files:**
- Modify: `lib/auth.ts`
- Test: `test/auth-guard.test.ts`

- [ ] **Step 1: Write the failing test for the revocation gate**

Extract the pure decision so it is testable without the framework. Test:
```ts
import { describe, it, expect } from "vitest";
import { resolveUserOrThrow } from "@/lib/auth";

describe("resolveUserOrThrow", () => {
  it("throws when there is no session", () => {
    expect(() => resolveUserOrThrow(null, 0)).toThrow();
  });
  it("throws when the session_version is stale", () => {
    expect(() => resolveUserOrThrow({ id: "u-1", sv: 1 }, 3)).toThrow();
  });
  it("returns the id when versions match", () => {
    expect(resolveUserOrThrow({ id: "u-1", sv: 3 }, 3)).toBe("u-1");
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- auth-guard`
Expected: FAIL.

- [ ] **Step 3: Replace the stub in `lib/auth.ts`**

```ts
import "server-only";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { getSessionVersion } from "@/lib/users-repo";

export async function getCurrentUserId(): Promise<string | null> {
  return (await auth())?.user?.id ?? null;
}

/** Pure gate: given the session's {id, sv} and the live version, return the id
 *  or throw. Read paths do not call this; write paths do (revocation). */
export function resolveUserOrThrow(
  session: { id: string; sv: number } | null,
  liveVersion: number | null,
): string {
  if (!session) throw new Error("Unauthenticated");
  if (liveVersion === null || liveVersion !== session.sv) throw new Error("Session revoked");
  return session.id;
}

/** Write-path gate: enforces auth + per-user revocation with one PK lookup. */
export async function requireUserId(): Promise<string> {
  const s = await auth();
  const id = s?.user?.id ?? null;
  if (!id) throw new Error("Unauthenticated");
  const liveVersion = await getSessionVersion({ query }, id);
  return resolveUserOrThrow({ id, sv: s!.sessionVersion }, liveVersion);
}
```
(`{ query }` adapts the module-level `query` helper to the `Queryable` shape that
`getSessionVersion` expects.)

- [ ] **Step 4: Run it to verify pass**

Run: `npm test -- auth-guard`
Expected: PASS (3 tests).

- [ ] **Step 5: Update the `requireUserId` test from Milestone 1**

There is no separate test file for the old stub, so nothing to delete. Type-check:

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts test/auth-guard.test.ts
git commit -m "feat(auth): real getCurrentUserId/requireUserId with write-path revocation"
```

## Task 18: Stamp `token.sv` from real session_version on OAuth

**Files:**
- Modify: `auth.ts`

The OAuth branch in Task 16 hardcodes `token.sv = 0`, which is correct for a brand-new user but wrong when an OAuth user signs in again (their version may have been bumped). Fetch it.

- [ ] **Step 1: Return the live version from the resolver path**

In `auth.ts`, replace the OAuth branch of the `jwt` callback so it reads the version after resolving the id:
```ts
        } else {
          const uid = await withTransaction((client) =>
            resolveOrCreateOAuthUser(client, {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              type: account.type,
              name: (profile?.name as string) ?? null,
              email: (profile?.email as string) ?? null,
              image: (profile?.picture as string) ?? (profile?.avatar_url as string) ?? null,
            }),
          );
          token.uid = uid;
          token.sv = (await getSessionVersion({ query }, uid)) ?? 0;
        }
```
Add the imports at the top of `auth.ts`:
```ts
import { query } from "@/lib/db";
import { getSessionVersion } from "@/lib/users-repo";
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add auth.ts
git commit -m "fix(auth): stamp real session_version on OAuth sign-in"
```

## Task 19: `registerUser` server action

**Files:**
- Create: `lib/register-errors.ts`, `app/auth-actions.ts`
- Test: `test/register-errors.test.ts`

> **Why a separate `lib/register-errors.ts`:** a `"use server"` file may only export
> **async** functions. The pure, synchronous `mapRegisterError` therefore cannot live
> in `app/auth-actions.ts` — it goes in its own module, imported by both the action
> and the test.

- [ ] **Step 1: Write the failing test for the pure error mapping**

```ts
import { describe, it, expect } from "vitest";
import { mapRegisterError } from "@/lib/register-errors";

describe("mapRegisterError", () => {
  it("maps the email unique index to a friendly message", () => {
    const e = Object.assign(new Error("dup"), { code: "23505", constraint: "users_email_lower_uq" });
    expect(mapRegisterError(e)).toBe("That email is already registered.");
  });
  it("maps a handle collision to a retryable message", () => {
    const e = Object.assign(new Error("dup"), { code: "23505", constraint: "users_handle_key" });
    expect(mapRegisterError(e)).toMatch(/try again/i);
  });
  it("rethrows non-23505 errors", () => {
    expect(() => mapRegisterError(new Error("other"))).toThrow("other");
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- register-errors`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/register-errors.ts`**

```ts
interface PgError extends Error { code?: string; constraint?: string }

/** Map a DB error to a user message, or rethrow if it is not a unique violation. */
export function mapRegisterError(err: unknown): string {
  const e = err as PgError;
  if (e?.code === "23505") {
    if (e.constraint === "users_email_lower_uq") return "That email is already registered.";
    return "Couldn't pick a username, please try again.";
  }
  throw err;
}
```

- [ ] **Step 4: Run it to verify pass**

Run: `npm test -- register-errors`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `app/auth-actions.ts`**

```ts
"use server";
import { signIn } from "@/auth";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { randomAvatarTint } from "@/lib/avatar";
import { validateSignup, type SignupInput } from "@/lib/signup-validation";
import { createCredentialUser } from "@/lib/users-repo";
import { checkRateLimit } from "@/lib/rate-limit";
import { mapRegisterError } from "@/lib/register-errors";

export async function registerUser(input: SignupInput): Promise<{ error: string }> {
  // Rate-limit by email (IP limiting also applies at the login path).
  if (!checkRateLimit(`signup:${input.email.toLowerCase()}`)) {
    return { error: "Too many attempts, try again later." };
  }

  const v = validateSignup(input);
  if (!v.ok) return { error: v.error };

  try {
    await createCredentialUser(pool, {
      name: v.value.name,
      email: v.value.email,
      passwordHash: await hashPassword(v.value.password),
      handle: v.value.handle,
      avatar: randomAvatarTint(),
    });
  } catch (err) {
    return { error: mapRegisterError(err) };
  }

  // OUTSIDE the try/catch: signIn throws the Next redirect (the success path),
  // which must NOT be swallowed by the 23505 handler above.
  await signIn("credentials", { email: v.value.email, password: v.value.password, redirectTo: "/" });
  return { error: "" }; // unreachable on success (redirect thrown)
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
```
Add `signOut` to the `@/auth` import: `import { signIn, signOut } from "@/auth";`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/register-errors.ts app/auth-actions.ts test/register-errors.test.ts
git commit -m "feat(auth): registerUser + signOut actions; pure 23505 error mapping"
```

## Task 20: Rate-limit the credentials login path

**Files:**
- Modify: `auth.ts`

- [ ] **Step 1: Add the limiter to `authorize`**

In the Credentials `authorize` in `auth.ts`, before the DB lookup:
```ts
      authorize: async (creds) => {
        const email = String(creds?.email ?? "");
        const password = String(creds?.password ?? "");
        if (!checkRateLimit(`login:${email.toLowerCase()}`)) return null;
        const user = await findCredentialUserByEmail(pool, email);
        // ...rest of authorize (dummy-hash compare, return) unchanged from Task 16
```
Add the import at the top of `auth.ts`:
```ts
import { checkRateLimit } from "@/lib/rate-limit";
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add auth.ts
git commit -m "feat(auth): rate-limit credentials login"
```

## Task 21: `getUsers` projection guard test

**Files:**
- Test: `test/projection-guard.test.ts`

- [ ] **Step 1: Write the assertion that `TASTING_COLS`/`getUsers` never leak sensitive columns**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("client projection guard", () => {
  it("getUsers selects no sensitive columns", () => {
    const src = readFileSync("lib/queries.ts", "utf8");
    const getUsers = src.slice(src.indexOf("export async function getUsers"));
    const body = getUsers.slice(0, getUsers.indexOf("}"));
    for (const col of ["password_hash", "email", "email_verified", "session_version"]) {
      expect(body.includes(col)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- projection-guard`
Expected: PASS (the current `getUsers` column list already excludes them). If it fails, the column list was widened — fix `getUsers`, do not change the test.

- [ ] **Step 3: Commit**

```bash
git add test/projection-guard.test.ts
git commit -m "test(auth): assert getUsers never selects sensitive columns"
```

## Task 22: Milestone 2 integration check

- [ ] **Step 1: Full test + type-check + build**

Run:
```bash
npm test && npx tsc --noEmit && npm run build
```
Expected: all tests pass; no type errors; build succeeds.

- [ ] **Step 2: Manual end-to-end via Auth.js default pages (optional, needs env)**

With `AUTH_SECRET` + at least one OAuth provider set in `.env.local`, run `npm run dev` and hit `/api/auth/signin`. Expected: the Auth.js default sign-in page lists Google/GitHub/Credentials. (The styled `/login` page is Milestone 3.)

---

# Milestone 3 — Auth UI

Outcome: branded `/login` and `/signup` pages, a working sign-out, already-authenticated redirects, the profile redirect for logged-out users, and docs updated. After this, the gate targets from Milestone 1 resolve to real pages.

## Task 23: `/login` page

**Files:**
- Create: `app/login/page.tsx`

- [ ] **Step 1: Build the login page**

Server component that redirects away if already signed in, with a client form for credentials and server-action buttons for OAuth.
```tsx
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage() {
  if (await auth()) redirect("/");

  async function loginWithCredentials(formData: FormData) {
    "use server";
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
  }
  async function loginWithGithub() { "use server"; await signIn("github", { redirectTo: "/" }); }
  async function loginWithGoogle() { "use server"; await signIn("google", { redirectTo: "/" }); }

  return (
    <div style={{ maxWidth: 380, margin: "60px auto", padding: "0 20px" }}>
      <h1 className="display" style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Sign in</h1>
      <p style={{ color: "var(--mocha)", marginBottom: 22 }}>Welcome back to your coffee journal.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <form action={loginWithGithub}><Button type="submit" variant="outline" style={{ width: "100%" }}>Continue with GitHub</Button></form>
        <form action={loginWithGoogle}><Button type="submit" variant="outline" style={{ width: "100%" }}>Continue with Google</Button></form>
      </div>

      <form action={loginWithCredentials} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
        <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required /></div>
        <Button type="submit" style={{ width: "100%" }}>Sign in</Button>
      </form>

      <p style={{ marginTop: 18, fontSize: 14, color: "var(--mocha)" }}>
        No account? <a href="/signup" style={{ color: "var(--espresso)", fontWeight: 600 }}>Sign up</a>
      </p>
    </div>
  );
}
```
Note: Auth.js redirects back to `/login?error=...` on a failed credentials sign-in (the uniform `CredentialsSignin`). Add an error notice by reading `searchParams` if desired (optional polish).

- [ ] **Step 2: Type-check & build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/login
git commit -m "feat(ui): /login page (credentials + OAuth)"
```

## Task 24: `/signup` page

**Files:**
- Create: `app/signup/page.tsx` (server — redirect guard), `app/signup/signup-form.tsx` (client form)

- [ ] **Step 1: Server page with the already-authenticated redirect**

`app/signup/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  if (await auth()) redirect("/");
  return <SignupForm />;
}
```

- [ ] **Step 2: Build the client form**

`app/signup/signup-form.tsx` — posts to `registerUser`, which redirects on success or returns `{ error }`.
```tsx
"use client";
import { useState } from "react";
import { registerUser } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError("");
    // On success registerUser throws the redirect; on failure it returns { error }.
    const res = await registerUser({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      handle: String(formData.get("handle") ?? ""),
    });
    setPending(false);
    if (res?.error) setError(res.error);
  }

  return (
    <div style={{ maxWidth: 380, margin: "60px auto", padding: "0 20px" }}>
      <h1 className="display" style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Create your account</h1>
      <p style={{ color: "var(--mocha)", marginBottom: 22 }}>Start logging your brews.</p>

      {error && (
        <p role="alert" style={{ color: "var(--destructive, #b24a44)", marginBottom: 14, fontSize: 14 }}>{error}</p>
      )}

      <form action={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div>
        <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
        <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required minLength={8} /></div>
        <div><Label htmlFor="handle">Handle (optional)</Label><Input id="handle" name="handle" placeholder="auto-generated if blank" /></div>
        <Button type="submit" disabled={pending} style={{ width: "100%" }}>{pending ? "Creating…" : "Sign up"}</Button>
      </form>

      <p style={{ marginTop: 18, fontSize: 14, color: "var(--mocha)" }}>
        Have an account? <a href="/login" style={{ color: "var(--espresso)", fontWeight: 600 }}>Sign in</a>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Type-check & build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add app/signup
git commit -m "feat(ui): /signup page (server redirect guard + client form)"
```

## Task 25: Sign-out control + profile redirect

**Files:**
- Modify: `components/app-provider.tsx`, `components/detail.tsx`

`signOutAction` already exists in `app/auth-actions.ts` (Task 19). A client component
can pass a server action to a `<form action={...}>`, so no extra server file is needed.

- [ ] **Step 1: Render a sign-out button in the sidebar**

In `components/app-provider.tsx`, import the action: `import { signOutAction } from "@/app/auth-actions";`. Inside the `me ?` branch from Task 9, place the `nav-user` button and a sign-out form side by side (wrap them in the existing flex row). Add, right after the `nav-user` button and before the `ThemeToggle`:
```tsx
                <form action={signOutAction}>
                  <Button variant="ghost" size="icon" type="submit" aria-label="Sign out" title="Sign out">
                    <Icon name="settings" size={18} />
                  </Button>
                </form>
```
(Use a "Sign out" text button if you prefer; pick any existing `IconName` — verify the available names in `components/ui.tsx`'s `Icon` before choosing.)

- [ ] **Step 2: Redirect logged-out users away from the profile**

In `components/detail.tsx`, the `ProfileScreen` currently does `if (!me) return null;`. Profile is a client component, so use the shell router. Replace with a redirect to `/login`:
```tsx
  // Profile is private — send logged-out visitors to sign in.
  const router = useRouter();
  useEffect(() => { if (!me) router.replace("/login"); }, [me, router]);
  if (!me) return null;
```
Add imports at the top of `detail.tsx` if missing: `import { useEffect } from "react";` and `import { useRouter } from "next/navigation";`.

- [ ] **Step 3: Type-check & build**

Run: `npx tsc --noEmit && npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add components/app-provider.tsx components/detail.tsx
git commit -m "feat(ui): sign-out control + profile redirect for logged-out users"
```

## Task 26: Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `README.md`**

Remove any line describing the app as "single user (`u1`, `You`); there is no auth." Add a short "Authentication" paragraph: Auth.js v5 (email+password, Google, GitHub), public browse / gated writes, env vars per `.env.example`, run `npm run db:setup` after pulling the schema change.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: describe authentication"
```

## Task 27: Full manual verification (needs `.env.local`)

- [ ] **Step 1: Configure env**

Ensure `.env.local` has `AUTH_SECRET`, `DATABASE_URL`, and at least one OAuth provider's id/secret (plus credentials needs none). Run `npm run db:setup` then `npm run dev`.

- [ ] **Step 2: Exercise the flows**

- Logged-out: browse feed/discover; sidebar shows **Sign in**; clicking **Log a brew** / a like → `/login`.
- `/signup`: create an account → redirected to `/`, sidebar shows your name/handle; **Log a brew** opens the sheet; logging persists.
- Sign out → back to logged-out state.
- `/login`: sign back in with the same email/password.
- OAuth: "Continue with GitHub/Google" → returns signed in; a `users` row + `accounts` row exist (`docker exec coffee-pg psql -U postgres -d coffee_tracker -c "select id, handle, email from users; select provider, provider_account_id from accounts;"`).
- Revocation: while signed in, bump your row — `update users set session_version = session_version + 1 where id = '<your id>';` — then try to **Log a brew**. Expected: the write fails (revoked); reads still work until the 30-min token expiry.

- [ ] **Step 3: Final full check**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: green across the board.

---

## Notes for execution

- **Milestone boundaries are good checkpoint/PR points.** Each milestone ends compiling and (M1) browsable / (M2) testable / (M3) fully functional.
- **If an Auth.js v5 signature differs** from this plan at install time (Task 16/19), trust the installed `next-auth@beta` types/docs (Context7 `/websites/authjs_dev`) over this document — the architecture (no adapter, jwt callback upsert, `token.uid`/`token.sv`) does not change.
- **Read-path revocation** is intentionally out of scope (a revoked user can still read until token expiry); see the spec's "Out of scope" for the `getAppData` follow-up.
