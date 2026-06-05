/** Pure gate: given the session's {id, sv} and the live session_version, return
 *  the id or throw. Read paths do not call this; write paths do (revocation). */
export function resolveUserOrThrow(
  session: { id: string; sv: number } | null,
  liveVersion: number | null,
): string {
  if (!session) throw new Error("Unauthenticated");
  if (liveVersion === null || liveVersion !== session.sv) throw new Error("Session revoked");
  return session.id;
}
