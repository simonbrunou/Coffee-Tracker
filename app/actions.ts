"use server";

import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { BEAN_COLS, TASTING_COLS } from "@/lib/queries";
import { requireUserId } from "@/lib/auth";
import type { AddBagInput, Bean, LogBrewInput, Tasting } from "@/lib/types";

/** Log a brew against a bag — the fast, everyday action. Persists and returns
 *  the new tasting so the client can prepend it to the journal/feed. */
export async function logBrew(input: LogBrewInput): Promise<Tasting> {
  const userId = await requireUserId();
  if (!input.beanId) throw new Error("logBrew: beanId is required");
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const id = `t-${randomUUID()}`;
  const { rows } = await query<Tasting>(
    `insert into tastings
       (id, user_id, bean_id, rating, brew, dose, ratio, temp, note, likes, comments, time)
     select $1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, 'now'
     from beans where id = $3 and user_id = $2
     returning ${TASTING_COLS}`,
    [id, userId, input.beanId, rating, input.brew, input.dose, input.ratio, input.temp, input.note],
  );
  if (rows.length === 0) throw new Error("Couldn't log a brew for that bag.");
  return rows[0];
}

/** Add a bag — the rich catalog record, created once. Becomes a real catalog
 *  entry on the user's shelf. */
export async function addBag(input: AddBagInput): Promise<Bean> {
  const userId = await requireUserId();
  const id = `b-${randomUUID()}`;
  const varieties = input.varieties.length ? input.varieties : ["—"];
  const varietal = varieties[0] ?? "—";
  const scaScore = Number.isFinite(input.scaScore) ? input.scaScore : 86;
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
    [
      id,
      input.name,
      input.roasterName,
      input.origin,
      input.process,
      input.roast,
      varietal,
      input.color,
      input.flavors,
      description,
      input.farm,
      varieties,
      scaScore,
      userId,
    ],
  );
  return rows[0];
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
}
