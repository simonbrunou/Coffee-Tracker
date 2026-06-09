"use server";

import { randomUUID } from "node:crypto";
import { query, withTransaction } from "@/lib/db";
import { BEAN_COLS, getComments, getTastingById, getCommentById, getFeedPage, isFeedTab, getDiscoverBeansPage, getBeanReviewsPage, getRoasterBeansPage, getUserTastingsPage } from "@/lib/queries";
import { requireVerifiedUserId, getCurrentUserId } from "@/lib/auth";
import type { AddBagInput, AddCommentInput, Bean, Comment, LogBrewInput, Page, Tasting, TastingAssessment, UpdateBagInput, UpdateBrewInput, UpdateCommentInput } from "@/lib/types";
import { validateComment, validateUpdateComment } from "@/lib/comment-validation";
import { revalidatePath } from "next/cache";
import { validateLogBrew, validateAddBag, validateUpdateBrew, validateUpdateBag, validateTastingAssessment } from "@/lib/brew-validation";

const TASTING_INSERT = `insert into tastings
     (id, user_id, bean_id, rating, brew, dose, ratio, temp, note, likes)
   select $1, $2, $3, $4, $5, $6, $7, $8, $9, 0
   from beans where id = $3 and user_id = $2
   returning id`;

const ASSESSMENT_UPSERT = `insert into tasting_assessments
     (tasting_id, body_intensity, acidity_intensity, sweetness_intensity,
      fruit_intensity, floral_intensity, finish_intensity)
   values ($1, $2, $3, $4, $5, $6, $7)
   on conflict (tasting_id) do update set
     body_intensity = excluded.body_intensity,
     acidity_intensity = excluded.acidity_intensity,
     sweetness_intensity = excluded.sweetness_intensity,
     fruit_intensity = excluded.fruit_intensity,
     floral_intensity = excluded.floral_intensity,
     finish_intensity = excluded.finish_intensity,
     updated_at = now()`;

const assessParams = (tastingId: string, a: TastingAssessment) =>
  [tastingId, a.body, a.acidity, a.sweetness, a.fruit, a.floral, a.finish];

/** Log a brew against a bag — the fast, everyday action. Persists and returns
 *  the new tasting so the client can prepend it to the journal/feed. */
export async function logBrew(rawInput: LogBrewInput): Promise<Tasting> {
  const userId = await requireVerifiedUserId();
  const v = validateLogBrew(rawInput);
  if (!v.ok) throw new Error(v.error);
  const input = v.value;
  const id = `t-${randomUUID()}`;
  const assessment = validateTastingAssessment(input.assessment);
  const tastingParams = [id, userId, input.beanId, input.rating, input.brew, input.dose, input.ratio, input.temp, input.note];

  if (assessment) {
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(TASTING_INSERT, tastingParams);
      if (rows.length === 0) throw new Error("Couldn't log a brew for that bag.");
      await client.query(ASSESSMENT_UPSERT, assessParams(id, assessment));
    });
  } else {
    const { rows } = await query<{ id: string }>(TASTING_INSERT, tastingParams);
    if (rows.length === 0) throw new Error("Couldn't log a brew for that bag.");
  }
  revalidatePath("/", "layout");
  const tasting = await getTastingById(userId, id);
  if (!tasting) throw new Error("Couldn't log a brew for that bag.");
  return tasting;
}

/** Add a bag — the rich catalog record, created once. Becomes a real catalog
 *  entry on the user's shelf. */
export async function addBag(rawInput: AddBagInput): Promise<Bean> {
  const userId = await requireVerifiedUserId();
  const v = validateAddBag(rawInput);
  if (!v.ok) throw new Error(v.error);
  const input = v.value;
  const id = `b-${randomUUID()}`;
  const varieties = input.varieties.length ? input.varieties : ["—"];
  const varietal = varieties[0] ?? "—";
  const description = input.flavors.length
    ? `Roaster notes: ${input.flavors.join(", ")}.`
    : "A freshly added bag on your shelf.";
  const { rows } = await query<Bean>(
    `insert into beans
       (id, name, roaster_id, roaster_name, origin, process, roast, altitude,
        varietal, price, avg_rating, ratings, color, flavors, description,
        farm, varieties, sca_score, owned, bag_weight, purchased, remaining, user_id)
     values ($1, $2, null, $3, $4, $5, $6, '—',
        $7, null, 0, 0, $8, $9, $10,
        $11, $12, $13, true, '250g', null, 1, $14)
     returning ${BEAN_COLS}`,
    [id, input.name, input.roasterName, input.origin, input.process, input.roast,
     varietal, input.color, input.flavors, description, input.farm, varieties,
     input.scaScore, userId],
  );
  revalidatePath("/", "layout");
  return rows[0];
}

/** Edit a brew's mutable fields. Never touches time/created_at (feed order). */
export async function updateBrew(rawInput: UpdateBrewInput): Promise<Tasting> {
  const userId = await requireVerifiedUserId();
  const v = validateUpdateBrew(rawInput);
  if (!v.ok) throw new Error(v.error);
  const input = v.value;
  const assessment = validateTastingAssessment(input.assessment);
  const updateParams = [input.id, userId, input.rating, input.brew, input.dose, input.ratio, input.temp, input.note];
  const UPDATE_TASTING = `update tastings set rating = $3, brew = $4, dose = $5, ratio = $6, temp = $7, note = $8
     where id = $1 and user_id = $2`;

  if (assessment) {
    await withTransaction(async (client) => {
      const { rowCount } = await client.query(UPDATE_TASTING, updateParams);
      if (!rowCount) throw new Error("Couldn't update that brew.");
      await client.query(ASSESSMENT_UPSERT, assessParams(input.id, assessment));
    });
  } else {
    const { rowCount } = await query(UPDATE_TASTING, updateParams);
    if (!rowCount) throw new Error("Couldn't update that brew.");
  }
  revalidatePath("/", "layout");
  const tasting = await getTastingById(userId, input.id);
  if (!tasting) throw new Error("Couldn't update that brew.");
  return tasting;
}

export async function deleteBrew(id: string): Promise<void> {
  const userId = await requireVerifiedUserId();
  const { rowCount } = await query(`delete from tastings where id = $1 and user_id = $2`, [id, userId]);
  if (!rowCount) throw new Error("Couldn't delete that brew.");
  revalidatePath("/", "layout");
}

/** Edit a bag's catalog fields. */
export async function updateBag(rawInput: UpdateBagInput): Promise<Bean> {
  const userId = await requireVerifiedUserId();
  const v = validateUpdateBag(rawInput);
  if (!v.ok) throw new Error(v.error);
  const input = v.value;
  const varieties = input.varieties.length ? input.varieties : ["—"];
  const { rows } = await query<Bean>(
    `update beans set name = $3, roaster_name = $4, origin = $5, process = $6,
        roast = $7, color = $8, flavors = $9, farm = $10, varieties = $11, sca_score = $12
     where id = $1 and user_id = $2
     returning ${BEAN_COLS}`,
    [input.id, userId, input.name, input.roasterName, input.origin, input.process,
     input.roast, input.color, input.flavors, input.farm, varieties, input.scaScore],
  );
  if (rows.length === 0) throw new Error("Couldn't update that bag.");
  revalidatePath("/", "layout");
  return rows[0];
}

/** Delete a bag. FK `on delete cascade` removes its tastings + their likes. */
export async function deleteBag(id: string): Promise<void> {
  const userId = await requireVerifiedUserId();
  const { rowCount } = await query(`delete from beans where id = $1 and user_id = $2`, [id, userId]);
  if (!rowCount) throw new Error("Couldn't delete that bag.");
  revalidatePath("/", "layout");
}

/** Persist a like/unlike of a tasting for the current user. */
export async function toggleLike(tastingId: string, liked: boolean): Promise<void> {
  const userId = await requireVerifiedUserId();
  if (liked) {
    await query(
      `insert into likes (user_id, tasting_id) values ($1, $2) on conflict do nothing`,
      [userId, tastingId],
    );
  } else {
    await query(`delete from likes where user_id = $1 and tasting_id = $2`, [userId, tastingId]);
  }
  revalidatePath("/", "layout");
}

// ---- Follows / saves / wishlist (idempotent toggles, mirroring toggleLike) ----
export async function toggleFollowUser(targetUserId: string, follow: boolean): Promise<void> {
  const userId = await requireVerifiedUserId();
  if (userId === targetUserId) throw new Error("You can't follow yourself.");
  if (follow) await query(`insert into user_follows (follower_id, followee_id) values ($1, $2) on conflict do nothing`, [userId, targetUserId]);
  else await query(`delete from user_follows where follower_id = $1 and followee_id = $2`, [userId, targetUserId]);
  revalidatePath("/", "layout");
}
export async function toggleFollowRoaster(roasterId: string, follow: boolean): Promise<void> {
  const userId = await requireVerifiedUserId();
  if (follow) await query(`insert into roaster_follows (user_id, roaster_id) values ($1, $2) on conflict do nothing`, [userId, roasterId]);
  else await query(`delete from roaster_follows where user_id = $1 and roaster_id = $2`, [userId, roasterId]);
  revalidatePath("/", "layout");
}
export async function toggleSaveTasting(tastingId: string, save: boolean): Promise<void> {
  const userId = await requireVerifiedUserId();
  if (save) await query(`insert into tasting_saves (user_id, tasting_id) values ($1, $2) on conflict do nothing`, [userId, tastingId]);
  else await query(`delete from tasting_saves where user_id = $1 and tasting_id = $2`, [userId, tastingId]);
  revalidatePath("/", "layout");
}
export async function toggleWishlistBean(beanId: string, wish: boolean): Promise<void> {
  const userId = await requireVerifiedUserId();
  if (wish) await query(`insert into bean_wishlist (user_id, bean_id) values ($1, $2) on conflict do nothing`, [userId, beanId]);
  else await query(`delete from bean_wishlist where user_id = $1 and bean_id = $2`, [userId, beanId]);
  revalidatePath("/", "layout");
}

// ---- Feed pagination (M3·D) ----
/** Fetch the next keyset page of the feed for a tab. Validates the tab; the
 *  cursor is validated (and rejected if malformed) inside getFeedPage. */
export async function loadMoreFeed(tab: string, cursor: string | null): Promise<Page<Tasting>> {
  if (!isFeedTab(tab)) throw new Error("Invalid feed tab");
  const uid = await getCurrentUserId();
  return getFeedPage(uid, { tab, cursor });
}

export async function loadMoreBeans(
  cursor: string | null,
  process?: string | null,
  q?: string | null,
): Promise<Page<Bean>> {
  const uid = await getCurrentUserId();
  return getDiscoverBeansPage(uid, { cursor, process, q });
}

export async function loadMoreBeanReviews(beanId: string, cursor: string | null): Promise<Page<Tasting>> {
  const uid = await getCurrentUserId();
  return getBeanReviewsPage(uid, beanId, { cursor });
}

export async function loadMoreUserTastings(userId: string, cursor: string | null): Promise<Page<Tasting>> {
  const uid = await getCurrentUserId();
  return getUserTastingsPage(uid, userId, { cursor });
}

export async function loadMoreRoasterBeans(roasterId: string, cursor: string | null): Promise<Page<Bean>> {
  const uid = await getCurrentUserId();
  return getRoasterBeansPage(uid, roasterId, { cursor });
}

// ---- Comments ----
export async function fetchComments(tastingId: string): Promise<Comment[]> {
  return getComments(tastingId);
}
export async function addComment(rawInput: AddCommentInput): Promise<Comment> {
  const userId = await requireVerifiedUserId();
  const v = validateComment(rawInput);
  if (!v.ok) throw new Error(v.error);
  const id = `c-${randomUUID()}`;
  await query(
    `insert into comments (id, tasting_id, user_id, body) values ($1, $2, $3, $4)`,
    [id, v.value.tastingId, userId, v.value.body],
  );
  revalidatePath("/", "layout");
  const comment = await getCommentById(id);
  if (!comment) throw new Error("Couldn't add that comment.");
  return comment;
}
export async function updateComment(rawInput: UpdateCommentInput): Promise<Comment> {
  const userId = await requireVerifiedUserId();
  const v = validateUpdateComment(rawInput);
  if (!v.ok) throw new Error(v.error);
  const { rowCount } = await query(
    `update comments set body = $3, updated_at = now() where id = $1 and user_id = $2`,
    [v.value.id, userId, v.value.body],
  );
  if (!rowCount) throw new Error("Couldn't update that comment.");
  revalidatePath("/", "layout");
  const comment = await getCommentById(v.value.id);
  if (!comment) throw new Error("Couldn't update that comment.");
  return comment;
}
export async function deleteComment(id: string): Promise<void> {
  const userId = await requireVerifiedUserId();
  const { rowCount } = await query(`delete from comments where id = $1 and user_id = $2`, [id, userId]);
  if (!rowCount) throw new Error("Couldn't delete that comment.");
  revalidatePath("/", "layout");
}
