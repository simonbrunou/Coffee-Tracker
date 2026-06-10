import type { MetadataRoute } from "next";
import { getPublicBaseUrl } from "@/lib/public-url";
import { getBeanIdsForSitemap, getRoasterIdsForSitemap, getUserHandlesForSitemap } from "@/lib/queries";

// force-dynamic: this reads the DB, and `next build` runs with NO database — a
// build-time sitemap() call would fail. Generated per-request instead.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicBaseUrl();
  const [beans, roasters, users] = await Promise.all([
    getBeanIdsForSitemap(),
    getRoasterIdsForSitemap(),
    getUserHandlesForSitemap(),
  ]);
  const staticRoutes: MetadataRoute.Sitemap = ["", "/discover", "/privacy", "/terms", "/cookies"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "weekly",
  }));
  const beanRoutes: MetadataRoute.Sitemap = beans.map((b) => ({
    url: `${base}/bean/${b.id}`,
    lastModified: new Date(b.createdAt),
  }));
  const roasterRoutes: MetadataRoute.Sitemap = roasters.map((r) => ({ url: `${base}/roaster/${r.id}` }));
  // Only discoverable users (getUserHandlesForSitemap filters on discoverable=true).
  const userRoutes: MetadataRoute.Sitemap = users.map((u) => ({ url: `${base}/u/${u.handle}` }));
  return [...staticRoutes, ...beanRoutes, ...roasterRoutes, ...userRoutes];
}
