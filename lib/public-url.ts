/** The app's absolute public origin (no trailing slash), for canonical URLs, OG
 *  image URLs, robots, sitemap, and verification links. AUTH_URL is required in
 *  production (enforced by lib/env.ts); the localhost fallback is for dev/test. */
export function getPublicBaseUrl(): string {
  return (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}
