import "server-only";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { getSessionVersion } from "@/lib/users-repo";
import { resolveUserOrThrow } from "@/lib/auth-guard";

export async function getCurrentUserId(): Promise<string | null> {
  return (await auth())?.user?.id ?? null;
}

/** Write-path gate: enforces auth + per-user revocation with one PK lookup.
 *  Read paths intentionally do NOT call this (browse is public). */
export async function requireUserId(): Promise<string> {
  const s = await auth();
  const id = s?.user?.id ?? null;
  if (!id) throw new Error("Unauthenticated");
  // Wrap query so its overloaded signatures align with the Queryable interface.
  const db = { query: (t: string, p?: unknown[]) => query(t, p) };
  const liveVersion = await getSessionVersion(db, id);
  return resolveUserOrThrow({ id, sv: s!.sessionVersion }, liveVersion);
}
