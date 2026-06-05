"use server";

import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { BEAN_COLS, TASTING_COLS } from "@/lib/queries";
import { requireUserId } from "@/lib/auth";
import type { AddBagInput, Bean, LogBrewInput, Tasting, UpdateBagInput, UpdateBrewInput } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { validateLogBrew, validateAddBag, validateUpdateBrew, validateUpdateBag } from "@/lib/brew-validation";

/** Log a brew against a bag — the fast, everyday action. Persists and returns
 *  the new tasting so the client can prepend it to the journal/feed. */
export async function logBrew(rawInput: LogBrewInput): Promise<Tasting> {
  const userId = await requireUserId();
  const v = validateLogBrew(rawInput);
  if (!v.ok) throw new Error(v.error);
  const input = v.value;
  const id = `t-${randomUUID()}`;
  const { rows } = await query<Tasting>(
    `insert into tastings
       (id, user_id, bean_id, rating, brew, dose, ratio, temp, note, likes, comments)
     select $1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0
     from beans where id = $3 and user_id = $2
     returning ${TASTING_COLS}`,
    [id, userId, input.beanId, input.rating, input.brew, input.dose, input.ratio, input.temp, input.note],
  );
  if (rows.length === 0) throw new Error("Couldn't log a brew for that bag.");
  revalidatePath("/", "layout");
  return { ...rows[0], likedByMe: false };
}

/** Add a bag — the rich catalog record, created once. Becomes a real catalog
 *  entry on the user's shelf. */
export async function addBag(rawInput: AddBagInput): Promise<Bean> {
  const userId = await requireUserId();
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
  const userId = await requireUserId();
  const v = validateUpdateBrew(rawInput);
  if (!v.ok) throw new Error(v.error);
  const input = v.value;
  const { rowCount } = await query(
    `update tastings set rating = $3, brew = $4, dose = $5, ratio = $6, temp = $7, note = $8
     where id = $1 and user_id = $2`,
    [input.id, userId, input.rating, input.brew, input.dose, input.ratio, input.temp, input.note],
  );
  if (!rowCount) throw new Error("Couldn't update that brew.");
  // Re-select the updated row (TASTING_COLS carries created_at, which the UPDATE
  // must not RETURN — it would set off the feed-reorder guard test). Keep the
  // ownership predicate here too so a row deleted mid-flight can't surface.
  const { rows } = await query<Tasting>(
    `select ${TASTING_COLS} from tastings where id = $1 and user_id = $2`,
    [input.id, userId],
  );
  if (rows.length === 0) throw new Error("Couldn't update that brew.");
  revalidatePath("/", "layout");
  return { ...rows[0], likedByMe: false };
}

export async function deleteBrew(id: string): Promise<void> {
  const userId = await requireUserId();
  const { rowCount } = await query(`delete from tastings where id = $1 and user_id = $2`, [id, userId]);
  if (!rowCount) throw new Error("Couldn't delete that brew.");
  revalidatePath("/", "layout");
}

/** Edit a bag's catalog fields. */
export async function updateBag(rawInput: UpdateBagInput): Promise<Bean> {
  const userId = await requireUserId();
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
  const userId = await requireUserId();
  const { rowCount } = await query(`delete from beans where id = $1 and user_id = $2`, [id, userId]);
  if (!rowCount) throw new Error("Couldn't delete that bag.");
  revalidatePath("/", "layout");
}

/** Persist a like/unlike of a tasting for the current user. */
export async function toggleLike(tastingId: string, liked: boolean): Promise<void> {
  const userId = await requireUserId();
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
