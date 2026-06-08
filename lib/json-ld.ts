import type { Bean, Roaster } from "@/lib/types";

/** schema.org Product (+ AggregateRating when rated, + Offer when priced) for a bean. */
export function beanJsonLd(bean: Bean, url: string): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: bean.name,
    url,
    category: "Coffee",
    ...(bean.roasterName ? { brand: { "@type": "Brand", name: bean.roasterName } } : {}),
    ...(bean.origin ? { countryOfOrigin: bean.origin } : {}),
  };
  if (bean.ratings > 0) {
    ld.aggregateRating = { "@type": "AggregateRating", ratingValue: bean.avgRating, ratingCount: bean.ratings, bestRating: 5 };
  }
  if (bean.price != null) {
    ld.offers = { "@type": "Offer", price: bean.price, priceCurrency: "USD" };
  }
  return ld;
}

/** schema.org Organization for a roaster. */
export function roasterJsonLd(r: Roaster, url: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: r.name,
    url,
    ...(r.city ? { address: { "@type": "PostalAddress", addressLocality: r.city } } : {}),
    ...(r.blurb ? { description: r.blurb } : {}),
  };
}

/** schema.org ProfilePage wrapping a Person (emitted ONLY for discoverable profiles). */
export function personJsonLd(profile: { name: string; handle: string }, url: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    mainEntity: { "@type": "Person", name: profile.name, alternateName: `@${profile.handle}`, url },
  };
}

/** schema.org BreadcrumbList. */
export function breadcrumbJsonLd(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

/** Escape a JSON-LD payload for safe inlining in <script type="application/ld+json">.
 *  JSON.stringify does NOT escape <, >, &, U+2028/U+2029 — without this a bean named
 *  "</script>…" (user content) could break out of the script element (XSS). */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
