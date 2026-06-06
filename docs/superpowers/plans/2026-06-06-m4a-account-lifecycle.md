# M4·A — Account Lifecycle & Revocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an account delete itself (hard, cascade) and sign out everywhere, and make session revocation effective on read paths — not just writes.

**Architecture:** A Drizzle migration flips the last two non-cascade user FKs (`tastings.user_id`, `likes.user_id`) to `ON DELETE CASCADE` so `DELETE FROM users` works. A shared `isLiveSession` predicate drives both the read path (`getCurrentUserId`, now revocation-aware and `React.cache`-memoized) and the write path (`resolveUserOrThrow`). Two new Server Actions (`signOutAllDevices`, `deleteAccount`) wire the revoke primitive and the cascade delete. A dedicated `/settings` route hosts confirm-gated UI.

**Tech Stack:** Next.js 15 App Router, React 19 (`cache`), Postgres (raw `pg`), Auth.js v5 (JWT), Drizzle (migrations only), Vitest (unit + integration projects).

**Spec:** `docs/superpowers/specs/2026-06-06-m4a-account-lifecycle-design.md`
**Branch:** `feat/m4a-account-lifecycle` (already created; spec committed at `4397d00`).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `lib/db/schema.ts` | Drizzle schema (migration source) | Modify: `onDelete: "cascade"` on `tastings.userId` + `likes.userId` |
| `drizzle/0002_account_deletion_cascade.sql` + `drizzle/meta/*` | Generated migration + snapshot | Create (via `drizzle-kit generate`) |
| `lib/auth-guard.ts` | Pure revocation comparison | Modify: add `isLiveSession`, refactor `resolveUserOrThrow` to use it |
| `lib/auth.ts` | Session resolution (read + write gates) | Modify: `getCurrentUserId` becomes revocation-aware + `cache()`-wrapped |
| `app/account-actions.ts` | Destructive/lifecycle Server Actions | Create: `signOutAllDevices`, `deleteAccount` |
| `app/settings/page.tsx` | `/settings` server entry (auth-gate) | Create |
| `app/settings/settings-client.tsx` | Client wrapper | Create |
| `components/settings.tsx` | `SettingsScreen` UI (two confirm-gated cards) | Create |
| `components/app-provider.tsx` | Shell sidebar | Modify: add a Settings gear button near the user block |
| `test/auth-guard.test.ts` | predicate unit tests | Modify: add `isLiveSession` truth table |
| `test/get-current-user-id.test.ts` | read-path revocation unit tests | Create |
| `test/account-actions.test.ts` | action unit tests | Create |
| `test/integration/account-deletion.test.ts` | cascade + constraint integration tests | Create |

---

## Task 1: Migration — `tastings.user_id` + `likes.user_id` → `ON DELETE CASCADE`

**Files:**
- Modify: `lib/db/schema.ts:102` and `lib/db/schema.ts:126`
- Create (generated): `drizzle/0002_account_deletion_cascade.sql`, `drizzle/meta/0002_snapshot.json`, updates `drizzle/meta/_journal.json`

- [ ] **Step 1: Change the FK on `tastings.userId`**

In `lib/db/schema.ts`, line 102, change:

```ts
    userId: text("user_id").notNull().references(() => users.id), // NO cascade
```

to:

```ts
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
```

- [ ] **Step 2: Change the FK on `likes.userId`**

In `lib/db/schema.ts`, line 126, change:

```ts
    userId: text("user_id").notNull().references(() => users.id), // NO cascade
```

to:

```ts
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
```

- [ ] **Step 3: Generate the migration**

Run (DATABASE_URL only needs to be present for config parsing; generate is offline/diff-based):

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coffee_tracker" npx drizzle-kit generate --name account_deletion_cascade
```

Expected: a new file `drizzle/0002_account_deletion_cascade.sql` is created, and `drizzle/meta/0002_snapshot.json` + `drizzle/meta/_journal.json` are written.

- [ ] **Step 4: Verify the generated SQL is exactly the FK swap**

Read `drizzle/0002_account_deletion_cascade.sql`. It MUST contain (order may vary; both tables present), and NOTHING else of substance:

```sql
ALTER TABLE "tastings" DROP CONSTRAINT "tastings_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "likes" DROP CONSTRAINT "likes_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
```

If the file contains anything else (e.g. unrelated table changes), STOP — the schema drifted; investigate before continuing.

- [ ] **Step 5: Apply the migration to the dev DB**

```bash
npm run db:setup
```

Expected: output shows the `0002_account_deletion_cascade` migration applied (and "seed skipped" / existing-data message). No errors.

- [ ] **Step 6: Verify the drift check is clean**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coffee_tracker" npx drizzle-kit generate
```

Expected: `No schema changes, nothing to migrate` (no new `0003` file). Confirm `git status` shows only the `0002` files + `schema.ts` as changes.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "$(cat <<'EOF'
feat(db): tastings.user_id + likes.user_id ON DELETE CASCADE (m4a)

Migration 0002: the last two non-cascade user FKs now cascade, so
DELETE FROM users removes the user's own tastings/likes. Enables account
deletion. Generated by drizzle-kit; drift check clean.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Shared revocation predicate — `isLiveSession`

**Files:**
- Modify: `lib/auth-guard.ts`
- Test: `test/auth-guard.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/auth-guard.test.ts` (after the existing `describe`), and add `isLiveSession` to the import on line 2 (`import { resolveUserOrThrow, isLiveSession } from "@/lib/auth-guard";`):

```ts
describe("isLiveSession", () => {
  it("is true only when both are numbers and equal", () => {
    expect(isLiveSession(3, 3)).toBe(true);
  });
  it("is false when the live version is stale", () => {
    expect(isLiveSession(3, 5)).toBe(false);
  });
  it("is false when the user no longer exists (live null)", () => {
    expect(isLiveSession(3, null)).toBe(false);
  });
  it("is false when the session version is missing (undefined)", () => {
    expect(isLiveSession(undefined, 0)).toBe(false);
  });
  it("is false when both are absent", () => {
    expect(isLiveSession(undefined, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit test/auth-guard.test.ts`
Expected: FAIL — `isLiveSession is not a function` (or import error).

- [ ] **Step 3: Implement `isLiveSession` and refactor `resolveUserOrThrow`**

Replace the entire contents of `lib/auth-guard.ts` with:

```ts
/** True only when the session's frozen version matches the live DB version.
 *  A missing/non-number sv (e.g. a legacy JWT) is treated as NOT live. */
export function isLiveSession(sv: number | undefined, liveVersion: number | null): boolean {
  return liveVersion !== null && typeof sv === "number" && sv === liveVersion;
}

/** Pure gate: given the session's {id, sv} and the live session_version, return
 *  the id or throw. Read paths do not call this; write paths do (revocation). */
export function resolveUserOrThrow(
  session: { id: string; sv: number } | null,
  liveVersion: number | null,
): string {
  if (!session) throw new Error("Unauthenticated");
  if (!isLiveSession(session.sv, liveVersion)) throw new Error("Session revoked");
  return session.id;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit test/auth-guard.test.ts`
Expected: PASS — all 9 tests (4 existing `resolveUserOrThrow` + 5 new `isLiveSession`).

- [ ] **Step 5: Commit**

```bash
git add lib/auth-guard.ts test/auth-guard.test.ts
git commit -m "$(cat <<'EOF'
refactor(auth): extract isLiveSession predicate (m4a)

One source of truth for the session_version comparison, shared by the
read path (returns null) and write path (throws). Defensive on a
missing/non-number sv (legacy JWT) → treated as not-live.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Read-path revocation in `getCurrentUserId`

**Files:**
- Modify: `lib/auth.ts`
- Test: `test/get-current-user-id.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/get-current-user-id.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fns are module-level so they survive vi.resetModules() (re-imported
// lib/auth re-binds to these same references via the hoisted factories).
const authMock = vi.fn();
const getSessionVersionMock = vi.fn();
const queryMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/users-repo", () => ({ getSessionVersion: getSessionVersionMock }));
vi.mock("@/lib/db", () => ({ query: queryMock }));

beforeEach(() => {
  vi.resetModules(); // fresh module → fresh React.cache() per test, no cross-test memo
  authMock.mockReset();
  getSessionVersionMock.mockReset();
  queryMock.mockReset();
});

async function loadGetCurrentUserId() {
  return (await import("@/lib/auth")).getCurrentUserId;
}

describe("getCurrentUserId — read-path revocation", () => {
  it("returns null for an anonymous request WITHOUT touching the DB", async () => {
    authMock.mockResolvedValue(null);
    const getCurrentUserId = await loadGetCurrentUserId();
    expect(await getCurrentUserId()).toBeNull();
    expect(getSessionVersionMock).not.toHaveBeenCalled();
  });

  it("returns the id when the session version matches the live version", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionVersionMock.mockResolvedValue(3);
    const getCurrentUserId = await loadGetCurrentUserId();
    expect(await getCurrentUserId()).toBe("u-1");
  });

  it("returns null when the session was revoked (version bumped)", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionVersionMock.mockResolvedValue(5);
    const getCurrentUserId = await loadGetCurrentUserId();
    expect(await getCurrentUserId()).toBeNull();
  });

  it("returns null when the user no longer exists (live version null)", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionVersionMock.mockResolvedValue(null);
    const getCurrentUserId = await loadGetCurrentUserId();
    expect(await getCurrentUserId()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit test/get-current-user-id.test.ts`
Expected: FAIL — the "anonymous WITHOUT touching the DB" and revoked/deleted cases fail (current `getCurrentUserId` never calls `getSessionVersion`; revoked/deleted still return the id).

- [ ] **Step 3: Implement revocation-aware `getCurrentUserId`**

Replace the entire contents of `lib/auth.ts` with:

```ts
import "server-only";
import { cache } from "react";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { getSessionVersion } from "@/lib/users-repo";
import { isLiveSession, resolveUserOrThrow } from "@/lib/auth-guard";

// Wrap query so its overloaded signatures align with the Queryable interface.
const db = { query: (t: string, p?: unknown[]) => query(t, p) };

/** Read-path identity WITH revocation. Memoized per request via React.cache so
 *  the session_version lookup runs at most once even when called from both the
 *  root layout (getAppData) and a page. Anonymous short-circuits before any DB. */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const s = await auth();
  const id = s?.user?.id ?? null;
  if (!id) return null; // anonymous: no DB hit
  const live = await getSessionVersion(db, id);
  return isLiveSession(s!.sessionVersion, live) ? id : null;
});

/** Write-path gate: enforces auth + per-user revocation with one PK lookup.
 *  Throws (does not return null) so mutations fail closed. */
export async function requireUserId(): Promise<string> {
  const s = await auth();
  const id = s?.user?.id ?? null;
  if (!id) throw new Error("Unauthenticated");
  const liveVersion = await getSessionVersion(db, id);
  return resolveUserOrThrow({ id, sv: s!.sessionVersion }, liveVersion);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit test/get-current-user-id.test.ts`
Expected: PASS — all 4 tests.

- [ ] **Step 5: Run the full unit suite to confirm no regressions**

Run: `npx vitest run --project unit`
Expected: PASS — existing suites (actions, queries, etc. that mock `@/lib/auth`) are unaffected.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/auth.ts test/get-current-user-id.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): read-path session revocation in getCurrentUserId (m4a)

getCurrentUserId now validates session_version against the live DB and
returns null on mismatch/deletion. React.cache memoizes it to one PK
lookup per request; anonymous short-circuits before any DB hit. Shares
the isLiveSession predicate with the write path.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Account Server Actions — `signOutAllDevices` + `deleteAccount`

**Files:**
- Create: `app/account-actions.ts`
- Test: `test/account-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/account-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUserId = vi.fn(async () => "u-me");
const signOut = vi.fn(async () => {});
const bumpSessionVersion = vi.fn(async () => {});
const withTransaction = vi.fn();
const poolQuery = vi.fn(async () => ({ rows: [] }));

vi.mock("@/lib/auth", () => ({ requireUserId }));
vi.mock("@/auth", () => ({ signOut }));
vi.mock("@/lib/users-repo", () => ({ bumpSessionVersion }));
vi.mock("@/lib/db", () => ({
  pool: { query: poolQuery },
  withTransaction: (fn: unknown) => withTransaction(fn),
}));

import { signOutAllDevices, deleteAccount } from "@/app/account-actions";

beforeEach(() => {
  requireUserId.mockClear();
  requireUserId.mockResolvedValue("u-me");
  signOut.mockClear();
  bumpSessionVersion.mockClear();
  withTransaction.mockReset();
});

describe("signOutAllDevices", () => {
  it("requires auth, bumps the session version, THEN signs out", async () => {
    await signOutAllDevices();
    expect(requireUserId).toHaveBeenCalled();
    expect(bumpSessionVersion).toHaveBeenCalledWith({ query: expect.any(Function) }, "u-me");
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
    expect(bumpSessionVersion.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });
});

describe("deleteAccount", () => {
  it("requires auth, DELETEs the user inside a tx, THEN signs out", async () => {
    const innerQuery = vi.fn(async () => ({ rows: [] }));
    withTransaction.mockImplementation(async (fn: (c: unknown) => unknown) =>
      fn({ query: innerQuery }),
    );
    await deleteAccount();
    expect(requireUserId).toHaveBeenCalled();
    const [sql, params] = innerQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/delete from users where id = \$1/i);
    expect(params).toEqual(["u-me"]);
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
    expect(withTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });

  it("aborts before deleting if the auth gate throws (revoked/unauth)", async () => {
    requireUserId.mockRejectedValueOnce(new Error("Session revoked"));
    await expect(deleteAccount()).rejects.toThrow(/revoked/i);
    expect(withTransaction).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit test/account-actions.test.ts`
Expected: FAIL — cannot resolve `@/app/account-actions` (file does not exist).

- [ ] **Step 3: Implement the actions**

Create `app/account-actions.ts`:

```ts
"use server";
import { signOut } from "@/auth";
import { pool, withTransaction } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { bumpSessionVersion } from "@/lib/users-repo";

// Match the repo's Queryable wrapper pattern (see app/auth-actions.ts).
const poolDb = { query: (text: string, params?: unknown[]) => pool.query(text, params) };

/** "Sign out everywhere": bump the session_version so EVERY device's frozen JWT
 *  is stale on its next request (reads via getCurrentUserId, writes via
 *  requireUserId), then sign out this device. Bump must precede signOut. */
export async function signOutAllDevices(): Promise<void> {
  const userId = await requireUserId();
  await bumpSessionVersion(poolDb, userId);
  await signOut({ redirectTo: "/" }); // redirect throws — last statement
}

/** Hard-delete the account. DELETE FROM users cascades to every user-owned row
 *  (accounts, beans→tastings→likes/saves/comments, the user's own tastings/likes,
 *  follows, saves, wishlist, comments). Runs in a tx; signOut is last because its
 *  redirect throws. The brief dangling-cookie window is neutralized by read-path
 *  revocation (the row is gone → getSessionVersion null → getCurrentUserId null). */
export async function deleteAccount(): Promise<void> {
  const userId = await requireUserId();
  await withTransaction((c) => c.query("delete from users where id = $1", [userId]));
  await signOut({ redirectTo: "/" }); // redirect throws — last statement
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit test/account-actions.test.ts`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/account-actions.ts test/account-actions.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): signOutAllDevices + deleteAccount server actions (m4a)

signOutAllDevices wires the previously-dead bumpSessionVersion (revokes
all devices). deleteAccount hard-deletes via cascade inside a tx. Both
gate on requireUserId; signOut is the last statement (its redirect throws).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Integration tests — cascade deletion + constraint type

**Files:**
- Create: `test/integration/account-deletion.test.ts`

- [ ] **Step 1: Write the integration tests**

Create `test/integration/account-deletion.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { freshDbWithSql, dropDb } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

/** Concatenate all migrations in order → one raw SQL batch for a scratch DB.
 *  (`--> statement-breakpoint` lines are `--` SQL comments, so a simple-query
 *  batch runs the whole thing; mirrors constraints.test.ts applying 0000.) */
function allMigrations(): string {
  const dir = join(process.cwd(), "drizzle");
  return ["0000_init.sql", "0001_pagination_indexes.sql", "0002_account_deletion_cascade.sql"]
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

describe.skipIf(!hasDb)("account deletion cascade", () => {
  const DB = "cortado_account_deletion";
  afterAll(() => dropDb(DB));
  async function client() {
    return freshDbWithSql(DB, allMigrations());
  }

  it("tastings.user_id and likes.user_id are ON DELETE CASCADE (confdeltype 'c')", async () => {
    const c = await client();
    try {
      const r = await c.query(
        `select conname, confdeltype from pg_constraint
         where conname in ('tastings_user_id_users_id_fk','likes_user_id_users_id_fk')
         order by conname`,
      );
      // 'c' = CASCADE, 'a' = NO ACTION
      expect(r.rows.map((x: { confdeltype: string }) => x.confdeltype)).toEqual(["c", "c"]);
    } finally {
      await c.end();
    }
  });

  it("DELETE FROM users removes the user's content + others' engagement on it, sparing others' catalog content", async () => {
    const c = await client();
    try {
      await c.query(
        `insert into users (id,name,handle,avatar) values
         ('u1','One','one','#000'),('u2','Two','two','#111')`,
      );
      // u1 owns a bag; a catalog bean has no owner
      await c.query(
        `insert into beans (id,name,color,user_id,owned) values ('b-own','Bag','#000','u1',true)`,
      );
      await c.query(`insert into beans (id,name,color) values ('b-cat','Catalog','#222')`);
      // u1 logs a tasting on their bag; u2 logs one on the catalog bean
      await c.query(`insert into tastings (id,user_id,bean_id,rating) values ('t-own','u1','b-own',5)`);
      await c.query(`insert into tastings (id,user_id,bean_id,rating) values ('t-cat','u2','b-cat',4)`);
      // cross-user engagement
      await c.query(`insert into likes (user_id,tasting_id) values ('u1','t-cat'),('u2','t-own')`);
      await c.query(`insert into comments (id,tasting_id,user_id,body) values ('c-1','t-own','u2','nice')`);

      await c.query(`delete from users where id = 'u1'`);

      const n = async (sql: string) =>
        ((await c.query(sql)).rows[0] as { n: number }).n;
      // u1 and everything they own/authored is gone
      expect(await n(`select count(*)::int n from users where id='u1'`)).toBe(0);
      expect(await n(`select count(*)::int n from beans where id='b-own'`)).toBe(0);
      expect(await n(`select count(*)::int n from tastings where id='t-own'`)).toBe(0);
      expect(await n(`select count(*)::int n from likes where user_id='u1'`)).toBe(0);
      // others' engagement ON u1's content cascades away with that content
      expect(await n(`select count(*)::int n from likes where tasting_id='t-own'`)).toBe(0);
      expect(await n(`select count(*)::int n from comments where tasting_id='t-own'`)).toBe(0);
      // u2 and their catalog content are untouched
      expect(await n(`select count(*)::int n from users where id='u2'`)).toBe(1);
      expect(await n(`select count(*)::int n from tastings where id='t-cat'`)).toBe(1);
      expect(await n(`select count(*)::int n from beans where id='b-cat'`)).toBe(1);
    } finally {
      await c.end();
    }
  });
});
```

- [ ] **Step 2: Run the integration tests**

Ensure a test Postgres is reachable and `DATABASE_URL` points at it (locally via `.env.test`; the file is auto-loaded by `test/integration/setup.ts`). Run:

```bash
npm run test:integration -- test/integration/account-deletion.test.ts
```

Expected: PASS — 2 tests. (If `DATABASE_URL` is unset the suite is skipped, not failed — confirm it actually ran, not skipped.)

- [ ] **Step 3: Run the full integration suite to confirm no regressions**

Run: `npm run test:integration`
Expected: PASS — existing integration tests (constraints, scoped-queries, pagination, smoke) still green.

- [ ] **Step 4: Commit**

```bash
git add test/integration/account-deletion.test.ts
git commit -m "$(cat <<'EOF'
test(integration): account deletion cascade + FK confdeltype (m4a)

Real-DB proof that DELETE FROM users removes the user's own rows and
cross-user engagement on them, while sparing other users' catalog
content. Asserts both FKs are ON DELETE CASCADE.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `/settings` route, client, screen, and nav entry

**Files:**
- Create: `app/settings/page.tsx`, `app/settings/settings-client.tsx`, `components/settings.tsx`
- Modify: `components/app-provider.tsx` (sidebar user block, around line 359)

- [ ] **Step 1: Create the `SettingsScreen` component**

Create `components/settings.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useData } from "./data-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signOutAllDevices, deleteAccount } from "@/app/account-actions";

export function SettingsScreen() {
  const D = useData();
  const handle = D.me?.handle ?? "";
  const [confirm, setConfirm] = useState("");
  const [armed, setArmed] = useState(false);
  const canDelete = handle.length > 0 && confirm.trim() === handle;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <h1 className="display" style={{ fontSize: 26, fontWeight: 700 }}>Settings</h1>

      <section style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Sign out everywhere</h2>
        <p style={{ color: "var(--mocha)", fontSize: 14, marginBottom: 14 }}>
          Sign out of every device, including this one. Other sessions lose access on their next request.
        </p>
        <form action={signOutAllDevices}>
          <Button type="submit" variant="outline">Sign out everywhere</Button>
        </form>
      </section>

      <section style={{ border: "1px solid var(--destructive, #b24a44)", borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Delete account</h2>
        <p style={{ color: "var(--mocha)", fontSize: 14, marginBottom: 14 }}>
          Permanently delete your account and all your brews, bags, likes, comments, and follows.
          This cannot be undone.
        </p>
        {!armed ? (
          <Button variant="outline" onClick={() => setArmed(true)}>Delete my account…</Button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label htmlFor="confirm-handle" style={{ fontSize: 13.5 }}>
              Type your handle <strong>@{handle}</strong> to confirm:
            </label>
            <Input
              id="confirm-handle"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={handle}
              autoComplete="off"
            />
            <form action={deleteAccount}>
              <Button type="submit" variant="destructive" disabled={!canDelete}>
                Permanently delete account
              </Button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Create the client wrapper**

Create `app/settings/settings-client.tsx`:

```tsx
"use client";
import { SettingsScreen } from "@/components/settings";

export function SettingsClient() {
  return <SettingsScreen />;
}
```

- [ ] **Step 3: Create the auth-gated server page**

Create `app/settings/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { SettingsClient } from "./settings-client";

// Server component: settings is for signed-in users only. getCurrentUserId is
// revocation-aware, so a revoked/deleted session is redirected to /login.
export default async function SettingsPage() {
  const uid = await getCurrentUserId();
  if (!uid) redirect("/login");
  return <SettingsClient />;
}
```

- [ ] **Step 4: Add the Settings gear to the sidebar**

In `components/app-provider.tsx`, inside the `me ? ( ... )` branch of the user block (currently the profile button + the `signOutAction` form, lines ~352-363), add a gear button between the profile button and the sign-out form. After the closing `</button>` of the `nav-user` profile button (line 359) and before `<form action={signOutAction}>` (line 360), insert:

```tsx
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push("/settings")}
                    title="Settings"
                    aria-label="Settings"
                  >
                    <Icon name="settings" size={20} />
                  </Button>
```

(`Button` and `Icon` are already imported in this file; `router` is already in scope.)

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. (If `Button` lacks a `destructive` variant, fall back to `variant="outline"` with inline `style={{ color: "var(--destructive, #b24a44)" }}` on the delete button and re-run.)

- [ ] **Step 6: Live browser check**

Start the dev server on a free port (`PORT=3470 npm run dev`), sign in, click the gear → confirm `/settings` renders both cards; confirm the delete button is disabled until the handle is typed exactly. Do NOT actually submit delete here (that is Task 7's controlled verification). Visiting `/settings` while signed out must redirect to `/login`.

- [ ] **Step 7: Commit**

```bash
git add app/settings components/settings.tsx components/app-provider.tsx
git commit -m "$(cat <<'EOF'
feat(ui): /settings route with sign-out-everywhere + delete account (m4a)

Auth-gated server page → client SettingsScreen with two confirm-gated
cards. Delete requires typing the exact @handle. Gear button added to the
shell sidebar. Wires signOutAllDevices + deleteAccount.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Full verification (pre-flight + live)

**Files:** none (verification only)

- [ ] **Step 1: Full local pre-flight**

Run each and confirm green:

```bash
npm run typecheck
npm run test            # unit project
npm run test:integration
npm run lint
npm run build
```

Expected: all pass. `npm test` includes the new unit suites; `test:integration` includes `account-deletion`.

- [ ] **Step 2: Drift check**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coffee_tracker" npx drizzle-kit generate`
Expected: `No schema changes, nothing to migrate`. `git status` clean (no uncommitted `drizzle/` changes).

- [ ] **Step 3: Live 2-account verification (controller-driven, not a subagent)**

With the dev server running and two accounts (A, B):
1. **Read-path revocation / sign-out-everywhere:** Sign in as A in two browser sessions (e.g. normal + incognito). In session 1, `/settings` → "Sign out everywhere". In session 2 (do not re-login), navigate to any page → A is now treated as logged out (anonymous shell), confirming the live `session_version` bump revokes reads, not just writes.
2. **Account deletion:** Sign in as B, create a brew + a bag + like one of A's brews. Go to `/settings`, type B's handle, "Permanently delete account" → redirected to `/`, signed out. Re-attempt login as B → fails (user gone). Sign in as A → A still exists; A's own brews intact; B's brew/like are gone from feeds. Confirms cascade + clean post-delete state.

- [ ] **Step 4: Confirm no stale count corruption (spot check)**

After the deletion above, view a bean A still has reviews on and a roaster page → ratings/counts render correctly (compute-on-read), proving the cascade left no stale aggregates.

- [ ] **Step 5: Announce completion** and use **superpowers:finishing-a-development-branch** to open the PR (then run `/code-review` and post the summary comment, per the standing milestone process).

---

## Self-Review

**1. Spec coverage:**
- Migration `0002` (cascade) → Task 1. ✓
- Shared `isLiveSession` predicate → Task 2. ✓
- Read-path revocation in `getCurrentUserId` (React.cache, anon short-circuit, undefined-sv safe) → Task 3. ✓
- `signOutAllDevices` (bump→signOut order) → Task 4. ✓
- `deleteAccount` (requireUserId → tx DELETE → signOut order) → Task 4. ✓
- `/settings` route + client + screen + nav → Task 6. ✓
- Unit tests (predicate truth table, getCurrentUserId revocation+anon, action guards/order) → Tasks 2/3/4. ✓
- Integration tests (cascade behavior + `confdeltype`) → Task 5. ✓
- Drift check green → Tasks 1 & 7. ✓
- Live 2-account verification of revocation + deletion → Task 7. ✓
- Cascade blast-radius documented → spec + Task 4 comment + Task 5 assertions. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; every run step shows the command + expected result. ✓

**3. Type/name consistency:** `isLiveSession(sv, liveVersion)` signature is identical across Tasks 2 and 3. `getCurrentUserId`/`requireUserId` signatures unchanged for callers. `signOutAllDevices`/`deleteAccount` names match between Task 4 (impl + tests) and Task 6 (UI imports). `poolDb`/`db` Queryable wrappers match the existing `auth-actions.ts`/`auth.ts` pattern. Migration filename `0002_account_deletion_cascade.sql` is consistent across Tasks 1, 5, 7. ✓

**Known fallbacks noted inline:** Button `destructive` variant (Task 6 Step 5) and confirming the integration suite actually ran vs skipped (Task 5 Step 2).
