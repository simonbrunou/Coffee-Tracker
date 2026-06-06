# M4·A — Account Lifecycle & Revocation — Design

**Status:** Approved (design) — pending spec review
**Date:** 2026-06-06
**Milestone:** M4 (auth hardening & compliance), sub-project A — the first of M4.
**Branch (to create):** `feat/m4a-account-lifecycle`

## Goal

Give a real account two things it currently lacks: the ability to **delete itself** (hard, irreversible) and the ability to **sign out everywhere**. Make session revocation actually effective by enforcing it on **read** paths, not just writes. This closes the largest remaining auth gap before public launch: today a deleted account is impossible (FK-blocked), the revoke primitive (`bumpSessionVersion`) is dead code, and a revoked-but-unexpired JWT keeps full read access for up to 30 minutes.

## Background — current state (verified in source)

- `getCurrentUserId()` (`lib/auth.ts:7-9`) is a pure cookie/JWT decode — **zero DB, no revocation check**. The session already carries `sessionVersion` (`auth.ts:86`), so the read path has everything it needs to compare.
- The JWT `sv` is **frozen at login** — the `jwt` callback returns early once `token.uid` is set (`auth.ts:62`), so it never re-reads `session_version`. Revocation can only work by comparing the frozen token value against the live DB value.
- `requireUserId()` (`lib/auth.ts:13-21`) already does this on the **write** path: `getSessionVersion` → `resolveUserOrThrow` (throws `"Session revoked"` on mismatch or `null` live version).
- `bumpSessionVersion` (`lib/users-repo.ts:75-77`) exists but has **no production caller**. "Sign out everywhere" is a no-op concept today.
- **Account deletion is FK-blocked.** `tastings.user_id` (`schema.ts:102`) and `likes.user_id` (`schema.ts:126`) are `ON DELETE NO ACTION` (confirmed `drizzle/0000_init.sql:133,139`). Every *other* user-referencing FK already cascades (accounts, beans, follows, saves, wishlist, comments).
- **No settings/account page exists.** The shell sidebar (`components/app-provider.tsx:350-368`) has a user block routing to `/profile` and a plain `signOutAction` form.
- **No `author_*` columns exist.** Tasting/comment author fields (`authorName/Handle/Avatar`) are **live JOINs** (`queries.ts:28,114`), not denormalized storage — so a deleted user leaves no orphaned identity strings. (This removes an imagined cleanup scope.)
- **All counters are compute-on-read** (`avg_rating`, `ratings`, `users.tastings`, likes) via aggregates — cascade deletion cannot leave stale counts. (Load-bearing invariant: see Risks.)

## Decisions (locked by product owner)

1. **Hard delete via cascade.** A Drizzle migration flips `tastings.user_id` + `likes.user_id` to `ON DELETE CASCADE`; `deleteAccount()` runs `DELETE FROM users` and relies on the FK graph. (Chosen over soft-delete/tombstone: cleanest right-to-erasure; today the blast radius is exactly the deleting user's own rows.)
2. **Read-path revocation in `getCurrentUserId`** (all reads), hardened with `React.cache()` memoization and a shared predicate (below).
3. **UI: a dedicated `/settings` route** (server page + client wrapper), not a profile sub-section.

## Architecture

Five units, each with one responsibility:

### 1. Migration `drizzle/0002_account_deletion_cascade.sql`
Change `onDelete` to `"cascade"` on `tastings.userId` and `likes.userId` in `lib/db/schema.ts`, then `npx drizzle-kit generate`. The generated SQL drops and re-adds each FK by its existing auto-name:

```sql
ALTER TABLE "tastings" DROP CONSTRAINT "tastings_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "tastings" ADD CONSTRAINT "tastings_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "likes" DROP CONSTRAINT "likes_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
```

The snapshot constraint names match what Postgres created, so this is correct and non-destructive. **Commit the `.sql` and the updated `drizzle/meta/` snapshot together** or the CI drift check fails.

### 2. Shared revocation predicate — `lib/auth-guard.ts`
Extract the comparison so the read and write paths can never diverge:

```ts
/** True only when the session's frozen version matches the live DB version. */
export function isLiveSession(sv: number | undefined, liveVersion: number | null): boolean {
  return liveVersion !== null && typeof sv === "number" && sv === liveVersion;
}
```

`resolveUserOrThrow` is rewritten to use it (throws `"Session revoked"` when false) — behavior unchanged, logic now shared. A missing/non-number `sv` is treated as **not live** (safe default: logged-out).

### 3. Read-path revocation — `lib/auth.ts`
`getCurrentUserId` becomes revocation-aware, memoized once per request:

```ts
import { cache } from "react";
// ...
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const s = await auth();
  const id = s?.user?.id ?? null;
  if (!id) return null;                       // anon: no DB hit
  const db = { query: (t: string, p?: unknown[]) => query(t, p) };
  const live = await getSessionVersion(db, id);
  return isLiveSession(s!.sessionVersion, live) ? id : null;  // revoked/deleted → null
});
```

- **Anonymous short-circuits before any DB query.**
- `React.cache()` dedupes the lookup to **once per RSC render pass** — so a route that calls it from both the layout (`getAppData`) and the page (`/bean`, `/roaster`, `/discover`) does a single lookup. Server Actions run outside the render pass, so each does its own single lookup (one per action — correct, just not shared). `cache()` does not memoize outside a render (e.g. in unit tests), so this dedup is verified live, not in unit tests.
- **Fail-closed is acceptable here:** a DB error throws (treated as failure) — but reads already require the DB (`getAppData` runs ~11 queries; the M3·B error boundary catches an outage). Adding the `sv` lookup introduces no new availability coupling for the logged-in shell, and anonymous browsing is unaffected.
- `requireUserId` is unchanged structurally (still throws) but now shares `isLiveSession` via `resolveUserOrThrow`.

### 4. Account Server Actions — `app/account-actions.ts` (new file, `"use server"`)

```ts
export async function signOutAllDevices(): Promise<void> {
  const userId = await requireUserId();          // auth + revocation gate
  await bumpSessionVersion(poolDb, userId);       // invalidates ALL devices' frozen sv
  await signOut({ redirectTo: "/" });             // clears this device, redirect-throws
}

export async function deleteAccount(): Promise<void> {
  const userId = await requireUserId();          // auth + revocation gate
  await withTransaction((c) => c.query("delete from users where id = $1", [userId]));
  await signOut({ redirectTo: "/" });             // DELETE committed first, then sign out
}
```

- **Ordering — `deleteAccount`:** DELETE (committed in a transaction) **then** `signOut`. The `signOut` redirect throws by design (Next.js), exactly like `signIn` in `registerUser` (`auth-actions.ts:36-39`) — so it must be the **last** statement, outside any try/catch. If `signOut` somehow fails after the row is gone, the brief dangling-cookie window is **neutralized by the new read-path revocation** (`getSessionVersion` → `null` → `getCurrentUserId` returns `null`) and by `requireUserId` on writes.
- **Ordering — `signOutAllDevices`:** `bumpSessionVersion` **before** `signOut`, so all existing JWTs (including this device's) are stale the moment the bump commits. With read-path revocation, every other device is logged out (reads *and* writes) on its next request — this is what makes "sign out everywhere" complete rather than write-only.
- Both gate on `requireUserId()` first. Next.js Server Actions are POST-only with built-in origin/action-id CSRF protection; combined with the auth gate and a client confirm step, that is sufficient (no separate CSRF token, no password re-auth — re-auth is noted as optional future hardening).

### 5. UI — `/settings` route + nav entry
- `app/settings/page.tsx` — **server component**: `const uid = await getCurrentUserId(); if (!uid) redirect("/login");` then render `<SettingsClient />`.
- `app/settings/settings-client.tsx` — `"use client"`: renders a `SettingsScreen` with two confirm-gated cards:
  - **Sign out everywhere** — button → confirm dialog → `signOutAllDevices` (in a `<form action>` or `useTransition`).
  - **Delete account** — a destructive card; the confirm requires the user to **type their `@handle`** (or the word `DELETE`) before the button enables → `deleteAccount`.
- **Nav:** add a Settings affordance to the shell sidebar near the user block (`components/app-provider.tsx:350-368`) — a gear icon button routing to `/settings`. Also reachable via a link from the profile screen.

## Data flow

- **Read request (logged in):** layout → `getAppData` → `getCurrentUserId` (cached) → 1 PK `session_version` lookup → match → id flows to scoped queries. Detail pages call `getCurrentUserId` again → cache hit, no extra query.
- **Read request (anonymous):** `getCurrentUserId` returns `null` with no DB hit; public browse unaffected.
- **Sign out everywhere:** action bumps `session_version`; on every device's *next* request, frozen `sv` ≠ live → `getCurrentUserId`/`requireUserId` reject → logged out.
- **Delete account:** action deletes the user row in a transaction; FK cascade removes accounts, beans (→ tastings on those beans → their likes/saves/comments), the user's own tastings + likes, follows (both directions), saves, wishlist, comments; then `signOut` + redirect to `/`.

## Cascade blast radius (documented)

`DELETE FROM users WHERE id=$1` transitively removes, in one atomic statement:
`accounts` · `beans` (owned bags) → their `tastings` → those tastings' `likes`/`tasting_saves`/`comments` · the user's own `tastings` (new cascade) · the user's own `likes` (new cascade) · `comments` · `user_follows` (follower & followee) · `roaster_follows` · `tasting_saves` · `bean_wishlist`.

**Today the blast radius is exactly the deleting user's own content**, because `logBrew`'s ownership guard (`from beans where id=$3 and user_id=$2`) prevents anyone else from logging a tasting on a user's owned bag. Catalog beans (`user_id IS NULL`) and other users' tastings on them are **not** touched.

**Guard-rail note (future milestone):** if "review someone else's bag" ever ships, the `bean → tastings(bean_id)` cascade would delete *other* users' reviews when the bag owner deletes their account. Revisit then (scope the delete to own-rows, or tombstone).

## Error handling

- `getCurrentUserId`: anonymous → `null` (no DB); DB error → throws (caught by the existing route error boundaries); revoked/deleted → `null`.
- `deleteAccount` / `signOutAllDevices`: `requireUserId` throws `"Unauthenticated"`/`"Session revoked"` → surfaced by the form/boundary; the trailing `signOut` redirect-throw is the success path (must be last).
- UI confirm gates prevent accidental destructive submits; the typed-handle gate on delete prevents one-click mistakes. The typed-handle gate is **UX-only** (client-side) — the security boundary is `requireUserId` (deletes only the JWT-derived id; no client input selects the target) plus Next.js Server Action CSRF protection.

## Testing

**Unit (mocked `@/lib/db`, `@/lib/auth`):**
- `isLiveSession` truth table: `(3,3)→true`, `(3,5)→false`, `(3,null)→false` (deleted), `(undefined,0)→false` (missing sv), `(3,undefined as any)` guarded.
- `getCurrentUserId`: anon (no session) returns `null` **without** calling `query`; valid sv returns id; mismatched/null live returns `null`.
- `deleteAccount`: calls `requireUserId` first; issues `delete from users where id=$1` with the right id inside `withTransaction`; `signOut` called after.
- `signOutAllDevices`: calls `bumpSessionVersion` **then** `signOut`, in order.

**Integration (real Postgres, `test/integration/`):**
- `pg_constraint.confdeltype = 'c'` for `tastings_user_id_users_id_fk` and `likes_user_id_users_id_fk` (mirrors `constraints.test.ts`).
- Full cascade: seed a user with beans + own tastings + likes + comments + saves + follows, plus a *second* user with a tasting on a **catalog** bean and a like on the first user's tasting → `DELETE FROM users` (user 1) → assert all of user 1's rows gone; assert the second user's catalog tasting **survives**; assert the second user's like on the (now-deleted) tasting is gone via the tasting cascade.
- Drizzle drift check stays green after the migration.

## Out of scope (M4·A)

- Per-device session revocation (single global `session_version` only).
- Soft-delete/tombstone, audit log, deletion "grace period".
- Password re-authentication on destructive actions (optional future hardening).
- The stale stored `roasters.beans` counter (pre-existing; not regressed by this work).
- Shared-store rate limiter, email verification, account linking, legal pages — these are M4·B/C/D.

## Risks

- **Compute-on-read is load-bearing for safe deletion.** If any future code starts trusting stored `beans.ratings`/`avg_rating`/`tastings.likes`/`users.tastings` columns, cascade deletion would silently corrupt them. Keep counts derived.
- **`React.cache()` is new to this codebase** (no existing usage) — verify at runtime that it dedupes across the layout+page boundary in this Next 15 setup.
- **`signOut` redirect semantics in Auth.js v5 beta** — confirm `signOut({ redirectTo })` throws the redirect (as `signIn` does) so the "last statement" ordering holds; the plan verifies this live.
