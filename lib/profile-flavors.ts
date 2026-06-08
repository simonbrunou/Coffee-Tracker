/** Own-profile top flavors from in-memory tastings. Mirrors getTopFlavors' SQL
 *  ordering (count desc, then flavor name asc) so /profile and /u/[me] match. */
export function computeTopFlavors(tastings: { beanFlavors: string[] }[], limit = 6): { flavor: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const t of tastings) for (const f of t.beanFlavors) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts.entries()]
    .map(([flavor, n]) => ({ flavor, n }))
    .sort((a, b) => b.n - a.n || a.flavor.localeCompare(b.flavor))
    .slice(0, limit);
}
