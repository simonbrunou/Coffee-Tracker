/** Escape a user-supplied string for safe interpolation into a LIKE/ILIKE pattern.
 *  Postgres uses backslash as the default LIKE escape character, so `%`, `_`, and
 *  `\` themselves must be escaped to be matched literally — otherwise a user's `%`
 *  or `_` acts as a wildcard (no injection, just wildcard abuse → slow scans). The
 *  backslash must be escaped first so the others aren't double-escaped. */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
