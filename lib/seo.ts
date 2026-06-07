import type { Metadata } from "next";
import type { Bean, Roaster } from "@/lib/types";

/** Pure metadata builders for the catalog detail pages (no JSX → unit-testable,
 *  and shared by generateMetadata). null → a minimal "not found" title. */
export function beanMetadata(bean: Bean | null, id: string): Metadata {
  // notFound() renders the not-found UI but, under the (app) group's streaming
  // shell, the HTTP status stays 200 — so noindex is the reliable SEO guard
  // against indexing a missing/deleted bean.
  if (!bean) return { title: "Bean not found — Cortado", robots: { index: false, follow: false } };
  const title = `${bean.name}${bean.roasterName ? ` — ${bean.roasterName}` : ""} | Cortado`;
  const description = [bean.origin, bean.process, bean.flavors?.slice(0, 3).join(", ")].filter(Boolean).join(" · ");
  const canonical = `/bean/${id}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { type: "article", title, description, url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}

export function roasterMetadata(r: Roaster | null, id: string): Metadata {
  if (!r) return { title: "Roaster not found — Cortado", robots: { index: false, follow: false } };
  const title = `${r.name} — Roaster | Cortado`;
  const description = [r.city, r.blurb].filter(Boolean).join(" · ") || `${r.name} on Cortado`;
  const canonical = `/roaster/${id}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { type: "profile", title, description, url: canonical },
    twitter: { card: "summary_large_image", title, description },
  };
}
