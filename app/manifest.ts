import type { MetadataRoute } from "next";
import { THEME_LIGHT } from "@/lib/theme-colors";

// A separate route segment from the (force-dynamic) pages: the page-level
// `dynamic` export does NOT cascade here. This object is pure static (no DB /
// no headers), so force-static prerenders /manifest.webmanifest at the no-DB
// build. Icons reference stable public/icons PNGs — Next hash-fingerprints
// next/og metadata-route URLs, so the manifest cannot reliably pin those.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cortado — Coffee Journal",
    short_name: "Cortado",
    description: "Log your bags and brews, taste with the SCA flavor wheel, and discover single-origins.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: THEME_LIGHT,
    theme_color: THEME_LIGHT,
    categories: ["food", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
