# Public Profiles — Design

**Date:** 2026-06-08
**Branch:** `feat/public-profiles`
**Status:** Approved design, pressure-tested by the 4-lens model-diverse `public-profiles-council` (privacy / handle-integrity / redaction-correctness / refactor-risk). Council reframed the indexing model and surfaced fixes folded in below.

## Goal

Ship a public `/u/[handle]` profile (full-parity, read-only), make feed/comment authors link to it, add **opt-in search indexing scoped to the profile page**, resolve handles case-insensitively, and **correct the privacy policy** so it matches the product. Additive; one schema migration (`0005`).

## Decisions (locked by the product owner)

1. **Opt-in indexing, profile-page-scoped.** New `users.discoverable boolean NOT NULL DEFAULT false` (migration 0005). A profile is **viewable by anyone with the link** regardless; the flag gates ONLY the `/u/[handle]` page's `robots` index, its sitemap inclusion, its `Person` JSON-LD, and its OG card. **Individual reviews/notes remain publicly attributed on bean pages and the feed** (status quo since M5·A — already declared "public" in privacy §3). *The council verified that bean detail pages already SSR each reviewer's name + @handle + note, are indexable, and are in the sitemap; gating `/u` does not change that, and the owner chose NOT to anonymize per-review attribution. The honest consequence is captured in the privacy-policy update (§I), which is an acceptance criterion of this milestone.*
2. **Handle case:** `getUserProfileByHandle` resolves via `lower(handle) = lower($2)`; the page **308-redirects** to the stored-case URL on a case-mismatch. Migration 0005 **also** drops the case-sensitive `unique().on(handle)` and adds a case-insensitive unique index on `lower(handle)`. `generateHandle` already emits lowercase — **no change there** (corrects the earlier decision text); only the resolver + the index swap.
3. **Full-parity, read-only** profile: avatar, name, @handle, bio, tastings/followers/following counts, top-flavors palate, recent tastings (keyset-paginated). No Edit. Private bag-inventory fields are never serialized (true by construction — the `Tasting` projection has no inventory columns).
4. **Follow/unfollow** wired via the shell's existing `toggleFollowUser` + optimistic `followedUsers` set. Self-view shows the disabled Edit, no Follow.
5. **Feed + comment authors** (avatar + @handle) link to `/u/[handle]` via a new `openUser` shell handler.

## A. Schema + migration 0005

`lib/db/schema.ts` (`users`):
- Add `discoverable: boolean("discoverable").notNull().default(false)`.
- Replace `unique().on(t.handle)` with `uniqueIndex("users_handle_lower_uq").on(lower(t.handle))` (mirrors the existing `users_email_lower_uq` pattern; `lower()` helper already exists).

`drizzle/0005_*.sql` — generate via `npx drizzle-kit generate --name public_profiles`, then **hand-prepend a preflight collision guard** (drizzle-kit won't emit it):
```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM (SELECT lower(handle) h, count(*) c FROM users GROUP BY lower(handle) HAVING count(*) > 1) t)
  THEN RAISE EXCEPTION 'case-colliding handles exist; resolve before migrating'; END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discoverable" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_handle_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_lower_uq" ON "users" (lower("handle"));
```
Commit `schema.ts` + `drizzle/0005_*.sql` + the regenerated `drizzle/meta/`. The CI drift check requires the migration committed on-branch. `discoverable NOT NULL DEFAULT false` is a safe additive column (existing rows get `false` without a rewrite). The collision guard is belt-and-suspenders: all handle insert paths already lowercase (`isValidHandle` is `[a-z0-9_]`, `validateSignup` lowercases, `generateHandle` is lowercase base36), so no collisions are expected — but the migration asserts it rather than assuming it.

**`register-errors`:** after 0005, a handle collision raises `23505` with `constraint = "users_handle_lower_uq"`. `mapRegisterError` already maps any non-`users_email_lower_uq` `23505` to the generic "couldn't pick a username" message, so it still works. Update `test/register-errors.test.ts` (currently asserts the never-live name `users_handle_key`) to assert `users_handle_lower_uq` → username message.

## B. Types

`lib/types.ts`: add `PublicProfile` = the public `User` shape **plus** `discoverable: boolean` (and it already carries the stored-case `handle`). `User` is unchanged — `getUserById`/`AppData.me` keep their shape.

## C. Queries (`lib/queries.ts`)

- `getUserProfileByHandle(viewerId: string | null, handle: string): Promise<PublicProfile | null>` — a near-clone of `getUserById`'s SELECT (the three grouped `user_follows` left-join subqueries + the `$1::text is not null`-guarded `followedByMe` EXISTS), but `WHERE lower(u.handle) = lower($2)`, adding `u.discoverable` and keeping `u.handle` (stored case). `rows[0] ?? null` (missing handle → null, never throw). **Do not modify `getUserById`.**
- `export const getUserProfileByHandleCached = cache(getUserProfileByHandle)` (React.cache) so `generateMetadata` + the page body + the OG route share one DB hit (mirrors `getBeanCached`/`getRoasterByIdCached`).
- `getUserTastingsPage(viewerId: string | null, userId: string, cursor): Promise<Page<Tasting>>` — modeled on `getBeanReviewsPage`: `$1 = viewer` (the load-bearing invariant for `likedByMe`/`savedByMe`), `$2 = target userId`, keyset cursor, **reuse `TASTING_SELECT_COLS` verbatim**, `ORDER BY t.created_at DESC, t.id DESC`. Anonymous viewer (`$1` null) → flags short-circuit to false (proven by the bean OG `getBeanCached(null, …)` precedent).
- `getTopFlavors(userId: string, limit = 6): Promise<{ flavor: string; n: number }[]>` — one query, no N+1:
  `SELECT f AS flavor, count(*)::int AS n FROM tastings t JOIN beans b ON b.id = t.bean_id, unnest(b.flavors) f WHERE t.user_id = $1 GROUP BY f ORDER BY count(*) DESC, f LIMIT $2`. (`beans.flavors` is `text[] NOT NULL DEFAULT '{}'`; `unnest` of empty contributes nothing; `tastings_user_idx` covers the filter.)
- `getUserHandlesForSitemap(): Promise<{ handle: string }[]>` — `SELECT handle FROM users WHERE discoverable = true ORDER BY created_at LIMIT 50000`. PII-free; only discoverable.

## D. Route `/u/[handle]` (under the `(app)` group)

Placed under `(app)` so it inherits `getAppData` + `AppProvider` + `useShell()` (viewer like/follow state, `openBean`) and the root `force-dynamic` cascade (nonce CSP for the JSON-LD). `TastingCard` calls `useShell()`, so the route MUST stay under `(app)` — note this dependency in the page.

`page.tsx` (server component):
- `const uid = await getCurrentUserId()` (nullable; `(app)` tolerates anonymous).
- `const raw = decodeURIComponent(params.handle)` — decode once, use for both lookup and the case comparison.
- `const profile = await getUserProfileByHandleCached(uid, raw)`.
- `if (!profile) notFound()` — **before** any redirect (real 404; the streaming `(app)` shell still 200s, so the metadata `noindex` is the reliable soft-404 guard).
- `if (raw !== profile.handle) permanentRedirect("/u/" + profile.handle)` — 308 to canonical stored case. Target is DB-derived (not user input) and `isValidHandle` forbids slashes → open-redirect-safe, loop-free.
- `const [tastings, topFlavors] = await Promise.all([getUserTastingsPage(uid, profile.id, {}), getTopFlavors(profile.id)])`.
- `const isOwn = uid === profile.id` (server-derived → no hydration flicker).
- Emit `personJsonLd(profile)` (nonce'd via `serializeJsonLd`) **only when `profile.discoverable`**.
- Render `<UserProfileClient profile={profile} initialTastings={tastings} topFlavors={topFlavors} isOwn={isOwn} />`.

`generateMetadata`: `getUserProfileByHandleCached(await getCurrentUserId(), handle)` → `userMetadata(profile, handle)`:
- `!profile` → `{ robots: { index: false, follow: false } }` (soft-404 guard).
- else: title `"{name} (@{handle}) — Cortado"`, description = bio or generic, `robots: { index: profile.discoverable, follow: profile.discoverable }`, `alternates.canonical: "/u/" + profile.handle`, openGraph/twitter.

`lib/seo.ts`: add pure `userMetadata(profile: PublicProfile | null, handle: string): Metadata` (noindex when null OR `!discoverable`).
`lib/json-ld.ts`: add `personJsonLd(profile)` (schema.org `Person`/`ProfilePage`: name, `alternateName` = @handle, url) routed through the existing `serializeJsonLd` escaper.

`user-profile-client.tsx` (`"use client"`): `const s = useShell()`; renders `<ProfileView>` with `user={profile}`, `isOwn`, `topFlavors`, the first tastings page + a **load-more** (a `loadMoreUserTastings(userId, cursor)` server action mirroring the bean-reviews load-more), `isFollowing={s.followedUsers.has(profile.id)}`, `onFollow={() => s.toggleFollowUser(profile.id)}`, `likes={s.likes}`, `onLike={s.toggleLike}`, `onOpenBean={s.openBean}`, `onOpenUser={s.openUser}`.

## E. Per-user OG card — `app/(app)/u/[handle]/opengraph-image.tsx`

`export const dynamic = "force-dynamic"`, nodejs runtime, viewer-null (`getUserProfileByHandleCached(null, handle)`). **Gated on `discoverable`:** if `!profile || !profile.discoverable` → return the generic Cortado card (so a non-discoverable user's name/handle is never served as a crawlable PNG that bypasses the profile `noindex`). Else: a **monogram** circle (first initial, background = `user.avatar` hex tint — *no remote avatar fetch*, avoids satori SSRF/latency) + name + `@handle` + "N tastings" on `background: THEME_LIGHT`.

## F. `ProfileView` extraction (`components/detail.tsx`)

Extract a presentational `ProfileView({ user, tastings, topFlavors, isOwn, isFollowing, onFollow, likes, onLike, onOpenBean, onOpenUser, hasMore?, onLoadMore? })`:
- **Remove** the `router.replace("/login")` effect and the `useData()`/`me` coupling from the presentational piece (it must never redirect — the public route serves guests).
- Header: avatar, name, `@handle`, bio; right side: `isOwn` → disabled "Edit" (as today), else Follow/Following button.
- Stats from `user.tastings/followers/following`; palate from `topFlavors` (prop); recent tastings = `TastingCard`s + optional load-more.

`app/(app)/profile/page.tsx` gains a **server-side auth guard** (`getCurrentUserId()`; `redirect("/login")` if null) — the guard moves here from the excised effect. `profile-client.tsx` keeps reading own data from context (preserving the optimistic edit/delete UX) and feeds `ProfileView` with `isOwn`; for the palate it computes top flavors from `myTastings` with the **same tie-break** (`count desc, flavor asc`) as `getTopFlavors`, so the two surfaces can't diverge. (`ProfileScreen`'s current behavior already computes the palate from `myTastings`; this only extracts it.)

## G. Feed/comment author links

- Add `openUser: (handle: string) => void` to `ShellApi` (`app-provider.tsx`), implemented as `router.push("/u/" + handle)`, exposed in the shell object alongside `openBean`/`openRoaster`.
- In `components/cards.tsx`, wrap **only the avatar + name/@handle group** in a link to `openUser(authorHandle)` — keep the existing Follow ghost button **outside** it (no nested interactive elements), with a distinct style + `aria-label` "View {name}'s profile". Apply the same to the comment-thread author.

## H. Settings toggle — `app/profile-actions.ts` + `settings-client.tsx`

- New `setDiscoverable(on: boolean)` server action (authed via `getCurrentUserId`; `UPDATE users SET discoverable = $2 WHERE id = $1`; `revalidatePath("/u/" + handle)` + `revalidatePath("/sitemap.xml")`).
- Settings adds a **"Discoverable"** toggle ("Let search engines index your public profile"), defaulting to the user's current value, plus the user's public link `/u/{handle}` with a "View" affordance.

## I. Privacy policy update (acceptance criterion)

Edit `app/(legal)/privacy/page.tsx` §3 to make code and policy agree:
1. A **public profile** lives at a shareable URL (`/u/{handle}`) viewable by anyone with the link.
2. The **"discoverable" setting** controls search-engine indexing + sitemap inclusion of that profile page, **default OFF**.
3. Individual **reviews/notes shown on public bean pages and the feed are public and may be individually indexed**, independent of the profile setting.
4. Bump the "Last updated" date. Add a small test (extend `legal-links`/`legal-pages`) asserting §3 mentions the profile URL + discoverable.

## J. OAuth handle-collision hardening

`resolveOrCreateOAuthUser` (`lib/users-repo.ts`) currently inserts `generateHandle()` with no retry/catch → an unhandled `23505` would surface inside the Auth.js `jwt` callback. Add a **single retry** with a fresh `generateHandle()` on a handle-index `23505` (entropy makes one retry sufficient), so OAuth sign-in can't fail on the astronomically-rare collision.

## K. Reserved handles (forward-compat)

Add `RESERVED_HANDLES` to `lib/handles.ts` (`u, api, settings, login, signup, discover, journal, profile, bean, roaster, feed`) and reject them in `isValidHandle`, so a handle can't shadow a current/future route segment.

## Out of scope (stated for expectations)

- **Profile editing** (bio/avatar/handle change) — the disabled "Edit" stays; its own milestone.
- **Anonymizing per-review attribution** on bean pages/feed (option B, explicitly rejected — owner chose profile-only).
- **Access-gating** non-discoverable profiles (rejected — viewable-but-noindex stands).
- Followers/following **list** pages; blocking/muting.
- `X-Robots-Tag` response-header defense-in-depth (considered; deferred — would need a DB read in middleware; the per-page `robots` meta is the guard, consistent with the bean/roaster soft-404 pattern).

## Testing

- **Unit:** `getUserProfileByHandle` SQL carries the `lower()` predicate + viewer-scoped `followedByMe` + `discoverable`; `userMetadata` is noindex when null OR `!discoverable` + canonical set; `personJsonLd` shape + escaping; `getUserHandlesForSitemap`/`sitemap.ts` include `/u` ONLY for discoverable; handle-case redirect pure logic; `RESERVED_HANDLES` rejected; `register-errors` maps `users_handle_lower_uq` → username message; migration 0005 drift clean.
- **Integration (DB):** seed two users (one discoverable, one not) + follows → assert follower/following counts, CI lookup, case-redirect target, sitemap membership (only discoverable), `setDiscoverable` flips the flag + the metadata gate, an **anonymous** viewer gets `likedByMe=false` and no private fields, `getUserProfileByHandle("nope")` → null, top-flavors aggregate.
- **Live:** `/u/{handle}` renders parity; wrong-case 308s; missing → 404/noindex; follow toggles + persists; **non-discoverable** is `noindex`, absent from the sitemap, OG = generic card; **discoverable** is indexable, in the sitemap, emits Person JSON-LD, OG = monogram card; feed + comment author links navigate; privacy §3 updated; 0 CSP violations.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `discoverable` doesn't close the original "real name in search" concern (bean/feed reviews stay attributed) | Owner chose profile-only scope; **privacy policy §3 corrected** to disclose it (acceptance criterion) |
| Migration aborts mid-flight on case-colliding handles | Preflight `DO $$` guard raises before the constraint swap; handles are already lowercase by construction |
| OG PNG leaks name+handle bypassing profile noindex | OG route gated on `discoverable` (generic card otherwise) |
| New query binds `$1` to the target not the viewer → like-state leak/spoof | Contract: `$1 = viewer` always; integration test with an anonymous + a follower viewer |
| Extracted `ProfileView` redirects guests to /login | Effect excised; auth guard moved server-side into `/profile/page.tsx` |
| OAuth sign-in throws on handle collision | Single `generateHandle` retry in `resolveOrCreateOAuthUser` |
| Soft-404 means meta `robots` is the only noindex guard | Tests assert `index:false` on `!discoverable` AND not-found paths |
