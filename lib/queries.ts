import "server-only";
import { query } from "./db";
import { getCurrentUserId } from "./auth";
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
  purchased, remaining::float8 as remaining, user_id as "ownerId"`;

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

export async function getUsers(currentUserId: string | null): Promise<User[]> {
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
     order by u.id`,
    [currentUserId],
  );
  return rows;
}

export async function getBeans(currentUserId: string | null): Promise<Bean[]> {
  const { rows } = await query<Bean>(
    `select
       id, name, roaster_id as "roasterId", roaster_name as "roasterName",
       origin, process, roast, altitude, varietal,
       price::float8 as price,
       coalesce(r.avg_rating, 0)::float8 as "avgRating",
       coalesce(r.ratings, 0)::int       as ratings,
       color, flavors, description as "desc", farm, varieties,
       sca_score::float8 as "scaScore", user_id as "ownerId",
       coalesce(owned and user_id = $1, false)        as "owned",
       case when user_id = $1 then bag_weight end     as "bagWeight",
       case when user_id = $1 then purchased  end     as "purchased",
       case when user_id = $1 then remaining::float8 end as "remaining"
       ,($1::text is not null and exists (
         select 1 from bean_wishlist w where w.bean_id = beans.id and w.user_id = $1)) as "wishlistedByMe"
     from beans
     left join (
       select bean_id, round(avg(rating), 1) as avg_rating, count(*) as ratings
       from tastings group by bean_id
     ) r on r.bean_id = beans.id
     order by beans.created_at desc, beans.id`,
    [currentUserId],
  );
  return rows;
}

export async function getTastings(currentUserId: string | null): Promise<Tasting[]> {
  const { rows } = await query<Tasting>(
    `select ${TASTING_SELECT_COLS} from tastings t ${TASTING_JOINS}
     order by t.created_at desc, t.id desc`,
    [currentUserId],
  );
  return rows;
}

/** Tastings authored by users the current viewer follows. Empty for anon. */
export async function getFollowingTastings(currentUserId: string | null): Promise<Tasting[]> {
  if (!currentUserId) return [];
  const { rows } = await query<Tasting>(
    `select ${TASTING_SELECT_COLS} from tastings t
       join user_follows uf on uf.followee_id = t.user_id and uf.follower_id = $1
       ${TASTING_JOINS}
     order by t.created_at desc, t.id desc`,
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
  const [roasters, users, beans, tastings, followingTastings, feed] = await Promise.all([
    getRoasters(currentUserId),
    getUsers(currentUserId),
    getBeans(currentUserId),
    getTastings(currentUserId),
    getFollowingTastings(currentUserId),
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
  return {
    roasters, users, beans, tastings, followingTastings, feed,
    followedUserIds, followedRoasterIds, savedTastingIds, wishedBeanIds, currentUserId,
  };
}
