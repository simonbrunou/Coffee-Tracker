/** Compact relative-age label derived from an ISO timestamp.
 *  `nowMs` is injectable for testing; callers on the client pass Date.now(). */
export function relativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (d < 365) return `${w}w`;
  return new Date(then).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
