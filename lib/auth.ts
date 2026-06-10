import "server-only";
import { cache } from "react";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import { getSessionVersion, getSessionState } from "@/lib/users-repo";
import { isLiveSession, resolveUserOrThrow, isWriteAllowed } from "@/lib/auth-guard";

// Wrap query so its overloaded signatures align with the Queryable interface.
const db = { query: (t: string, p?: unknown[]) => query(t, p) };

/** Read-path identity WITH revocation. React.cache dedupes the session_version
 *  lookup to once per RSC RENDER PASS (e.g. the root layout's getAppData + a page
 *  rendered together); it does NOT dedupe across Server Actions, which each run
 *  their own single lookup (fine — one per action). Not memoized in vitest/node
 *  (no render scope), so dedup is covered by the live check, not unit tests.
 *  Anonymous short-circuits before any DB. */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const s = await auth();
  const id = s?.user?.id ?? null;
  if (!id) return null; // anonymous: no DB hit
  const live = await getSessionVersion(db, id);
  return isLiveSession(s!.sessionVersion, live) ? id : null;
});

/** Write-path gate: enforces auth + per-user revocation with one PK lookup.
 *  Throws (does not return null) so mutations fail closed. */
export async function requireUserId(): Promise<string> {
  const s = await auth();
  const id = s?.user?.id ?? null;
  if (!id) throw new Error("Unauthenticated");
  const liveVersion = await getSessionVersion(db, id);
  return resolveUserOrThrow({ id, sv: s!.sessionVersion }, liveVersion);
}

/** Write-path gate for CONTENT writes: auth + revocation + verified-email, in one
 *  DB read (live, never a stale JWT flag). Credential users must be verified;
 *  OAuth users (no password) always pass. */
export async function requireVerifiedUserId(): Promise<string> {
  const s = await auth();
  const id = s?.user?.id ?? null;
  if (!id) throw new Error("Unauthenticated");
  const state = await getSessionState(db, id);
  resolveUserOrThrow({ id, sv: s!.sessionVersion }, state?.sessionVersion ?? null); // revocation first
  if (!state || !isWriteAllowed(state.hasPassword, state.emailVerified)) throw new Error("Email not verified");
  return id;
}
