import "server-only";
import { query } from "./db";
import { getCurrentUserId } from "./auth";
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

export const TASTING_COLS = `
  id, user_id as "userId", bean_id as "beanId", rating, brew, dose, ratio,
  temp, note, likes, time, created_at as "createdAt"`;

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
    `select
       t.id, t.user_id as "userId", t.bean_id as "beanId", t.rating, t.brew,
       t.dose, t.ratio, t.temp, t.note,
       coalesce(l.likes, 0)::int    as likes,
       coalesce(c.comments, 0)::int as "commentsCount",
       t.time, t.created_at as "createdAt",
       ($1::text is not null and exists (
         select 1 from likes lm where lm.tasting_id = t.id and lm.user_id = $1)) as "likedByMe",
       ($1::text is not null and exists (
         select 1 from tasting_saves ts where ts.tasting_id = t.id and ts.user_id = $1)) as "savedByMe"
     from tastings t
     left join (select tasting_id, count(*) as likes    from likes    group by tasting_id) l on l.tasting_id = t.id
     left join (select tasting_id, count(*) as comments from comments group by tasting_id) c on c.tasting_id = t.id
     order by t.created_at desc, t.id`,
    [currentUserId],
  );
  return rows;
}

/** Tastings authored by users the current viewer follows. Empty for anon. */
export async function getFollowingTastings(currentUserId: string | null): Promise<Tasting[]> {
  if (!currentUserId) return [];
  const { rows } = await query<Tasting>(
    `select
       t.id, t.user_id as "userId", t.bean_id as "beanId", t.rating, t.brew,
       t.dose, t.ratio, t.temp, t.note,
       coalesce(l.likes, 0)::int    as likes,
       coalesce(c.comments, 0)::int as "commentsCount",
       t.time, t.created_at as "createdAt",
       exists (select 1 from likes lm where lm.tasting_id = t.id and lm.user_id = $1) as "likedByMe",
       exists (select 1 from tasting_saves ts where ts.tasting_id = t.id and ts.user_id = $1) as "savedByMe"
     from tastings t
     join user_follows uf on uf.followee_id = t.user_id and uf.follower_id = $1
     left join (select tasting_id, count(*) as likes    from likes    group by tasting_id) l on l.tasting_id = t.id
     left join (select tasting_id, count(*) as comments from comments group by tasting_id) c on c.tasting_id = t.id
     order by t.created_at desc, t.id`,
    [currentUserId],
  );
  return rows;
}

/** A tasting's comment thread (lazy — fetched on expand, not in getAppData). */
export async function getComments(tastingId: string): Promise<Comment[]> {
  const { rows } = await query<Comment>(
    `select id, tasting_id as "tastingId", user_id as "userId", body,
            created_at as "createdAt", updated_at as "updatedAt"
     from comments where tasting_id = $1 order by created_at`,
    [tastingId],
  );
  return rows;
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
  const [roasters, users, beans, tastings, followingTastings] = await Promise.all([
    getRoasters(currentUserId),
    getUsers(currentUserId),
    getBeans(currentUserId),
    getTastings(currentUserId),
    getFollowingTastings(currentUserId),
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
    roasters, users, beans, tastings, followingTastings,
    followedUserIds, followedRoasterIds, savedTastingIds, wishedBeanIds, currentUserId,
  };
}
