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
  temp, note, likes, comments, time`;

export async function getRoasters(): Promise<Roaster[]> {
  const { rows } = await query<Roaster>(
    `select id, name, city, founded, beans, followers, blurb from roasters order by id`,
  );
  return rows;
}

export async function getUsers(): Promise<User[]> {
  const { rows } = await query<User>(
    `select id, name, handle, avatar, tastings, followers, following, bio from users order by id`,
  );
  return rows;
}

export async function getBeans(): Promise<Bean[]> {
  const { rows } = await query<Bean>(
    `select ${BEAN_COLS} from beans order by created_at desc, id`,
  );
  return rows;
}

export async function getTastings(): Promise<Tasting[]> {
  const { rows } = await query<Tasting>(
    `select ${TASTING_COLS} from tastings order by created_at desc, id`,
  );
  return rows;
}

export async function getLikedTastingIds(userId: string): Promise<string[]> {
  const { rows } = await query<{ tasting_id: string }>(
    `select tasting_id from likes where user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.tasting_id);
}

/** Everything the client shell needs, fetched once on the server. */
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
