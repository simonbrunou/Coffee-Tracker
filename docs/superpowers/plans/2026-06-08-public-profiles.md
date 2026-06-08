# Public Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship a public `/u/[handle]` profile (full-parity, read-only) with feed/comment author links, opt-in search indexing scoped to the profile page, case-insensitive handle resolution, and a privacy-policy correction. Spec: `docs/superpowers/specs/2026-06-08-public-profiles-design.md`.

**Architecture:** A new `/u/[handle]` route under the `(app)` group server-resolves a handle (CI lookup → 308 canonical redirect → `notFound`), fetches a `PublicProfile` + first tastings page + top-flavors, gates JSON-LD/robots/sitemap/OG on a new `users.discoverable` flag, and renders a presentational `ProfileView` extracted from the existing own-profile screen. Migration 0005 adds `discoverable` and swaps the handle unique constraint for a `lower(handle)` index.

**Tech Stack:** Next.js 15 App Router (force-dynamic + nonce CSP), React 19, raw `pg`, Auth.js v5 (JWT, no-adapter), Drizzle (migrations only), Vitest (unit + integration), `next/og`.

**Verification:** unit + integration (`coffee-pg` up) + `tsc` + `lint` + drizzle drift + a controller-driven live pass. Green at each commit.

**Cuts:** (1) schema/migration/types/handles/oauth/register-test → (2) data layer + seo + json-ld + sitemap → (3) ProfileView + `/u` route + OG + `/profile` guard → (4) author links + settings toggle + privacy policy → (5) live verify + PR.

## File structure

- **Create:** `app/(app)/u/[handle]/page.tsx`, `app/(app)/u/[handle]/user-profile-client.tsx`, `app/(app)/u/[handle]/opengraph-image.tsx`, `app/profile-actions.ts`, `lib/profile-flavors.ts`, `test/public-profiles.test.ts`, `test/integration/public-profiles.test.ts`, `drizzle/0005_*.sql` (generated).
- **Modify:** `lib/db/schema.ts`, `lib/types.ts`, `lib/handles.ts`, `lib/users-repo.ts`, `lib/queries.ts`, `lib/seo.ts`, `lib/json-ld.ts`, `app/sitemap.ts`, `app/actions.ts`, `components/detail.tsx` (extract `ProfileView`), `app/(app)/profile/page.tsx`, `app/(app)/profile/profile-client.tsx`, `components/app-provider.tsx`, `components/cards.tsx`, `components/comment-thread.tsx`, `components/settings.tsx`, `app/(app)/settings/page.tsx` + `settings-client.tsx`, `app/(legal)/privacy/page.tsx`, `test/register-errors.test.ts`.

---

## Cut 1 — Schema + migration 0005 + types + handles + OAuth retry

### Task 1: `discoverable` column + CI handle unique index (migration 0005)

**Files:** Modify `lib/db/schema.ts`; generate `drizzle/0005_*.sql` + `drizzle/meta/`.

- [ ] **Step 1: Edit `lib/db/schema.ts`.** Add `boolean` to the `drizzle-orm/pg-core` import. In the `users` columns (after `bio`), add:

```ts
    discoverable: boolean("discoverable").notNull().default(false),
```

In the `users` table extras callback, replace `unique().on(t.handle),` with:

```ts
    // Case-insensitive handle uniqueness (so @Sam and @sam can't coexist) — the
    // public /u/[handle] lookup is lower(handle)=lower($). 23505 here still falls
    // through mapRegisterError to the generic username message.
    uniqueIndex("users_handle_lower_uq").on(lower(t.handle)),
```

(Remove the now-stale comment about `unique().on(t.handle)` above it. Keep the `users_email_lower_uq` line. `unique` may now be an unused import — remove it from the import if so.)

- [ ] **Step 2: Generate the migration.**

Run: `npx drizzle-kit generate --name public_profiles`
Expected: a new `drizzle/0005_*.sql` with `ALTER TABLE "users" ADD COLUMN "discoverable" ...`, `DROP CONSTRAINT "users_handle_unique"`, and `CREATE UNIQUE INDEX "users_handle_lower_uq" ON "users" (lower("handle"))`, plus updated `drizzle/meta/`.

- [ ] **Step 3: Hand-prepend a collision preflight** to the generated `drizzle/0005_*.sql` (drizzle won't emit it) as the FIRST statement, followed by a breakpoint:

```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM (SELECT lower(handle) h, count(*) c FROM users GROUP BY lower(handle) HAVING count(*) > 1) t)
  THEN RAISE EXCEPTION 'case-colliding handles exist; resolve before migrating'; END IF;
END $$;
--> statement-breakpoint
```

- [ ] **Step 4: Apply + verify drift.**

Run: `npm run db:setup && npx drizzle-kit check`
Expected: migrate succeeds; `Everything's fine`.

- [ ] **Step 5: Commit.**

```bash
git add lib/db/schema.ts drizzle/ && git commit -m "feat(profiles): migration 0005 — users.discoverable + lower(handle) unique index"
```

### Task 2: `PublicProfile` type

**Files:** Modify `lib/types.ts`; Test `test/public-profiles.test.ts` (create).

- [ ] **Step 1: Write the failing test** (`test/public-profiles.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("PublicProfile type", () => {
  it("extends User with discoverable", () => {
    const src = read("lib/types.ts");
    expect(src).toMatch(/interface PublicProfile extends User/);
    expect(src).toMatch(/discoverable: boolean/);
  });
});
```

- [ ] **Step 2: Run → fail.** `npx vitest run test/public-profiles.test.ts`

- [ ] **Step 3: Add to `lib/types.ts`** (after the `User` interface):

```ts
/** A user's PUBLIC profile (the /u/[handle] page). Adds the indexing opt-in flag
 *  to the all-public User shape; carries NO private fields. */
export interface PublicProfile extends User {
  discoverable: boolean;
}
```

- [ ] **Step 4: Run → pass; `npx tsc --noEmit`.**

### Task 3: Reserved handles

**Files:** Modify `lib/handles.ts`; extend `test/public-profiles.test.ts`.

- [ ] **Step 1: Failing test** (add to `test/public-profiles.test.ts`):

```ts
import { isValidHandle } from "@/lib/handles";
describe("reserved handles", () => {
  it("rejects route-shadowing handles", () => {
    for (const h of ["settings", "discover", "u", "api", "profile"]) expect(isValidHandle(h)).toBe(false);
  });
  it("still accepts normal handles", () => {
    expect(isValidHandle("simon_b")).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Edit `lib/handles.ts`:**

```ts
/** Handles that would shadow a current/future route segment under /u or the app. */
export const RESERVED_HANDLES = new Set([
  "u", "api", "settings", "login", "signup", "discover", "journal", "profile", "bean", "roaster", "feed",
]);

/** 3–30 chars, lowercase letters/digits/underscore, not a reserved route word. */
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(handle) && !RESERVED_HANDLES.has(handle);
}
```

- [ ] **Step 4: Run → pass; tsc.**

### Task 4: OAuth handle-collision retry + register-errors test fix

**Files:** Modify `lib/users-repo.ts`, `test/register-errors.test.ts`; extend `test/public-profiles.test.ts`.

- [ ] **Step 1: Fix `test/register-errors.test.ts`** — the handle test asserts a constraint name that never existed (`users_handle_key`) and is gone after 0005. Change it to the new index name:

```ts
  it("maps a handle collision to a retryable message", () => {
    const e = Object.assign(new Error("dup"), { code: "23505", constraint: "users_handle_lower_uq" });
    expect(mapRegisterError(e)).toMatch(/try again/i);
  });
```

- [ ] **Step 2: Failing unit test for the OAuth retry** (add to `test/public-profiles.test.ts`):

```ts
import { resolveOrCreateOAuthUser } from "@/lib/users-repo";
describe("OAuth handle-collision retry", () => {
  it("retries the user insert once on a handle unique violation", async () => {
    const calls: string[] = [];
    let userInserts = 0;
    const db = {
      query: async (text: string) => {
        if (text.startsWith("select user_id from accounts")) return { rows: [] };
        if (text.startsWith("insert into users")) {
          userInserts++;
          calls.push("user");
          if (userInserts === 1) throw Object.assign(new Error("dup"), { code: "23505", constraint: "users_handle_lower_uq" });
          return { rows: [] };
        }
        if (text.startsWith("insert into accounts")) { calls.push("account"); return { rows: [] }; }
        return { rows: [] };
      },
    };
    const id = await resolveOrCreateOAuthUser(db, { provider: "google", providerAccountId: "x", type: "oidc", name: "A", email: null, image: null });
    expect(userInserts).toBe(2); // retried once
    expect(calls).toContain("account"); // proceeded after the retry
    expect(id).toMatch(/^u-/);
  });
});
```

- [ ] **Step 3: Run → fail** (current code inserts once, no retry).

- [ ] **Step 4: Edit `lib/users-repo.ts`** — replace the single user insert in `resolveOrCreateOAuthUser` with a one-retry wrapper:

```ts
  const userId = `u-${randomUUID()}`;
  // generateHandle() has ~52 bits of entropy, but after migration 0005 the
  // lower(handle) unique index could (astronomically rarely) collide — retry ONCE
  // with a fresh handle so an OAuth sign-in never throws the raw pg error inside
  // the Auth.js jwt callback.
  const insertUser = () =>
    db.query(
      `insert into users (id, name, handle, avatar, email, image, session_version, email_verified)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, p.name ?? "Coffee drinker", generateHandle(), randomAvatarTint(), p.email, p.image, 0, p.emailVerified ? new Date() : null],
    );
  try {
    await insertUser();
  } catch (e) {
    const pe = e as { code?: string; constraint?: string };
    if (pe?.code === "23505" && pe.constraint === "users_handle_lower_uq") await insertUser();
    else throw e;
  }
```

- [ ] **Step 5: Run → pass; tsc; full unit suite.** Then **commit Cut 1:**

```bash
git add -A && git commit -m "feat(profiles): PublicProfile type, reserved handles, OAuth handle-collision retry, register-errors test"
```

---

## Cut 2 — Data layer + seo + json-ld + sitemap

### Task 5: Profile + tastings + top-flavors + sitemap queries

**Files:** Modify `lib/queries.ts`; Test `test/integration/public-profiles.test.ts` (create).

- [ ] **Step 1: Add the queries to `lib/queries.ts`** (after `getUserById`). Reuse `TASTING_SELECT_COLS`/`TASTING_JOINS`, `clampLimit`, `decodeCursor`, `toPage`, and the React `cache` already imported:

```ts
import type { PublicProfile } from "@/lib/types"; // add to the existing type imports if not present

/** A user's PUBLIC profile by handle (case-insensitive). $1 = viewer (for
 *  followedByMe), $2 = the handle. Mirrors getUserById's aggregates; adds
 *  discoverable. Missing handle → null (page calls notFound). */
export async function getUserProfileByHandle(currentUserId: string | null, handle: string): Promise<PublicProfile | null> {
  const { rows } = await query<PublicProfile>(
    `select u.id, u.name, u.handle, u.avatar,
            coalesce(t.tastings, 0)::int   as tastings,
            coalesce(fr.followers, 0)::int as followers,
            coalesce(fg.following, 0)::int as following,
            u.bio, u.discoverable,
            ($1::text is not null and exists (
              select 1 from user_follows uf where uf.followee_id = u.id and uf.follower_id = $1
            )) as "followedByMe"
     from users u
     left join (select user_id, count(*) as tastings from tastings group by user_id) t on t.user_id = u.id
     left join (select followee_id, count(*) as followers from user_follows group by followee_id) fr on fr.followee_id = u.id
     left join (select follower_id, count(*) as following from user_follows group by follower_id) fg on fg.follower_id = u.id
     where lower(u.handle) = lower($2) limit 1`,
    [currentUserId, handle],
  );
  return rows[0] ?? null;
}
/** React.cache so generateMetadata + page body + the OG route share one DB hit. */
export const getUserProfileByHandleCached = cache(getUserProfileByHandle);

/** Keyset page of a user's tastings. $1 = viewer (liked/saved flags), $2 = target. */
export async function getUserTastingsPage(
  currentUserId: string | null,
  userId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<Page<Tasting>> {
  const limit = clampLimit(opts.limit);
  const cur = decodeCursor(opts.cursor);
  const { rows } = await query<Tasting>(
    `select ${TASTING_SELECT_COLS} from tastings t ${TASTING_JOINS}
     where t.user_id = $2
       and ($3::timestamptz is null or (t.created_at, t.id) < ($3::timestamptz, $4))
     order by t.created_at desc, t.id desc limit $5`,
    [currentUserId, userId, cur?.ts ?? null, cur?.id ?? null, limit + 1],
  );
  return toPage(rows, limit);
}

/** A user's most-used flavor notes (one query, no N+1). */
export async function getTopFlavors(userId: string, limit = 6): Promise<{ flavor: string; n: number }[]> {
  const { rows } = await query<{ flavor: string; n: number }>(
    `select f as flavor, count(*)::int as n
     from tastings t join beans b on b.id = t.bean_id, unnest(b.flavors) f
     where t.user_id = $1 group by f order by count(*) desc, f limit $2`,
    [userId, limit],
  );
  return rows;
}

/** Discoverable users' handles for the sitemap (PII-free, bounded). */
export async function getUserHandlesForSitemap(): Promise<{ handle: string }[]> {
  const { rows } = await query<{ handle: string }>(
    `select handle from users where discoverable = true order by created_at limit 50000`,
  );
  return rows;
}
```

- [ ] **Step 2: Integration test** (`test/integration/public-profiles.test.ts`) — model on `test/integration/` setup (seed via the shared helpers; check an existing integration test for the seed/reset pattern and the `query` import). Cover:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { query } from "@/lib/db";
import { getUserProfileByHandle, getUserTastingsPage, getTopFlavors, getUserHandlesForSitemap } from "@/lib/queries";

// NOTE: follow the existing test/integration/ seeding convention (see setup.ts +
// another integration test) to insert two users (one discoverable, one not), a
// follow edge, a bean, and a tasting with a flavor. Pseudocode of the asserts:
describe("public profile queries (DB)", () => {
  it("resolves a handle case-insensitively and computes counts", async () => {
    const p = await getUserProfileByHandle(null, "SEED_HANDLE_UPPER");
    expect(p?.handle).toBe("seed_handle"); // stored case
    expect(typeof p?.followers).toBe("number");
    expect(p?.discoverable).toBe(false);
  });
  it("returns null for a missing handle", async () => {
    expect(await getUserProfileByHandle(null, "nope_nope")).toBeNull();
  });
  it("anonymous viewer gets likedByMe=false and no private fields", async () => {
    const page = await getUserTastingsPage(null, "SEED_USER_ID", {});
    expect(page.rows.every((t) => t.likedByMe === false)).toBe(true);
    expect(JSON.stringify(page.rows)).not.toMatch(/bagWeight|purchased|remaining|where_bought/i);
  });
  it("top flavors aggregates", async () => {
    const f = await getTopFlavors("SEED_USER_ID");
    expect(Array.isArray(f)).toBe(true);
  });
  it("sitemap lists only discoverable handles", async () => {
    const handles = (await getUserHandlesForSitemap()).map((h) => h.handle);
    expect(handles).not.toContain("seed_handle"); // discoverable=false
  });
});
```

- [ ] **Step 3: Run integration** (`coffee-pg` up): `npm run test:integration` → green. tsc.

- [ ] **Step 4: Commit.** `git add -A && git commit -m "feat(profiles): getUserProfileByHandle[Cached] + getUserTastingsPage + getTopFlavors + sitemap query"`

### Task 6: `userMetadata` (SEO) + `personJsonLd`

**Files:** Modify `lib/seo.ts`, `lib/json-ld.ts`; extend `test/public-profiles.test.ts`.

- [ ] **Step 1: Failing tests** (add to `test/public-profiles.test.ts`):

```ts
import { userMetadata } from "@/lib/seo";
import { personJsonLd } from "@/lib/json-ld";
const prof = (d: boolean) => ({ id: "u1", name: "Sam", handle: "sam", avatar: "#abc", tastings: 3, followers: 1, following: 2, followedByMe: false, bio: "hi", discoverable: d });
describe("userMetadata", () => {
  it("noindex when not found", () => {
    expect(userMetadata(null, "x").robots).toEqual({ index: false, follow: false });
  });
  it("noindex when not discoverable, index when discoverable, canonical set", () => {
    expect(userMetadata(prof(false), "sam").robots).toEqual({ index: false, follow: false });
    expect(userMetadata(prof(true), "sam").robots).toEqual({ index: true, follow: true });
    expect(userMetadata(prof(true), "sam").alternates?.canonical).toBe("/u/sam");
  });
});
describe("personJsonLd", () => {
  it("is a ProfilePage with a Person main entity", () => {
    const ld = personJsonLd(prof(true), "https://x/u/sam");
    expect(ld["@type"]).toBe("ProfilePage");
    expect((ld.mainEntity as Record<string, unknown>)["@type"]).toBe("Person");
    expect((ld.mainEntity as Record<string, unknown>).alternateName).toBe("@sam");
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Add `userMetadata` to `lib/seo.ts`** (import `PublicProfile` into the type import):

```ts
export function userMetadata(profile: PublicProfile | null, handle: string): Metadata {
  // Soft-404: notFound() returns 200 under the (app) streaming shell, so noindex
  // is the reliable guard for a missing profile. Opt-in: noindex unless discoverable.
  if (!profile) return { title: "Profile not found — Cortado", robots: { index: false, follow: false } };
  const title = `${profile.name} (@${profile.handle}) — Cortado`;
  const description = profile.bio?.trim() || `${profile.name} on Cortado — coffee tastings and palate.`;
  const canonical = `/u/${profile.handle}`;
  return {
    title,
    description,
    robots: { index: profile.discoverable, follow: profile.discoverable },
    alternates: { canonical },
    openGraph: { type: "profile", title, description, url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}
```

- [ ] **Step 4: Add `personJsonLd` to `lib/json-ld.ts`:**

```ts
/** schema.org ProfilePage wrapping a Person (emitted ONLY for discoverable profiles). */
export function personJsonLd(profile: { name: string; handle: string }, url: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    mainEntity: { "@type": "Person", name: profile.name, alternateName: `@${profile.handle}`, url },
  };
}
```

- [ ] **Step 5: Run → pass; tsc.**

### Task 7: Sitemap wiring

**Files:** Modify `app/sitemap.ts`; Test `test/sitemap.test.ts` (extend).

- [ ] **Step 1: Extend `test/sitemap.test.ts`** — assert the sitemap maps discoverable handles to `/u/...`. Add a test that mocks `getUserHandlesForSitemap` to return `[{ handle: "sam" }]` (follow the existing mock pattern in that file) and asserts a `${base}/u/sam` entry is present, and that the static set still excludes `/u` when empty.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Edit `app/sitemap.ts`** — import + wire the user query:

```ts
import { getBeanIdsForSitemap, getRoasterIdsForSitemap, getUserHandlesForSitemap } from "@/lib/queries";
// ...
  const [beans, roasters, users] = await Promise.all([
    getBeanIdsForSitemap(),
    getRoasterIdsForSitemap(),
    getUserHandlesForSitemap(),
  ]);
  // ...
  const userRoutes: MetadataRoute.Sitemap = users.map((u) => ({ url: `${base}/u/${u.handle}` }));
  return [...staticRoutes, ...beanRoutes, ...roasterRoutes, ...userRoutes];
```

- [ ] **Step 4: Run → pass; tsc; lint; build (no-DB) → confirm `/sitemap.xml` still `force-dynamic`/builds. Commit Cut 2:**

```bash
git add -A && git commit -m "feat(profiles): userMetadata + personJsonLd + discoverable users in sitemap"
```

---

## Cut 3 — ProfileView extraction + `/u/[handle]` route + OG + `/profile` guard

### Task 8: Shared `computeTopFlavors` helper

**Files:** Create `lib/profile-flavors.ts`; extend `test/public-profiles.test.ts`.

- [ ] **Step 1: Failing test:**

```ts
import { computeTopFlavors } from "@/lib/profile-flavors";
describe("computeTopFlavors", () => {
  it("counts + orders by count desc then name, capped", () => {
    const t = (flavors: string[]) => ({ beanFlavors: flavors } as { beanFlavors: string[] });
    const out = computeTopFlavors([t(["cocoa", "nutty"]), t(["cocoa"]), t(["apple"])], 2);
    expect(out).toEqual([{ flavor: "cocoa", n: 2 }, { flavor: "apple", n: 1 }]);
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Create `lib/profile-flavors.ts`** — the client-side equivalent of the `getTopFlavors` SQL (same tie-break: count desc, then flavor asc) so `/profile` and `/u/[me]` can't diverge:

```ts
/** Own-profile top flavors from in-memory tastings. Mirrors getTopFlavors' SQL
 *  ordering (count desc, then flavor name asc) so /profile and /u/[me] match. */
export function computeTopFlavors(tastings: { beanFlavors: string[] }[], limit = 6): { flavor: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const t of tastings) for (const f of t.beanFlavors) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts.entries()]
    .map(([flavor, n]) => ({ flavor, n }))
    .sort((a, b) => b.n - a.n || a.flavor.localeCompare(b.flavor))
    .slice(0, limit);
}
```

- [ ] **Step 4: Run → pass; tsc.**

### Task 9: Extract `ProfileView` from `ProfileScreen`

**Files:** Modify `components/detail.tsx`.

- [ ] **Step 1: Add `openUser` to the existing `ProfileScreen` callers' prop set is handled later (Task 13). For now, extract `ProfileView`.** Replace the body of `ProfileScreen` (`components/detail.tsx:519`-end of its function) with a presentational `ProfileView` plus a thin `ProfileScreen` wrapper. `ProfileView`:

```tsx
export function ProfileView({
  user,
  initialTastings,
  topFlavors,
  isOwn,
  isFollowing,
  onFollow,
  likes,
  onLike,
  onOpenBean,
  onOpenUser,
  loadMore,
}: {
  user: User;
  initialTastings: Page<Tasting>;
  topFlavors: { flavor: string; n: number }[];
  isOwn: boolean;
  isFollowing: boolean;
  onFollow: () => void;
  likes: Set<string>;
  onLike: (id: string) => void;
  onOpenBean: (id: string) => void;
  onOpenUser: (handle: string) => void;
  loadMore?: (cursor: string | null) => Promise<Page<Tasting>>;
}) {
  const fetcher = loadMore ?? (async () => ({ rows: [], nextCursor: null }) as Page<Tasting>);
  const { rows: tastings, loadMore: more, hasMore, pending } = useLoadMore<Tasting>(initialTastings, fetcher);
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 26, flexWrap: "wrap" }}>
        <Avatar user={user} size={84} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 className="display" style={{ fontSize: 30, fontWeight: 700 }}>{user.name}</h1>
          <div style={{ fontSize: 14, color: "var(--mocha)" }}>@{user.handle}</div>
          <p style={{ fontSize: 14.5, color: "var(--coffee)", marginTop: 8, maxWidth: 440, lineHeight: 1.5 }}>{user.bio}</p>
        </div>
        {isOwn ? (
          <Button variant="outline" disabled aria-label="Edit profile (coming soon)">
            <Icon name="settings" size={17} /> Edit
          </Button>
        ) : (
          <Button variant={isFollowing ? "outline" : "default"} onClick={onFollow}>
            {isFollowing ? "Following" : "Follow"}
          </Button>
        )}
      </div>

      <div style={{ display: "flex", gap: 28, padding: "16px 0", borderTop: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)", marginBottom: 24 }}>
        <ProfStat n={user.tastings} label="Tastings" />
        <ProfStat n={user.followers} label="Followers" />
        <ProfStat n={user.following} label="Following" />
      </div>

      <div style={{ marginBottom: 28 }}>
        <h2 className="display" style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{isOwn ? "Your palate" : "Their palate"}</h2>
        <p style={{ fontSize: 13.5, color: "var(--mocha)", marginBottom: 14 }}>The notes reached for most often.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {topFlavors.map(({ flavor, n }) => (
            <span key={flavor} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 99, background: "var(--surface)", border: "1px solid var(--line-soft)", boxShadow: "var(--shadow-sm)", fontSize: 13.5, fontWeight: 500 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: flavorColor(flavor) }} />
              {flavor}
              <span style={{ color: "var(--mocha)", fontSize: 12 }}>×{n}</span>
            </span>
          ))}
        </div>
      </div>

      <h2 className="display" style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>Recent tastings</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {tastings.map((t, i) => (
          <TastingCard key={t.id} tasting={t} delay={i * 50} onOpenBean={onOpenBean} onLike={onLike} liked={likes.has(t.id)} onOpenUser={onOpenUser} />
        ))}
      </div>
      {loadMore && hasMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <Button variant="outline" onClick={more} disabled={pending}>{pending ? "Loading…" : "Load more"}</Button>
        </div>
      )}
    </div>
  );
}
```

(`ProfStat` and `flavorColor` already exist in `detail.tsx`; `useLoadMore`, `TastingCard`, `Avatar`, `Icon`, `Button` are already imported there. `onOpenUser` on `TastingCard` is added in Task 13 — until then it is an unused prop, which is fine because the call already passes it. If tsc complains before Task 13, add the optional `onOpenUser?` to `TastingCard` now as part of Step 1.)

- [ ] **Step 2: Replace `ProfileScreen` with a thin own-profile wrapper** (keeps reading context; the login guard moves server-side in Task 11 — remove the `useEffect`/`router.replace("/login")` and the `if (!me) return null`):

```tsx
export function ProfileScreen({ onOpenBean, onOpenUser, likes, onLike }: {
  onOpenBean: (id: string) => void;
  onOpenUser: (handle: string) => void;
  likes: Set<string>;
  onLike: (id: string) => void;
}) {
  const D = useData();
  const me = D.me;
  if (!me) return null; // server guard in /profile/page.tsx prevents this in practice
  return (
    <ProfileView
      user={me}
      initialTastings={{ rows: D.myTastings, nextCursor: null }}
      topFlavors={computeTopFlavors(D.myTastings)}
      isOwn
      isFollowing={false}
      onFollow={() => {}}
      likes={likes}
      onLike={onLike}
      onOpenBean={onOpenBean}
      onOpenUser={onOpenUser}
    />
  );
}
```

Add `import { computeTopFlavors } from "@/lib/profile-flavors";` and ensure `Page`, `User`, `Tasting` types are imported in `detail.tsx`. Remove the now-unused `useRouter`/`useEffect` from `ProfileScreen` if not used elsewhere in the file.

- [ ] **Step 3: tsc; lint.** (No new behavior yet — `profile-client.tsx` still calls `ProfileScreen`; update its props in Task 11/13.)

- [ ] **Step 4: Commit.** `git add -A && git commit -m "refactor(profiles): extract presentational ProfileView; own ProfileScreen feeds it"`

### Task 10: `/u/[handle]` route — page + client

**Files:** Create `app/(app)/u/[handle]/page.tsx`, `app/(app)/u/[handle]/user-profile-client.tsx`; add `loadMoreUserTastings` to `app/actions.ts`.

- [ ] **Step 1: Add the load-more action to `app/actions.ts`** (import `getUserTastingsPage`; model on `loadMoreBeanReviews`):

```ts
export async function loadMoreUserTastings(userId: string, cursor: string | null): Promise<Page<Tasting>> {
  const uid = await getCurrentUserId();
  return getUserTastingsPage(uid, userId, { cursor });
}
```

- [ ] **Step 2: Create `app/(app)/u/[handle]/page.tsx`:**

```tsx
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/auth";
import { getUserProfileByHandleCached, getUserTastingsPage, getTopFlavors } from "@/lib/queries";
import { getPublicBaseUrl } from "@/lib/public-url";
import { personJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { userMetadata } from "@/lib/seo";
import { UserProfileClient } from "./user-profile-client";

// This route lives UNDER (app) on purpose: TastingCard (rendered by ProfileView)
// calls useShell(), which requires AppProvider. Do not move it out of (app).
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const raw = decodeURIComponent(handle);
  return userMetadata(await getUserProfileByHandleCached(await getCurrentUserId(), raw), raw);
}

export default async function UserProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const raw = decodeURIComponent(handle);
  const uid = await getCurrentUserId();
  const profile = await getUserProfileByHandleCached(uid, raw);
  if (!profile) notFound(); // real 404 (soft, but metadata noindex covers it)
  if (raw !== profile.handle) permanentRedirect(`/u/${profile.handle}`); // 308 to canonical case
  const [tastings, topFlavors] = await Promise.all([getUserTastingsPage(uid, profile.id, {}), getTopFlavors(profile.id)]);
  const isOwn = uid === profile.id;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const base = getPublicBaseUrl();
  return (
    <>
      {profile.discoverable && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(personJsonLd(profile, `${base}/u/${profile.handle}`)) }}
        />
      )}
      <UserProfileClient profile={profile} initialTastings={tastings} topFlavors={topFlavors} isOwn={isOwn} />
    </>
  );
}
```

- [ ] **Step 3: Create `app/(app)/u/[handle]/user-profile-client.tsx`:**

```tsx
"use client";
import { ProfileView } from "@/components/detail";
import { useShell } from "@/components/app-provider";
import { loadMoreUserTastings } from "@/app/actions";
import type { PublicProfile, Page, Tasting } from "@/lib/types";

export function UserProfileClient({ profile, initialTastings, topFlavors, isOwn }: {
  profile: PublicProfile;
  initialTastings: Page<Tasting>;
  topFlavors: { flavor: string; n: number }[];
  isOwn: boolean;
}) {
  const s = useShell();
  return (
    <ProfileView
      user={profile}
      initialTastings={initialTastings}
      topFlavors={topFlavors}
      isOwn={isOwn}
      isFollowing={s.followedUsers.has(profile.id)}
      onFollow={() => s.toggleFollowUser(profile.id)}
      likes={s.likes}
      onLike={s.toggleLike}
      onOpenBean={s.openBean}
      onOpenUser={s.openUser}
      loadMore={(cursor) => loadMoreUserTastings(profile.id, cursor)}
    />
  );
}
```

(`Page`/`Tasting` are re-exported from `@/lib/types` or import `Page` from `@/lib/pagination` if needed — match how `bean-client.tsx` imports them.) `s.openUser` is added in Task 12; tsc will be green once Task 12 lands — sequence Task 12 before building, or add `openUser` to `ShellApi` first.

- [ ] **Step 4: tsc** (after Task 12 adds `openUser`). Commit with Task 12.

### Task 11: `/profile` server auth guard

**Files:** Modify `app/(app)/profile/page.tsx`, `app/(app)/profile/profile-client.tsx`.

- [ ] **Step 1: Edit `app/(app)/profile/page.tsx`** — add the server guard that replaces the excised client redirect:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { ProfileClient } from "./profile-client";

export const metadata: Metadata = { title: "Your Profile — Cortado", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  if (!(await getCurrentUserId())) redirect("/login");
  return <ProfileClient />;
}
```

- [ ] **Step 2: Edit `app/(app)/profile/profile-client.tsx`** to pass `onOpenUser`:

```tsx
"use client";
import { ProfileScreen } from "@/components/detail";
import { useShell } from "@/components/app-provider";

export function ProfileClient() {
  const s = useShell();
  return <ProfileScreen onOpenBean={s.openBean} onOpenUser={s.openUser} likes={s.likes} onLike={s.toggleLike} />;
}
```

- [ ] **Step 3: tsc** (after Task 12). Commit with Task 12.

### Task 12: Per-user OG card (gated on discoverable)

**Files:** Create `app/(app)/u/[handle]/opengraph-image.tsx`.

- [ ] **Step 1: Create the OG route** — force-dynamic, viewer-null, nodejs; generic card when missing/non-discoverable, monogram card otherwise (no remote fetch):

```tsx
import { ImageResponse } from "next/og";
import { getUserProfileByHandleCached } from "@/lib/queries";
import { THEME_LIGHT } from "@/lib/theme-colors";

export const dynamic = "force-dynamic"; // reads the DB per request
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Cortado profile";

export default async function UserOg({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await getUserProfileByHandleCached(null, decodeURIComponent(handle));
  // Gate on discoverable so a non-discoverable user's name/handle is never served
  // as a crawlable PNG that bypasses the profile's noindex.
  if (!profile || !profile.discoverable) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: THEME_LIGHT, color: "#2b2420" }}>
          <div style={{ fontSize: 96, fontWeight: 700 }}>Cortado</div>
          <div style={{ fontSize: 36, marginTop: 12, opacity: 0.7 }}>Coffee Journal</div>
        </div>
      ),
      { ...size },
    );
  }
  const initial = (profile.name.trim()[0] ?? "?").toUpperCase();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 48, padding: 80, background: THEME_LIGHT, color: "#2b2420" }}>
        <div style={{ width: 220, height: 220, borderRadius: "50%", background: profile.avatar, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 120, fontWeight: 700 }}>{initial}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, fontWeight: 700 }}>{profile.name}</div>
          <div style={{ fontSize: 36, opacity: 0.7, marginTop: 8 }}>@{profile.handle}</div>
          <div style={{ fontSize: 32, opacity: 0.6, marginTop: 18 }}>{profile.tastings} tastings · Cortado</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 2: Add `openUser` to the shell** (`components/app-provider.tsx`): add `openUser: (handle: string) => void;` to `ShellApi`; implement `const openUser = (handle: string) => router.push(\`/u/${handle}\`);` near `openBean`/`openRoaster`; add `openUser` to the `shell` object.

- [ ] **Step 3: tsc; lint; build (no-DB)** — confirm `/u/[handle]`, `/u/[handle]/opengraph-image` appear (dynamic) and the build has no DB error.

- [ ] **Step 4: Commit Cut 3:** `git add -A && git commit -m "feat(profiles): /u/[handle] route + client + monogram OG (discoverable-gated) + /profile server guard + openUser shell handler"`

---

## Cut 4 — Author links + settings toggle + privacy policy

### Task 13: Feed + comment author links

**Files:** Modify `components/cards.tsx`, `components/comment-thread.tsx`.

- [ ] **Step 1: `components/cards.tsx`** — add `onOpenUser?: (handle: string) => void` to `TastingCard`'s props. Make the avatar + `@handle` open the profile (keep the Follow button separate — no nested interactive). Wrap the `<Avatar>` in a button and make the `@handle` line a button:

```tsx
// avatar:
<button onClick={() => onOpenUser?.(tasting.authorHandle)} aria-label={`View ${tasting.authorName}'s profile`} style={{ borderRadius: "50%", lineHeight: 0 }}>
  <Avatar user={{ name: tasting.authorName, avatar: tasting.authorAvatar }} size={38} />
</button>
// handle line (replace the plain @handle div):
<button onClick={() => onOpenUser?.(tasting.authorHandle)} style={{ fontSize: 12.5, color: "var(--mocha)", textAlign: "left" }}>
  @{tasting.authorHandle}
</button>
<span style={{ fontSize: 12.5, color: "var(--mocha)" }}> · {ago}</span>
```

The default feed `TastingCard` is rendered in `components/screens.tsx` (the feed) and gets `onOpenUser` from the shell — thread `onOpenUser={s.openUser}` (or `useShell().openUser`) where the feed maps `TastingCard`. Where `onOpenUser` is not provided (defensive), the `?.` no-ops.

- [ ] **Step 2: `components/comment-thread.tsx`** — thread an `onOpenUser` into `CommentRow` and make the author name/handle clickable:

```tsx
// CommentRow: add onOpenUser prop; wrap the author name in a button:
<button onClick={() => onOpenUser?.(c.authorHandle)} style={{ fontWeight: 600 }}>{c.authorName}</button>
```

Pass `onOpenUser={shell.openUser}` from `CommentThread` (which is a client component with shell access, or thread it from the parent that renders it).

- [ ] **Step 3: tsc; lint** (jsx-a11y gate — buttons have text or aria-label). Run the unit suite. Commit.

```bash
git add -A && git commit -m "feat(profiles): feed + comment authors link to /u/[handle]"
```

### Task 14: `setDiscoverable` action + `getDiscoverable` + settings toggle

**Files:** Create `app/profile-actions.ts`; modify `lib/queries.ts` (`getDiscoverable`), `app/(app)/settings/page.tsx`, `app/(app)/settings/settings-client.tsx`, `components/settings.tsx`; extend `test/public-profiles.test.ts`.

- [ ] **Step 1: Add `getDiscoverable` to `lib/queries.ts`:**

```ts
export async function getDiscoverable(userId: string): Promise<boolean> {
  const { rows } = await query<{ discoverable: boolean }>(`select discoverable from users where id = $1`, [userId]);
  return rows[0]?.discoverable ?? false;
}
```

- [ ] **Step 2: Create `app/profile-actions.ts`:**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { getUserById } from "@/lib/queries";

/** Toggle whether the caller's public profile is search-indexable (opt-in). */
export async function setDiscoverable(on: boolean): Promise<void> {
  const uid = await getCurrentUserId();
  if (!uid) throw new Error("Not signed in");
  await query(`update users set discoverable = $2 where id = $1`, [uid, on]);
  const me = await getUserById(uid, uid);
  if (me) revalidatePath(`/u/${me.handle}`);
  revalidatePath("/settings");
  revalidatePath("/sitemap.xml");
}
```

- [ ] **Step 3: Make settings server-fetch `discoverable`.** `app/(app)/settings/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getDiscoverable } from "@/lib/queries";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Settings — Cortado", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const uid = await getCurrentUserId();
  if (!uid) redirect("/login");
  return <SettingsClient discoverable={await getDiscoverable(uid)} />;
}
```

`settings-client.tsx`:

```tsx
"use client";
import { SettingsScreen } from "@/components/settings";
export function SettingsClient({ discoverable }: { discoverable: boolean }) {
  return <SettingsScreen discoverable={discoverable} />;
}
```

- [ ] **Step 4: Add the toggle to `components/settings.tsx`** — `SettingsScreen` takes `{ discoverable }`, reads `D.me` for the handle, adds a "Public profile" section. Use a form posting to `setDiscoverable` (bind the opposite value) + a link to the user's `/u/{handle}`:

```tsx
// imports: import { setDiscoverable } from "@/app/profile-actions";
// new section (place before Legal):
<section style={{ /* match the existing section wrapper */ }}>
  <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Public profile</h2>
  <p style={{ fontSize: 13.5, color: "var(--mocha)", marginBottom: 10 }}>
    Your profile lives at <a href={`/u/${D.me?.handle}`}>/u/{D.me?.handle}</a> and is viewable by anyone with the link.
    {discoverable ? " Search engines may index it." : " Search engines are asked not to index it."}
  </p>
  <form action={setDiscoverable.bind(null, !discoverable)}>
    <Button type="submit" variant="outline">
      {discoverable ? "Make profile non-indexable" : "Let search engines index my profile"}
    </Button>
  </form>
</section>
```

(`setDiscoverable.bind(null, !discoverable)` is the mechanism: `SettingsScreen` is a client component, and a server action can be `.bind`-partially-applied and passed to a client `<form action>`.)

- [ ] **Step 5: Test** — extend `test/public-profiles.test.ts` with a structural assertion that `app/profile-actions.ts` calls `revalidatePath("/sitemap.xml")` and guards on `getCurrentUserId`. (DB behavior is covered by the integration test — add a `setDiscoverable` flip assertion there if the integration harness can invoke server actions; otherwise assert via a direct `update` + `getDiscoverable` round-trip.)

- [ ] **Step 6: tsc; lint; suite. Commit.** `git add -A && git commit -m "feat(profiles): settings discoverable toggle + setDiscoverable action"`

### Task 15: Privacy policy §3 update

**Files:** Modify `app/(legal)/privacy/page.tsx`; extend `test/legal-pages.test.ts` (or `legal-links`).

- [ ] **Step 1: Failing test** — assert the privacy page mentions the public profile URL + the discoverable/indexing control. Add to `test/legal-pages.test.ts`:

```ts
it("privacy policy discloses the public profile URL + indexing control", () => {
  const src = readFileSync(join(process.cwd(), "app/(legal)/privacy/page.tsx"), "utf8");
  expect(src).toMatch(/\/u\/|public profile/i);
  expect(src).toMatch(/discoverable|index/i);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Edit `app/(legal)/privacy/page.tsx` §3** — append to the public/private paragraph (and bump the "Last updated" date at the top of the file):

```tsx
<p>You also have a <strong>public profile</strong> at <code>/u/your-handle</code>, viewable by anyone with the
  link. A <strong>"discoverable"</strong> setting (Settings → Public profile, <strong>off by default</strong>)
  controls whether search engines may index that profile page and whether it appears in our sitemap. Note that
  individual reviews and tasting notes you post are shown publicly on the relevant coffee's page and may be
  indexed by search engines independently of this setting.</p>
```

- [ ] **Step 4: Run → pass; tsc; lint; full suite; build. Commit Cut 4:**

```bash
git add -A && git commit -m "docs(profiles): privacy policy discloses public profile URL + opt-in indexing"
```

---

## Cut 5 — Live verification + PR

### Task 16: Controller-driven live verification + PR

- [ ] **Step 1: Green gate** — `npm test` (coffee-pg up) · `npm run build` · `npm run lint` · `npm run typecheck` · `npx drizzle-kit check`. All green.

- [ ] **Step 2: Seed two users** (one discoverable, one not) with a follow edge + a few tastings (via `db:setup` seed or a manual insert). Start a prod server (`AUTH_URL` set).

- [ ] **Step 3: Profile render + parity** — `/u/{handle}` shows avatar/name/@handle/bio, the three stats, palate, and recent tastings; load-more works; the own `/u/{me}` shows the disabled Edit (no Follow); a non-self shows Follow and it toggles + persists across reload.

- [ ] **Step 4: Handle case + 404** — `/u/{HANDLE-WRONG-CASE}` 308-redirects to the canonical case; `/u/does-not-exist` renders not-found and `curl -sI` head/metadata shows `noindex`.

- [ ] **Step 5: Indexing gate** — non-discoverable: `curl /u/{handle}` head has `robots ... noindex`, NO `application/ld+json`, and `/u/{handle}/opengraph-image` returns the GENERIC card; the sitemap (`curl /sitemap.xml`) does NOT list them. Flip the Settings toggle → discoverable: head has `index`, Person JSON-LD present + nonce'd, OG = monogram card, sitemap now lists `/u/{handle}`.

- [ ] **Step 6: Author links** — clicking an author avatar/@handle in the feed and in a comment thread navigates to `/u/{handle}`. 0 CSP console violations.

- [ ] **Step 7: Privacy** — `/privacy` §3 shows the public-profile + discoverable disclosure; "Last updated" bumped.

- [ ] **Step 8:** Run the in-harness `security-reviewer` + `pr-review-toolkit:code-reviewer` over `git diff main...HEAD` (instruct: no git-state changes). Apply any real findings.

- [ ] **Step 9:** finishing-a-development-branch (PR) → post the `/code-review` summary comment.

---

## Self-review notes

- **Spec coverage:** schema/migration (T1) ↔ §A; PublicProfile (T2) ↔ §B; queries (T5)/seo+json-ld (T6)/sitemap (T7) ↔ §C; route+client+OG (T10,T12)/ProfileView (T9)/`/profile` guard (T11) ↔ §D,§E,§F; computeTopFlavors (T8) ↔ §C/§F divergence note; openUser+author links (T12,T13) ↔ §G; settings toggle+action (T14) ↔ §H; privacy policy (T15) ↔ §I; OAuth retry (T4) ↔ §J; reserved handles (T3) ↔ §K; register-errors test (T4) ↔ §A; tests (all) + live (T16) ↔ §Testing.
- **Type consistency:** `PublicProfile` (T2) used in T5/T6/T10/T12; `getUserProfileByHandle(currentUserId, handle)` signature consistent T5↔T10↔T12; `getTopFlavors` returns `{flavor,n}[]` matching `computeTopFlavors` (T8) and the `ProfileView` `topFlavors` prop (T9); `Page<Tasting>` shape `{rows,nextCursor}` consistent; `loadMoreUserTastings(userId, cursor)` (T10) matches the `ProfileView.loadMore` signature (T9) and `UserProfileClient` (T10); `openUser(handle)` consistent T12↔T13↔clients.
- **Sequencing caveat:** `s.openUser` (T12 Step 2) is referenced by `user-profile-client.tsx` (T10), `profile-client.tsx` (T11), and the author-link callers (T13). If executing strictly in order, add the `openUser` field to `ShellApi` first (or accept a transient tsc red until T12). Each cut ends green.
- **No placeholders.** OG generic-card fallback mirrors `app/opengraph-image.tsx`. Profile editing is out of scope (disabled Edit stays).

---

## Revisions from the adversarial plan review (AUTHORITATIVE — supersede the task steps above)

The 4-lens review verified the plan against the real code and verdicted "execute with fixes." Apply ALL of these; they prevent red tsc/lint/build and silent UX gaps.

### R1 — Task 7 (BLOCKER, reproduced): the existing `test/sitemap.test.ts` mock must gain the new key + a default.
`app/sitemap.ts` now calls `getUserHandlesForSitemap()` and `.map()`s it; the existing `vi.mock("@/lib/queries")` factory lists only the bean/roaster getters, so the **pre-existing** sitemap test throws (`undefined.map`). In Task 7 Step 1, also: (a) add `getUserHandlesForSitemap: vi.fn()` to that mock factory, and (b) in `beforeEach` add `getUserHandlesForSitemap.mockResolvedValue([])` (the no-`/u/` assertion still holds with `[]`). The NEW test then overrides it with `[{ handle: "sam" }]`.

### R2 — Task 1 Step 1 (BLOCKER): the import instruction is stale.
`boolean` is ALREADY imported in `lib/db/schema.ts` (no-op — do not "add" it). `unique` must **NOT** be removed — the `accounts` table still uses `unique().on(t.provider, t.providerAccountId)` (schema.ts:56). Only replace `unique().on(t.handle)` in the `users` extras array with the `uniqueIndex("users_handle_lower_uq").on(lower(t.handle))` line. (Confirmed: the live constraint to DROP is `users_handle_unique` — drizzle/0000_init.sql:123 — matching the plan.)

### R3 — Task 9 (BLOCKER): make `TastingCard` accept `onOpenUser` + import `User`, deterministically.
- Step 1a: in `components/cards.tsx`, add `onOpenUser?: (handle: string) => void` to `TastingCard`'s props interface (NOT conditional — strict JSX rejects the unknown prop otherwise).
- Step 1b: in `components/detail.tsx:13`, add `User` to the type import: `import type { Bean, Page, Tasting, User } from "@/lib/types";` (`ProfileView`'s `user: User` needs it).

### R4 — Cut 3 ordering (BLOCKER): add `openUser` to `ShellApi` FIRST.
Hoist Task 12 Step 2 to the very start of Cut 3 (before Task 9). Add `openUser: (handle: string) => void` to `ShellApi` (app-provider.tsx:~43-62), implement `const openUser = (handle: string) => router.push(\`/u/${handle}\`);` near `openBean`/`openRoaster`, and add it to the `shell` object. Then every intermediate task in Cut 3 type-checks (the clients/ProfileScreen/cards all read `s.openUser`). Don't run `tsc` mid-cut expecting green until this lands.

### R5 — Task 9 Step 2 (BLOCKER, lint=error): delete the now-unused imports.
After excising the login `useEffect`/`router.replace("/login")` from `ProfileScreen`: delete `useEffect` from the line-3 `react` import and delete the entire line-4 `import { useRouter } from "next/navigation";`. **Keep** `useState` (BeanDetail uses it). `@typescript-eslint/no-unused-vars` is error-level → otherwise `npm run lint`/`next build` fail.

### R6 — Task 13 (BLOCKER): thread `onOpenUser` at ALL TastingCard call sites.
`TastingCard` renders at: `components/screens.tsx` feed (~:144), Journal saved (~:326), Journal timeline (~:396), and `components/detail.tsx` BeanDetail review list (:323) [+ ProfileView, already handled]. Add `components/screens.tsx` to the modify list. In `JournalScreen`/feed add `const s = useShell()` and pass `onOpenUser={s.openUser}`; in `BeanDetail` pass `onOpenUser={shell.openUser}` (it already has `shell`). Because the prop is optional, a missed site silently no-ops — so enumerate all four.

### R7 — Task 13 Step 2 (BLOCKER): `comment-thread.tsx` has no shell today.
`CommentThread` uses `useData()`, not `useShell()`. Add `import { useShell } from "@/components/app-provider";` + `const s = useShell();` inside `CommentThread` (it's a client component under `(app)` — valid), add `onOpenUser?: (handle: string) => void` to the private `CommentRow` props, pass `onOpenUser={s.openUser}` at the `CommentRow` call (comment-thread.tsx:~60), and make the author name a `<button onClick={() => onOpenUser?.(c.authorHandle)}>`.

### R8 — Task 14 (BLOCKER): update `SettingsScreen`/`SettingsClient` signatures + sequence.
`SettingsScreen()` and `SettingsClient()` both take zero props today. Step 4a: add `{ discoverable }: { discoverable: boolean }` to `SettingsScreen`'s parameter list before passing the prop. Create `app/profile-actions.ts` (Step 2) **before** editing `components/settings.tsx` (Step 4) to avoid a transient missing-import. The `setDiscoverable.bind(null, !discoverable)` server-action-from-client pattern is valid (same as the existing `signOutAllDevices` form).

### R9 — Task 5 Step 2 (integration test gaps): auth mock + user_follows truncation.
The new `test/integration/public-profiles.test.ts` must (a) `vi.mock("@/lib/auth", () => ({ getCurrentUserId: async () => null, requireUserId: async () => "u1" }))` as the FIRST statement (next-auth won't resolve under Vitest — `scoped-queries.test.ts` does this), and (b) include `user_follows` in the truncate list (the `scoped-queries` TABLES const omits it; a follow edge is needed for the count asserts). Model the seed/reset on `test/integration/scoped-queries.test.ts`.

### R10 — Task 10 (nit): comment the redirect/metadata interaction.
At the `permanentRedirect` in `page.tsx`, add a one-line comment: the 308 supersedes the already-computed `index:true` metadata for a non-canonical-case URL (Next discards the page render on a component redirect), so don't "fix" it into a noindex-on-redirect.

### R11 — Task 9 (known limitation, no change): own `/profile` shows ≤200 tastings.
`getMyTastings` caps at 200 (pre-existing); the own-profile `ProfileView` path passes `nextCursor: null`/no `loadMore` (to preserve the optimistic edit/delete on context `myTastings`). Add a one-line comment in the `ProfileScreen` wrapper noting the 200-cap is intentional and pre-existing (the public `/u` path is properly keyset-paginated). Do NOT switch own-profile to server pagination (would drop optimistic edit/delete).

### R12 — Task 4 (verified-correct notes, no code change): OAuth retry.
`generateHandle()` is re-evaluated per `insertUser()` call (fresh handle on retry); `userId` reuse across the two calls is safe (the first insert rolls back atomically on the constraint error, so no PK collision). Keep the `insertUser` closure as written; the column list matches today's insert exactly.
