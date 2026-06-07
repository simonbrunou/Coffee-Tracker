# M5·A — Catalog SEO & Social Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make bean & roaster pages indexable and shareable — metadata, canonicals, robots, sitemap, JSON-LD, OG images — over non-personal catalog data only.

**Architecture:** A shared `getPublicBaseUrl()` origin helper (prod `AUTH_URL` fail-fast); `React.cache`-wrapped reads so `generateMetadata` + page share one query; `app/robots.ts` + `app/sitemap.ts` (MetadataRoute handlers, bounded queries); `generateMetadata` + nonce'd JSON-LD on bean/roaster; `next/og` OG images. Spec: `docs/superpowers/specs/2026-06-07-m5a-catalog-seo-design.md`.

**Tech Stack:** Next.js 15.5 App Router, React 19, raw `pg`, Vitest. All routes force-dynamic (nonce CSP).

**OG font decision (per the user's "keep it lean"):** v1 uses `next/og`'s built-in default font (no bundled TTF, no Dockerfile `public/` copy). The brand-TTF + Dockerfile copy from the spec are deferred to an enhancement.

**Cuts (green at each commit):** (1) foundation → (2) metadata + JSON-LD → (3) OG images → (4) live verify.

---

## Cut 1 — SEO foundation

### Task 1: `getPublicBaseUrl()` helper + prod `AUTH_URL` fail-fast

**Files:**
- Create: `lib/public-url.ts`
- Modify: `lib/verify-email.ts:22`, `lib/env.ts`, `.env.example`
- Test: `test/public-url.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPublicBaseUrl } from "@/lib/public-url";
import { validateEnv } from "@/lib/env";

describe("getPublicBaseUrl", () => {
  const orig = process.env.AUTH_URL;
  afterEach(() => { process.env.AUTH_URL = orig; });
  it("uses AUTH_URL, stripping a trailing slash", () => {
    process.env.AUTH_URL = "https://cortado.example.com/";
    expect(getPublicBaseUrl()).toBe("https://cortado.example.com");
  });
  it("falls back to localhost when AUTH_URL is unset", () => {
    delete process.env.AUTH_URL;
    expect(getPublicBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("validateEnv requires AUTH_URL in production", () => {
  it("throws when AUTH_URL is missing in production", () => {
    expect(() => validateEnv({ NODE_ENV: "production", AUTH_SECRET: "x", DATABASE_URL: "y" } as NodeJS.ProcessEnv))
      .toThrow(/AUTH_URL/);
  });
  it("passes in production when all present", () => {
    expect(() => validateEnv({ NODE_ENV: "production", AUTH_SECRET: "x", DATABASE_URL: "y", AUTH_URL: "https://h", RESEND_API_KEY: "r", EMAIL_FROM: "e" } as NodeJS.ProcessEnv))
      .not.toThrow();
  });
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run test/public-url.test.ts` (module/export missing).

- [ ] **Step 3: Create `lib/public-url.ts`**

```ts
/** The app's absolute public origin (no trailing slash), for canonical URLs, OG
 *  image URLs, robots, sitemap, and verification links. AUTH_URL is required in
 *  production (enforced by lib/env.ts); the localhost fallback is for dev/test. */
export function getPublicBaseUrl(): string {
  return (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}
```

- [ ] **Step 4: Refactor `lib/verify-email.ts`** — replace the inline fallback at line 22:

```ts
import { getPublicBaseUrl } from "@/lib/public-url";
// ...
    const base = getPublicBaseUrl();
```
(Remove the old `const base = (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");` line and its preceding comment.)

- [ ] **Step 5: Add `AUTH_URL` to the prod check in `lib/env.ts`** — after the `DATABASE_URL` line:

```ts
  if (!env.AUTH_URL) missing.push("AUTH_URL");
```

- [ ] **Step 6: Document in `.env.example`** — uncomment/annotate `AUTH_URL` noting it is **required in production** (canonical URLs, OG images, verification links).

- [ ] **Step 7: Run → pass** — `npx vitest run test/public-url.test.ts && npx tsc --noEmit; echo "exit $?"`

### Task 2: `getRoasterById`, cached read wrappers, bounded sitemap queries

**Files:**
- Modify: `lib/queries.ts`
- Test: `test/queries-seo.test.ts` (create)

- [ ] **Step 1: Write the failing test** (mocks `@/lib/db`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
import { getRoasterById, getBeanIdsForSitemap, getRoasterIdsForSitemap } from "@/lib/queries";

beforeEach(() => queryMock.mockReset());

describe("getRoasterById", () => {
  it("selects by id ($2) and returns the row or null", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "r1", name: "Onyx" }] });
    const r = await getRoasterById("u1", "r1");
    expect(r).toMatchObject({ id: "r1" });
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/where r\.id = \$2/i);
    expect(params).toEqual(["u1", "r1"]);
  });
  it("returns null when no row", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getRoasterById(null, "nope")).toBeNull();
  });
});

describe("sitemap enumeration queries are bounded", () => {
  it("bean ids query has a LIMIT and selects no PII", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await getBeanIdsForSitemap();
    const [sql] = queryMock.mock.calls[0] as [string];
    expect(sql).toMatch(/limit \d+/i);
    expect(sql).not.toMatch(/email|password|user_id/i);
  });
  it("roaster ids query has a LIMIT", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await getRoasterIdsForSitemap();
    expect((queryMock.mock.calls[0] as [string])[0]).toMatch(/limit \d+/i);
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Add `getRoasterById` to `lib/queries.ts`** (mirror `getRoasters`, `WHERE r.id = $2`):

```ts
export async function getRoasterById(currentUserId: string | null, id: string): Promise<Roaster | null> {
  const { rows } = await query<Roaster>(
    `select r.id, r.name, r.city, r.founded, r.beans,
            coalesce(f.followers, 0)::int as followers, r.blurb,
            ($1::text is not null and exists (
              select 1 from roaster_follows rf where rf.roaster_id = r.id and rf.user_id = $1
            )) as "followedByMe"
     from roasters r
     left join (select roaster_id, count(*)::int as followers from roaster_follows group by roaster_id) f
       on f.roaster_id = r.id
     where r.id = $2`,
    [currentUserId, id],
  );
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Add bounded sitemap queries** (public ids only — no `currentUserId`, no PII):

```ts
export async function getBeanIdsForSitemap(): Promise<{ id: string; createdAt: string }[]> {
  const { rows } = await query<{ id: string; createdAt: string }>(
    `select id, created_at as "createdAt" from beans order by created_at desc limit 50000`,
  );
  return rows;
}
export async function getRoasterIdsForSitemap(): Promise<{ id: string }[]> {
  const { rows } = await query<{ id: string }>(`select id from roasters order by id limit 50000`);
  return rows;
}
```

- [ ] **Step 5: Add `React.cache` wrappers** at the top of `lib/queries.ts` add `import { cache } from "react";`, then after the `getBean` and `getRoasterById` definitions:

```ts
/** Request-memoized reads so generateMetadata + the page body share ONE query
 *  (raw pg has no fetch-dedup). Call THESE from both metadata and the page. */
export const getBeanCached = cache(getBean);
export const getRoasterByIdCached = cache(getRoasterById);
```

- [ ] **Step 6: Run → pass; tsc.**

### Task 3: Root `metadataBase`

**Files:** Modify `app/layout.tsx`
**Test:** add to `test/route-structure.test.ts` (or a new `test/seo-metadata.test.ts`).

- [ ] **Step 1: Failing test** — assert root layout sets `metadataBase`:

```ts
it("root layout sets metadataBase from the public base url", () => {
  const src = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
  expect(src).toMatch(/metadataBase/);
  expect(src).toMatch(/getPublicBaseUrl/);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Edit `app/layout.tsx`** — import the helper and add `metadataBase` to the exported `metadata`:

```ts
import { getPublicBaseUrl } from "@/lib/public-url";
// ...
export const metadata: Metadata = {
  metadataBase: new URL(getPublicBaseUrl()),
  title: "Cortado — Coffee Journal",
  description:
    "A warm, cozy coffee journal. Log your bags and brews, taste with the SCA flavor wheel, and discover single-origins and the roasters behind them.",
  openGraph: {
    type: "website",
    siteName: "Cortado",
    title: "Cortado — Coffee Journal",
    description: "Log your bags and brews, taste with the SCA flavor wheel, and discover single-origins.",
  },
  twitter: { card: "summary_large_image", title: "Cortado — Coffee Journal" },
};
```

- [ ] **Step 4: Run → pass; tsc.**

### Task 4: `app/robots.ts`

**Files:** Create `app/robots.ts`; Test `test/robots.test.ts`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import robots from "@/app/robots";
beforeEach(() => { process.env.AUTH_URL = "https://cortado.example.com"; });
it("indexes catalog, disallows api + personal routes, links sitemap", () => {
  const r = robots();
  const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  expect(rule.allow).toBe("/");
  for (const d of ["/api/", "/settings", "/login", "/signup", "/profile", "/journal"]) {
    expect(rule.disallow).toContain(d);
  }
  expect(r.sitemap).toBe("https://cortado.example.com/sitemap.xml");
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Create `app/robots.ts`**

```ts
import type { MetadataRoute } from "next";
import { getPublicBaseUrl } from "@/lib/public-url";

export default function robots(): MetadataRoute.Robots {
  const base = getPublicBaseUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/settings", "/login", "/signup", "/profile", "/journal"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
```

- [ ] **Step 4: Run → pass.**

### Task 5: `app/sitemap.ts`

**Files:** Create `app/sitemap.ts`; Test `test/sitemap.test.ts`.

- [ ] **Step 1: Failing test** (mock the two queries):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const beanIds = vi.fn(); const roasterIds = vi.fn();
vi.mock("@/lib/queries", () => ({
  getBeanIdsForSitemap: (...a: unknown[]) => beanIds(...a),
  getRoasterIdsForSitemap: (...a: unknown[]) => roasterIds(...a),
}));
import sitemap from "@/app/sitemap";
beforeEach(() => {
  process.env.AUTH_URL = "https://cortado.example.com";
  beanIds.mockResolvedValue([{ id: "b1", createdAt: "2026-01-01T00:00:00Z" }]);
  roasterIds.mockResolvedValue([{ id: "r1" }]);
});
it("lists static + bean + roaster URLs, excludes personal routes", async () => {
  const urls = (await sitemap()).map((e) => e.url);
  expect(urls).toContain("https://cortado.example.com/bean/b1");
  expect(urls).toContain("https://cortado.example.com/roaster/r1");
  expect(urls).toContain("https://cortado.example.com/discover");
  expect(urls.some((u) => /\/profile|\/u\/|\/settings|\/login|\/signup|\/journal/.test(u))).toBe(false);
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Create `app/sitemap.ts`**

```ts
import type { MetadataRoute } from "next";
import { getPublicBaseUrl } from "@/lib/public-url";
import { getBeanIdsForSitemap, getRoasterIdsForSitemap } from "@/lib/queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getPublicBaseUrl();
  const [beans, roasters] = await Promise.all([getBeanIdsForSitemap(), getRoasterIdsForSitemap()]);
  const staticRoutes: MetadataRoute.Sitemap = ["", "/discover", "/privacy", "/terms", "/cookies"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "weekly",
  }));
  const beanRoutes: MetadataRoute.Sitemap = beans.map((b) => ({
    url: `${base}/bean/${b.id}`,
    lastModified: new Date(b.createdAt),
  }));
  const roasterRoutes: MetadataRoute.Sitemap = roasters.map((r) => ({ url: `${base}/roaster/${r.id}` }));
  return [...staticRoutes, ...beanRoutes, ...roasterRoutes];
}
```

- [ ] **Step 4: Run → pass; tsc; build; commit Cut 1**

```bash
npx tsc --noEmit && npm run build > /dev/null && echo "build ok"
git add -A && git commit -m "feat(m5a): SEO foundation — public-url helper, robots, sitemap, cached reads"
```

---

## Cut 2 — Per-page metadata + JSON-LD

### Task 6: Bean `generateMetadata` + JSON-LD

**Files:** Modify `app/(app)/bean/[id]/page.tsx`; Create `lib/json-ld.ts`; Test `test/json-ld.test.ts`.

- [ ] **Step 1: Failing test for the JSON-LD builder**

```ts
import { describe, it, expect } from "vitest";
import { beanJsonLd, roasterJsonLd } from "@/lib/json-ld";

const bean = { id: "b1", name: "Yirgacheffe", roasterName: "Onyx", origin: "Ethiopia", process: "Natural", flavors: ["berry"], avgRating: 4.6, ratings: 12, price: null } as any;

it("bean → Product + AggregateRating, omits offers when price is null", () => {
  const ld = beanJsonLd(bean, "https://h/bean/b1");
  expect(ld["@type"]).toBe("Product");
  expect(ld.aggregateRating).toMatchObject({ "@type": "AggregateRating", ratingValue: 4.6, ratingCount: 12 });
  expect(ld.offers).toBeUndefined();
  expect(JSON.stringify(ld)).not.toContain("null");
});
it("bean includes offers when price is set", () => {
  expect(beanJsonLd({ ...bean, price: 19 }, "https://h/bean/b1").offers).toMatchObject({ "@type": "Offer", price: 19 });
});
it("roaster → Organization", () => {
  expect(roasterJsonLd({ id: "r1", name: "Onyx", city: "Rogers", blurb: "" } as any, "https://h/roaster/r1")["@type"]).toBe("Organization");
});
it("aggregateRating omitted when no ratings", () => {
  expect(beanJsonLd({ ...bean, ratings: 0 }, "https://h/bean/b1").aggregateRating).toBeUndefined();
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Create `lib/json-ld.ts`**

```ts
import type { Bean, Roaster } from "@/lib/types";

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

export function breadcrumbJsonLd(items: { name: string; url: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}
```

*(If `Bean` lacks `roasterName`, verify the field name in `lib/types.ts` and adjust.)*

- [ ] **Step 4: Add `generateMetadata` + JSON-LD to `app/(app)/bean/[id]/page.tsx`** — switch the body to the cached query and add metadata + a nonce'd JSON-LD `<script>`:

```tsx
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/auth";
import { getBeanCached, getBeanReviewsPage } from "@/lib/queries";
import { getPublicBaseUrl } from "@/lib/public-url";
import { beanJsonLd, breadcrumbJsonLd } from "@/lib/json-ld";
import { BeanClient } from "./bean-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const bean = await getBeanCached(await getCurrentUserId(), id);
  if (!bean) return { title: "Bean not found — Cortado" };
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

export default async function BeanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await getCurrentUserId();
  const [bean, initialReviews] = await Promise.all([getBeanCached(uid, id), getBeanReviewsPage(uid, id, {})]);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const base = getPublicBaseUrl();
  return (
    <>
      {bean && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              beanJsonLd(bean, `${base}/bean/${id}`),
              breadcrumbJsonLd([
                { name: "Discover", url: `${base}/discover` },
                { name: bean.name, url: `${base}/bean/${id}` },
              ]),
            ]),
          }}
        />
      )}
      <BeanClient beanId={id} bean={bean} initialReviews={initialReviews} />
    </>
  );
}
```

- [ ] **Step 5: Run JSON-LD test → pass; tsc.**

### Task 7: Roaster `generateMetadata` + JSON-LD + server identity

**Files:** Modify `app/(app)/roaster/[id]/page.tsx`, `app/(app)/roaster/[id]/roaster-client.tsx`.

- [ ] **Step 1: Edit the roaster page** — fetch identity via `getRoasterByIdCached`, add metadata + JSON-LD, pass the roaster to the client:

```tsx
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/auth";
import { getRoasterByIdCached, getRoasterBeansPage } from "@/lib/queries";
import { getPublicBaseUrl } from "@/lib/public-url";
import { roasterJsonLd, breadcrumbJsonLd } from "@/lib/json-ld";
import { RoasterClient } from "./roaster-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const r = await getRoasterByIdCached(await getCurrentUserId(), id);
  if (!r) return { title: "Roaster not found — Cortado" };
  const title = `${r.name} — Roaster | Cortado`;
  const description = [r.city, r.blurb].filter(Boolean).join(" · ") || `${r.name} on Cortado`;
  return {
    title, description,
    alternates: { canonical: `/roaster/${id}` },
    openGraph: { type: "profile", title, description, url: `/roaster/${id}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RoasterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await getCurrentUserId();
  const [roaster, initialBeans] = await Promise.all([getRoasterByIdCached(uid, id), getRoasterBeansPage(uid, id, {})]);
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const base = getPublicBaseUrl();
  return (
    <>
      {roaster && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              roasterJsonLd(roaster, `${base}/roaster/${id}`),
              breadcrumbJsonLd([{ name: roaster.name, url: `${base}/roaster/${id}` }]),
            ]),
          }}
        />
      )}
      <RoasterClient roasterId={id} roaster={roaster} initialBeans={initialBeans} />
    </>
  );
}
```

- [ ] **Step 2: Update `RoasterClient`** to accept the optional `roaster` prop and prefer it over the client provider lookup `D.roaster(roasterId)` (fallback to the provider when the prop is absent, e.g. client-side nav). Read the current file first; thread `roaster ?? D.roaster(roasterId)`.

- [ ] **Step 3: tsc; build (proves both detail pages compile + render metadata).**

### Task 8: `noindex` auth pages + discover title

**Files:** Modify `app/(app)/login/page.tsx`, `app/(app)/signup/page.tsx`, `app/(app)/discover/page.tsx`.
**Test:** `test/seo-metadata.test.ts` — assert the three pages export `metadata` with the right robots/title.

- [ ] **Step 1: Failing test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
it("login & signup are noindex", () => {
  for (const p of ["app/(app)/login/page.tsx", "app/(app)/signup/page.tsx"]) {
    expect(read(p)).toMatch(/robots:\s*{\s*index:\s*false/);
  }
});
it("discover has its own title", () => {
  expect(read("app/(app)/discover/page.tsx")).toMatch(/export const metadata/);
});
```

- [ ] **Step 2: Add to each page** (these are server components — add a `metadata` export):

```ts
// login & signup:
export const metadata = { title: "Sign in — Cortado", robots: { index: false, follow: false } };
// discover:
export const metadata = { title: "Discover Coffee — Cortado", description: "Browse single-origin beans and the roasters behind them.", alternates: { canonical: "/discover" } };
```
(For signup use `title: "Create your account — Cortado"`.)

- [ ] **Step 3: Run → pass; tsc; build; commit Cut 2**

```bash
git add -A && git commit -m "feat(m5a): per-page metadata, canonicals, nonce'd JSON-LD, noindex auth pages"
```

---

## Cut 3 — OG images (next/og, default font)

### Task 9: Static default OG image

**Files:** Create `app/opengraph-image.tsx` (+ `app/twitter-image.tsx` re-export).
**Test:** `test/og-routes.test.ts` (structural).

- [ ] **Step 1: Failing test**

```ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const p = (s: string) => join(process.cwd(), s);
const read = (s: string) => readFileSync(p(s), "utf8");
const DYNAMIC_OG = ["app/(app)/bean/[id]/opengraph-image.tsx", "app/(app)/roaster/[id]/opengraph-image.tsx"];
it("static default OG exists", () => { expect(existsSync(p("app/opengraph-image.tsx"))).toBe(true); });
it("dynamic OG routes are force-dynamic and NOT edge", () => {
  for (const f of DYNAMIC_OG) {
    expect(existsSync(p(f)), `${f} exists`).toBe(true);
    const src = read(f);
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    expect(src).not.toMatch(/runtime\s*=\s*["']edge["']/);
  }
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Create `app/opengraph-image.tsx`** (branded default, no DB — may static-generate at build):

```tsx
import { ImageResponse } from "next/og";

export const alt = "Cortado — Coffee Journal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgDefault() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f4ece1", color: "#2b2420", fontSize: 64, fontWeight: 700 }}>
        <div style={{ fontSize: 88 }}>☕ Cortado</div>
        <div style={{ fontSize: 36, marginTop: 12, opacity: 0.7 }}>Coffee Journal</div>
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 4: Create `app/twitter-image.tsx`** — re-export the OG default:

```ts
export { default, alt, size, contentType } from "./opengraph-image";
```

### Task 10: Dynamic bean OG image

**Files:** Create `app/(app)/bean/[id]/opengraph-image.tsx` (+ `twitter-image.tsx` re-export).

- [ ] **Step 1: Create the route** (force-dynamic, default font, cached query, nodejs runtime):

```tsx
import { ImageResponse } from "next/og";
import { getCurrentUserId } from "@/lib/auth";
import { getBeanCached } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const alt = "Coffee bean on Cortado";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function BeanOg({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bean = await getBeanCached(await getCurrentUserId(), id);
  const title = bean?.name ?? "Cortado";
  const sub = bean ? [bean.roasterName, bean.origin].filter(Boolean).join(" · ") : "Coffee Journal";
  const rating = bean && bean.ratings > 0 ? `★ ${bean.avgRating.toFixed(1)}` : "";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f4ece1", color: "#2b2420" }}>
        <div style={{ fontSize: 32, opacity: 0.7 }}>☕ Cortado</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontSize: 38, marginTop: 16, opacity: 0.75 }}>{sub}</div>
        </div>
        <div style={{ fontSize: 44, fontWeight: 700, color: "#7a4f2a" }}>{rating}</div>
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 2: `app/(app)/bean/[id]/twitter-image.tsx`** — `export { default, dynamic, alt, size, contentType } from "./opengraph-image";`

### Task 11: Dynamic roaster OG image

**Files:** Create `app/(app)/roaster/[id]/opengraph-image.tsx` (+ twitter re-export). Same shape as Task 10 but via `getRoasterByIdCached`, showing `r.name` + `r.city`.

- [ ] **Step 1: Create the route** (mirror Task 10; title `r.name`, sub `r.city`, no rating). Include `export const dynamic = "force-dynamic"` and the twitter re-export.

- [ ] **Step 2: Run OG structural test → pass; tsc.**

- [ ] **Step 3: Build — verify NO build-time DB hit**

Run: `rm -rf .next && npm run build 2>&1 | tee /tmp/m5a-build.log | tail -25`
Expected: success; bean/roaster/OG routes listed as `ƒ` (dynamic). Confirm no DB-connection error in the log (force-dynamic kept the OG routes off the build-time render path).

- [ ] **Step 4: Commit Cut 3**

```bash
git add -A && git commit -m "feat(m5a): OG + twitter images (static default + dynamic bean/roaster via next/og)"
```

---

## Cut 4 — Live verification (controller-driven)

### Task 12: Live checks + green gate

- [ ] **Step 1: Green gate** — `npm run test` (coffee-pg up) · `npm run build` · `npm run lint` · `npm run typecheck` · drift check. All green.
- [ ] **Step 2: robots/sitemap** — start prod server; `curl /robots.txt` (shows disallow list + sitemap URL); `curl /sitemap.xml` (lists `/bean/*` + `/roaster/*`, **no** `/profile`,`/u/`,`/settings`,auth). With `AUTH_URL` set, URLs are absolute to the prod origin.
- [ ] **Step 3: OG images** — `curl -I` the static `/opengraph-image`, a bean `/bean/<id>/opengraph-image`, and a roaster OG → `200 image/png`. Eyeball one image renders the name/rating.
- [ ] **Step 4: Metadata + JSON-LD** — view-source a bean & roaster page: unique `<title>`, `<link rel="canonical">`, `og:*`/`twitter:*` tags, and the `application/ld+json` block present (carries `nonce`). **No CSP console violation** in the browser (JSON-LD nonce works). Validate the JSON-LD with Google Rich Results / schema.org validator; confirm no `null`.
- [ ] **Step 5: noindex** — confirm `/login` & `/signup` emit `<meta name="robots" content="noindex">`.
- [ ] **Step 6:** proceed to finishing-a-development-branch (PR) → post the `/code-review` summary comment per the milestone process.

---

## Self-review notes
- **Spec coverage:** helper+env (Task 1) ↔ Foundations; cached reads+getRoasterById+bounded queries (Task 2) ↔ Foundations; metadataBase (3); robots (4); sitemap (5); bean/roaster metadata+JSON-LD (6,7); noindex/discover (8); OG static+dynamic (9–11); live (12). Risk table: double-fetch→Task 2 cache; AUTH_URL→Task 1 fail-fast; OG static-optimize→Task 10/11 force-dynamic + Task 11 build check; edge/pg→no edge export (asserted in og-routes test); JSON-LD CSP→nonce (Task 6/7 + live Step 4); sitemap unbounded→Task 2 LIMIT; PII→catalog-only queries (asserted no email/user_id in Task 2).
- **Font:** v1 uses next/og's default font — no TTF/Dockerfile change (lean path the user endorsed; spec lists this as the accepted fallback). Brand TTF deferred.
- **Type/name consistency:** `getBeanCached`/`getRoasterByIdCached` used in both metadata and page; `getBeanIdsForSitemap`/`getRoasterIdsForSitemap` names match between Task 2 and Task 5; `beanJsonLd`/`roasterJsonLd`/`breadcrumbJsonLd` match between Task 6 and Tasks 6/7. Verify `Bean.roasterName` exists in `lib/types.ts` during Task 6.
