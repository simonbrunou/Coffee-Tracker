import { describe, it, expect } from "vitest";
import { beanJsonLd, roasterJsonLd, breadcrumbJsonLd, serializeJsonLd } from "@/lib/json-ld";
import type { Bean, Roaster } from "@/lib/types";

const bean = {
  id: "b1", name: "Yirgacheffe", roasterName: "Onyx", origin: "Ethiopia",
  process: "Natural", flavors: ["berry"], avgRating: 4.6, ratings: 12, price: null,
} as unknown as Bean;
const roaster = { id: "r1", name: "Onyx", city: "Rogers", blurb: "" } as unknown as Roaster;

describe("beanJsonLd", () => {
  it("Product + AggregateRating, omits offers when price is null", () => {
    const ld = beanJsonLd(bean, "https://h/bean/b1");
    expect(ld["@type"]).toBe("Product");
    expect(ld.aggregateRating).toMatchObject({ "@type": "AggregateRating", ratingValue: 4.6, ratingCount: 12 });
    expect(ld.offers).toBeUndefined();
  });
  it("includes offers when price is set", () => {
    const offers = beanJsonLd({ ...bean, price: 19 } as Bean, "https://h/bean/b1").offers as Record<string, unknown>;
    expect(offers).toMatchObject({ "@type": "Offer", price: 19 });
  });
  it("omits aggregateRating when no ratings", () => {
    expect(beanJsonLd({ ...bean, ratings: 0 } as Bean, "https://h/bean/b1").aggregateRating).toBeUndefined();
  });
});

it("roasterJsonLd → Organization", () => {
  expect(roasterJsonLd(roaster, "https://h/roaster/r1")["@type"]).toBe("Organization");
});

it("breadcrumbJsonLd → BreadcrumbList with positions", () => {
  const ld = breadcrumbJsonLd([{ name: "Discover", url: "https://h/discover" }, { name: "X", url: "https://h/bean/b1" }]);
  expect(ld["@type"]).toBe("BreadcrumbList");
  expect((ld.itemListElement as unknown[]).length).toBe(2);
});

describe("serializeJsonLd — safe for inline <script> (XSS guard, R3)", () => {
  it("escapes a </script> breakout and angle brackets in user content", () => {
    const out = serializeJsonLd(beanJsonLd({ ...bean, name: "x</script><img src=x onerror=alert(1)>" } as Bean, "https://h/bean/b1"));
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<img");
    expect(out).toContain("\\u003c"); // < was escaped
  });
});
