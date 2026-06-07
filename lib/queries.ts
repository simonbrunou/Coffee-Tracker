import "server-only";
import { cache } from "react";
import { query } from "./db";
import { getCurrentUserId } from "./auth";
import { getSessionState } from "./users-repo";
import { type Page, decodeCursor, clampLimit, toPage } from "./pagination";
import type { AppData, Bean, Comment, Roaster, Tasting, User } from "./types";

// camelCase aliases must be double-quoted (Postgres folds bare identifiers to
// lowercase); numeric columns are cast to float8 so pg returns JS numbers.

export const BEAN_COLS = `
  id, name, roaster_id as "roasterId", roaster_name as "roasterName",
  origin, process, roast, altitude, varietal,
  price::float8 as price, avg_rating::float8 as "avgRating", ratings,
  color, flavors, description as "desc", farm, varieties,
  sca_score::float8 as "scaScore", owned, bag_weight as "bagWeight",
  purchased, remaining::float8 as remaining, user_id as "ownerId",
  created_at as "createdAt"`;

// A denormalized tasting row: author + bean display fields joined in so cards
// render standalone (M3·D). $1 is ALWAYS the viewer (currentUserId) for the
// liked/saved flags; any row filter uses $2+.
const TASTING_SELECT_COLS = `
  t.id, t.user_id as "userId", t.bean_id as "beanId", t.rating, t.brew,
  t.dose, t.ratio, t.temp, t.note,
  coalesce(l.likes, 0)::int     as likes,
  coalesce(cm.comments, 0)::int as "commentsCount",
  t.time, t.created_at as "createdAt",
  u.name as "authorName", u.handle as "authorHandle", u.avatar as "authorAvatar",
  b.name as "beanName", b.color as "beanColor", b.origin as "beanOrigin",
  b.flavors as "beanFlavors", coalesce(r.name, b.roaster_name) as "beanRoasterName",
  ($1::text is not null and exists (select 1 from likes lm where lm.tasting_id=t.id and lm.user_id=$1)) as "likedByMe",
  ($1::text is not null and exists (select 1 from tasting_saves ts where ts.tasting_id=t.id and ts.user_id=$1)) as "savedByMe"`;

const TASTING_JOINS = `
  join users u on u.id = t.user_id
  join beans b on b.id = t.bean_id
  left join roasters r on r.id = b.roaster_id
  left join (select tasting_id, count(*) as likes    from likes    group by tasting_id) l  on l.tasting_id  = t.id
  left join (select tasting_id, count(*) as comments from comments group by tasting_id) cm on cm.tasting_id = t.id`;

export type FeedTab = "Recent" | "Following" | "Popular";
const FEED_TABS: FeedTab[] = ["Recent", "Following", "Popular"];
export function isFeedTab(s: string): s is FeedTab {
  return (FEED_TABS as string[]).includes(s);
}

export async function getRoasters(currentUserId: string | null): Promise<Roaster[]> {
  const { rows } = await query<Roaster>(
    `select r.id, r.name, r.city, r.founded, r.beans,
            coalesce(f.followers, 0)::int as followers, r.blurb,
            ($1::text is not null and exists (
              select 1 from roaster_follows rf where rf.roaster_id = r.id and rf.user_id = $1
            )) as "followedByMe"
     from roasters r
     left join (select roaster_id, count(*)::int as followers from roaster_follows group by roaster_id) f
       on f.roaster_id = r.id
     order by r.id`,
    [currentUserId],
  );
  return rows;
}

/** A single denormalized tasting (for write actions to return their new row). */
export async function getTastingById(currentUserId: string | null, id: string): Promise<Tasting | null> {
  const { rows } = await query<Tasting>(
    `select ${TASTING_SELECT_COLS} from tastings t ${TASTING_JOINS} where t.id = $2 limit 1`,
    [currentUserId, id],
  );
  return rows[0] ?? null;
}

/** A keyset-paginated feed page. Recent/Following use (created_at,id) cursors;
 *  Popular is a non-paginated top-N by live like count (mutating sort key). */
export async function getFeedPage(
  currentUserId: string | null,
  opts: { tab: FeedTab; cursor?: string | null; limit?: number },
): Promise<Page<Tasting>> {
  const limit = clampLimit(opts.limit);
  if (opts.tab === "Following") {
    if (!currentUserId) return { rows: [], nextCursor: null };
    const cur = decodeCursor(opts.cursor);
    const { rows } = await query<Tasting>(
      `select ${TASTING_SELECT_COLS} from tastings t
         join user_follows uf on uf.followee_id = t.user_id and uf.follower_id = $1
         ${TASTING_JOINS}
       where ($2::timestamptz is null or (t.created_at, t.id) < ($2::timestamptz, $3))
       order by t.created_at desc, t.id desc limit $4`,
      [currentUserId, cur?.ts ?? null, cur?.id ?? null, limit + 1],
    );
    return toPage(rows, limit);
  }
  if (opts.tab === "Popular") {
    const { rows } = await query<Tasting>(
      `select ${TASTING_SELECT_COLS} from tastings t ${TASTING_JOINS}
       order by coalesce(l.likes, 0) desc, t.created_at desc, t.id desc limit 50`,
      [currentUserId],
    );
    return { rows, nextCursor: null };
  }
  const cur = decodeCursor(opts.cursor); // Recent
  const { rows } = await query<Tasting>(
    `select ${TASTING_SELECT_COLS} from tastings t ${TASTING_JOINS}
     where ($2::timestamptz is null or (t.created_at, t.id) < ($2::timestamptz, $3))
     order by t.created_at desc, t.id desc limit $4`,
    [currentUserId, cur?.ts ?? null, cur?.id ?? null, limit + 1],
  );
  return toPage(rows, limit);
}

/** A tasting's comment thread (lazy — fetched on expand, not in getAppData). */
const COMMENT_COLS = `
  c.id, c.tasting_id as "tastingId", c.user_id as "userId", c.body,
  c.created_at as "createdAt", c.updated_at as "updatedAt",
  u.name as "authorName", u.handle as "authorHandle", u.avatar as "authorAvatar"`;

export async function getComments(tastingId: string): Promise<Comment[]> {
  const { rows } = await query<Comment>(
    `select ${COMMENT_COLS} from comments c join users u on u.id = c.user_id
     where c.tasting_id = $1 order by c.created_at`,
    [tastingId],
  );
  return rows;
}

/** A single denormalized comment (for write actions to return their new row). */
export async function getCommentById(id: string): Promise<Comment | null> {
  const { rows } = await query<Comment>(
    `select ${COMMENT_COLS} from comments c join users u on u.id = c.user_id where c.id = $1 limit 1`,
    [id],
  );
  return rows[0] ?? null;
}

// ---- M3·D·2: scoped + paginated bean/user queries ----

// Computed bean projection ($1 = viewer for redaction/wishlist), reused by every
// scoped catalog/shelf/detail query.
const BEAN_SELECT_COLS = `
  beans.id, beans.name, beans.roaster_id as "roasterId", beans.roaster_name as "roasterName",
  beans.origin, beans.process, beans.roast, beans.altitude, beans.varietal,
  beans.price::float8 as price,
  coalesce(r.avg_rating, 0)::float8 as "avgRating",
  coalesce(r.ratings, 0)::int       as ratings,
  beans.color, beans.flavors, beans.description as "desc", beans.farm, beans.varieties,
  beans.sca_score::float8 as "scaScore", beans.user_id as "ownerId",
  beans.created_at as "createdAt",
  coalesce(beans.owned and beans.user_id = $1, false)          as "owned",
  case when beans.user_id = $1 then beans.bag_weight end       as "bagWeight",
  case when beans.user_id = $1 then beans.purchased  end       as "purchased",
  case when beans.user_id = $1 then beans.remaining::float8 end as "remaining",
  ($1::text is not null and exists (
    select 1 from bean_wishlist w where w.bean_id = beans.id and w.user_id = $1)) as "wishlistedByMe"`;

const BEAN_JOINS = `
  left join (select bean_id, round(avg(rating), 1) as avg_rating, count(*) as ratings
             from tastings group by bean_id) r on r.bean_id = beans.id`;

/** The current viewer's own brews (bounded by their activity). */
export async function getMyTastings(userId: string): Promise<Tasting[]> {
  const { rows } = await query<Tasting>(
    `select ${TASTING_SELECT_COLS} from tastings t ${TASTING_JOINS}
     where t.user_id = $1 order by t.created_at desc, t.id desc limit 200`,
    [userId],
  );
  return rows;
}

/** Tastings the viewer has saved/bookmarked (bounded). */
export async function getSavedTastings(userId: string): Promise<Tasting[]> {
  const { rows } = await query<Tasting>(
    `select ${TASTING_SELECT_COLS} from tastings t
       join tasting_saves sv on sv.tasting_id = t.id and sv.user_id = $1
       ${TASTING_JOINS}
     order by sv.created_at desc limit 200`,
    [userId],
  );
  return rows;
}

/** The viewer's owned bags (their shelf, bounded). */
export async function getMyShelf(userId: string): Promise<Bean[]> {
  const { rows } = await query<Bean>(
    `select ${BEAN_SELECT_COLS} from beans ${BEAN_JOINS}
     where beans.user_id = $1 and beans.owned = true
     order by beans.created_at desc, beans.id desc limit 200`,
    [userId],
  );
  return rows;
}

/** Beans the viewer has wishlisted (bounded). */
export async function getWishlistBeans(userId: string): Promise<Bean[]> {
  const { rows } = await query<Bean>(
    `select ${BEAN_SELECT_COLS} from beans
       join bean_wishlist w2 on w2.bean_id = beans.id and w2.user_id = $1
       ${BEAN_JOINS}
     order by w2.created_at desc limit 200`,
    [userId],
  );
  return rows;
}

/** A single user with derived aggregates (profile / shell `me`). */
export async function getUserById(currentUserId: string | null, id: string): Promise<User | null> {
  const { rows } = await query<User>(
    `select u.id, u.name, u.handle, u.avatar,
            coalesce(t.tastings, 0)::int   as tastings,
            coalesce(fr.followers, 0)::int as followers,
            coalesce(fg.following, 0)::int as following,
            u.bio,
            ($1::text is not null and exists (
              select 1 from user_follows uf where uf.followee_id = u.id and uf.follower_id = $1
            )) as "followedByMe"
     from users u
     left join (select user_id, count(*) as tastings from tastings group by user_id) t on t.user_id = u.id
     left join (select followee_id, count(*) as followers from user_follows group by followee_id) fr on fr.followee_id = u.id
     left join (select follower_id, count(*) as following from user_follows group by follower_id) fg on fg.follower_id = u.id
     where u.id = $2 limit 1`,
    [currentUserId, id],
  );
  return rows[0] ?? null;
}

/** A single bean (catalog/detail), redaction-aware via $1 = viewer. */
export async function getBean(currentUserId: string | null, id: string): Promise<Bean | null> {
  const { rows } = await query<Bean>(
    `select ${BEAN_SELECT_COLS} from beans ${BEAN_JOINS} where beans.id = $2 limit 1`,
    [currentUserId, id],
  );
  return rows[0] ?? null;
}

/** Top beans by rating for the Discover "trending" rail (bounded top-N). */
export async function getTrendingBeans(currentUserId: string | null): Promise<Bean[]> {
  const { rows } = await query<Bean>(
    `select ${BEAN_SELECT_COLS} from beans ${BEAN_JOINS}
     order by coalesce(r.avg_rating, 0) desc, coalesce(r.ratings, 0) desc, beans.id desc limit 12`,
    [currentUserId],
  );
  return rows;
}

/** Keyset page of the Discover catalog, with optional process + text filters. */
export async function getDiscoverBeansPage(
  currentUserId: string | null,
  opts: { cursor?: string | null; limit?: number; process?: string | null; q?: string | null } = {},
): Promise<Page<Bean>> {
  const limit = clampLimit(opts.limit);
  const cur = decodeCursor(opts.cursor);
  const process = opts.process && opts.process !== "All" ? opts.process : null;
  const q = opts.q?.trim() ? `%${opts.q.trim()}%` : null;
  const { rows } = await query<Bean>(
    `select ${BEAN_SELECT_COLS} from beans ${BEAN_JOINS}
     where ($2::timestamptz is null or (beans.created_at, beans.id) < ($2::timestamptz, $3))
       and ($4::text is null or beans.process = $4)
       and ($5::text is null or beans.name ilike $5 or beans.origin ilike $5)
     order by beans.created_at desc, beans.id desc limit $6`,
    [currentUserId, cur?.ts ?? null, cur?.id ?? null, process, q, limit + 1],
  );
  return toPage(rows, limit);
}

/** Keyset page of a bean's reviews (its tastings). */
export async function getBeanReviewsPage(
  currentUserId: string | null,
  beanId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<Page<Tasting>> {
  const limit = clampLimit(opts.limit);
  const cur = decodeCursor(opts.cursor);
  const { rows } = await query<Tasting>(
    `select ${TASTING_SELECT_COLS} from tastings t ${TASTING_JOINS}
     where t.bean_id = $2
       and ($3::timestamptz is null or (t.created_at, t.id) < ($3::timestamptz, $4))
     order by t.created_at desc, t.id desc limit $5`,
    [currentUserId, beanId, cur?.ts ?? null, cur?.id ?? null, limit + 1],
  );
  return toPage(rows, limit);
}

/** Keyset page of a roaster's beans. */
export async function getRoasterBeansPage(
  currentUserId: string | null,
  roasterId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<Page<Bean>> {
  const limit = clampLimit(opts.limit);
  const cur = decodeCursor(opts.cursor);
  const { rows } = await query<Bean>(
    `select ${BEAN_SELECT_COLS} from beans ${BEAN_JOINS}
     where beans.roaster_id = $2
       and ($3::timestamptz is null or (beans.created_at, beans.id) < ($3::timestamptz, $4))
     order by beans.created_at desc, beans.id desc limit $5`,
    [currentUserId, roasterId, cur?.ts ?? null, cur?.id ?? null, limit + 1],
  );
  return toPage(rows, limit);
}

async function followedIds(table: string, selfCol: string, idCol: string, userId: string): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    `select ${idCol} as id from ${table} where ${selfCol} = $1`,
    [userId],
  );
  return rows.map((r) => r.id);
}

/** Everything the client shell needs, fetched once on the server. */
export async function getAppData(): Promise<AppData> {
  const currentUserId = await getCurrentUserId();
  // D·1 is ADDITIVE: the global users/beans/tastings/followingTastings arrays are
  // still loaded so un-migrated screens (journal/discover/detail) keep working.
  // The feed now reads `feed` (keyset page 1); `followingTastings` already has no
  // live consumer (the Following tab fetches via loadMoreFeed). D·2 slims this to
  // shell + per-user data and drops the global arrays.
  const [roasters, feed] = await Promise.all([
    getRoasters(currentUserId),
    getFeedPage(currentUserId, { tab: "Recent" }),
  ]);
  const [followedUserIds, followedRoasterIds, savedTastingIds, wishedBeanIds] = currentUserId
    ? await Promise.all([
        followedIds("user_follows", "follower_id", "followee_id", currentUserId),
        followedIds("roaster_follows", "user_id", "roaster_id", currentUserId),
        followedIds("tasting_saves", "user_id", "tasting_id", currentUserId),
        followedIds("bean_wishlist", "user_id", "bean_id", currentUserId),
      ])
    : [[], [], [], []];
  // Bounded per-user data for the now-scoped journal/profile + shell `me`.
  const [me, myTastings, myShelf, savedTastings, wishlistBeans] = currentUserId
    ? await Promise.all([
        getUserById(currentUserId, currentUserId),
        getMyTastings(currentUserId),
        getMyShelf(currentUserId),
        getSavedTastings(currentUserId),
        getWishlistBeans(currentUserId),
      ])
    : [null, [], [], [], []];
  // Write-gate flag for the CURRENT user only (computed here, not in getUserById —
  // which must stay projection-clean; the projection-guard test enforces that).
  const sessionState = currentUserId
    ? await getSessionState({ query: (t, p) => query(t, p) }, currentUserId)
    : null;
  const needsEmailVerification = !!sessionState && sessionState.hasPassword && !sessionState.emailVerified;
  return {
    roasters, feed,
    me, myTastings, myShelf, savedTastings, wishlistBeans,
    followedUserIds, followedRoasterIds, savedTastingIds, wishedBeanIds, currentUserId,
    needsEmailVerification,
  };
}

// ---- M5·A catalog SEO ----

/** Single roaster by id (mirrors getRoasters' projection). $1 = viewer (for
 *  followedByMe), $2 = roaster id. Used by generateMetadata / JSON-LD / OG. */
export async function getRoasterById(currentUserId: string | null, id: string): Promise<Roaster | null> {
  const { rows } = await query<Roaster>(
    `select r.id, r.name, r.city, r.founded, r.beans,
            coalesce(f.followers, 0)::int as followers, r.blurb,
            ($1::text is not null and exists (
              select 1 from roaster_follows rf where rf.roaster_id = r.id and rf.user_id = $1
            )) as "followedByMe"
     from roasters r
     left join (select roaster_id, count(*)::int as followers from roaster_follows group by roaster_id) f
       on f.roaster_id = r.id
     where r.id = $2`,
    [currentUserId, id],
  );
  return rows[0] ?? null;
}

/** Bounded public-id enumeration for sitemap.ts. No viewer, no PII columns. */
export async function getBeanIdsForSitemap(): Promise<{ id: string; createdAt: string }[]> {
  const { rows } = await query<{ id: string; createdAt: string }>(
    `select id, created_at as "createdAt" from beans order by created_at desc limit 50000`,
  );
  return rows;
}
export async function getRoasterIdsForSitemap(): Promise<{ id: string }[]> {
  const { rows } = await query<{ id: string }>(`select id from roasters order by id limit 50000`);
  return rows;
}

/** Request-memoized reads so generateMetadata + the page body share ONE query
 *  (raw pg has no fetch-dedup). Call THESE from both metadata and the page. */
export const getBeanCached = cache(getBean);
export const getRoasterByIdCached = cache(getRoasterById);
