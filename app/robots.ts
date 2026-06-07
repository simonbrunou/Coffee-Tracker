import type { MetadataRoute } from "next";
import { getPublicBaseUrl } from "@/lib/public-url";

// force-dynamic so the sitemap URL reflects the runtime AUTH_URL, not whatever
// (localhost) base was present at build time.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = getPublicBaseUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/settings", "/login", "/signup", "/profile", "/journal"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
