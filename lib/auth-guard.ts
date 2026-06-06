/** True only when the session's frozen version matches the live DB version.
 *  A missing/non-number sv (e.g. a legacy JWT) is treated as NOT live. */
export function isLiveSession(sv: number | undefined, liveVersion: number | null): boolean {
  return liveVersion !== null && typeof sv === "number" && sv === liveVersion;
}

/** Pure gate: given the session's {id, sv} and the live session_version, return
 *  the id or throw. Read paths do not call this; write paths do (revocation). */
export function resolveUserOrThrow(
  session: { id: string; sv: number } | null,
  liveVersion: number | null,
): string {
  if (!session) throw new Error("Unauthenticated");
  if (!isLiveSession(session.sv, liveVersion)) throw new Error("Session revoked");
  return session.id;
}
