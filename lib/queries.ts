import "server-only";
import { query } from "./db";
import { getCurrentUserId } from "./auth";
import type { AppData, Bean, Roaster, Tasting, User } from "./types";

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
  temp, note, likes, comments, time, created_at as "createdAt"`;

export async function getRoasters(): Promise<Roaster[]> {
  const { rows } = await query<Roaster>(
    `select id, name, city, founded, beans, followers, blurb from roasters order by id`,
  );
  return rows;
}

export async function getUsers(): Promise<User[]> {
  const { rows } = await query<User>(
    `select u.id, u.name, u.handle, u.avatar,
            coalesce(t.tastings, 0) as tastings,
            u.followers, u.following, u.bio
     from users u
     left join (select user_id, count(*) as tastings from tastings group by user_id) t
       on t.user_id = u.id
     order by u.id`,
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
       coalesce(r.ratings, 0)            as ratings,
       color, flavors, description as "desc", farm, varieties,
       sca_score::float8 as "scaScore", user_id as "ownerId",
       coalesce(owned and user_id = $1, false)        as "owned",
       case when user_id = $1 then bag_weight end     as "bagWeight",
       case when user_id = $1 then purchased  end     as "purchased",
       case when user_id = $1 then remaining::float8 end as "remaining"
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
       coalesce(l.likes, 0) as likes, t.comments, t.time,
       t.created_at as "createdAt",
       ($1 is not null and exists (
         select 1 from likes lm where lm.tasting_id = t.id and lm.user_id = $1
       )) as "likedByMe"
     from tastings t
     left join (select tasting_id, count(*) as likes from likes group by tasting_id) l
       on l.tasting_id = t.id
     order by t.created_at desc, t.id`,
    [currentUserId],
  );
  return rows;
}

/** Everything the client shell needs, fetched once on the server. */
export async function getAppData(): Promise<AppData> {
  const currentUserId = await getCurrentUserId();
  const [roasters, users, beans, tastings] = await Promise.all([
    getRoasters(),
    getUsers(),
    getBeans(currentUserId),
    getTastings(currentUserId),
  ]);
  return { roasters, users, beans, tastings, currentUserId };
}
