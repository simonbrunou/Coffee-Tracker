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
