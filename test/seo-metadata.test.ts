import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beanMetadata, roasterMetadata } from "@/lib/seo";
import type { Bean, Roaster } from "@/lib/types";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("root metadata", () => {
  it("sets metadataBase from the public base url and keeps the viewport export", () => {
    const src = read("app/layout.tsx");
    expect(src).toMatch(/metadataBase/);
    expect(src).toMatch(/getPublicBaseUrl/);
    expect(src).toMatch(/export const viewport/); // R9: not clobbered
  });
});

describe("auth pages are noindex; discover has its own title", () => {
  it("login & signup are noindex", () => {
    for (const p of ["app/(auth)/login/page.tsx", "app/(auth)/signup/page.tsx"]) {
      expect(read(p)).toMatch(/robots:\s*\{\s*index:\s*false/);
    }
  });
  it("discover exports its own metadata + canonical", () => {
    const src = read("app/(app)/discover/page.tsx");
    expect(src).toMatch(/export const metadata/);
    expect(src).toMatch(/canonical:\s*"\/discover"/);
  });
});

// R8: metadata builders (pure; the pages' generateMetadata delegate to these).
describe("beanMetadata / roasterMetadata", () => {
  const bean = { name: "Yirgacheffe", roasterName: "Onyx", origin: "Ethiopia", process: "Natural", flavors: ["berry"] } as unknown as Bean;
  const roaster = { name: "Onyx", city: "Rogers", blurb: "" } as unknown as Roaster;
  it("bean: title + canonical from the bean", () => {
    const m = beanMetadata(bean, "b1");
    expect(String(m.title)).toContain("Yirgacheffe");
    expect(String(m.title)).toContain("Onyx");
    expect(m.alternates?.canonical).toBe("/bean/b1");
  });
  it("bean: null → minimal not-found title + noindex (reliable soft-404 guard)", () => {
    const m = beanMetadata(null, "x");
    expect(m.title).toBe("Bean not found — Cortado");
    expect((m.robots as { index?: boolean })?.index).toBe(false);
  });
  it("roaster: title + canonical", () => {
    const m = roasterMetadata(roaster, "r1");
    expect(String(m.title)).toContain("Onyx");
    expect(m.alternates?.canonical).toBe("/roaster/r1");
  });
  it("roaster: null → minimal not-found title + noindex", () => {
    const m = roasterMetadata(null, "x");
    expect(m.title).toBe("Roaster not found — Cortado");
    expect((m.robots as { index?: boolean })?.index).toBe(false);
  });
});

describe("private app pages have a per-route title from a server wrapper (a11y 2.4.2)", () => {
  for (const p of ["app/(app)/settings/page.tsx", "app/(app)/journal/page.tsx", "app/(app)/profile/page.tsx"]) {
    it(`${p} exports a metadata title and is NOT a client component`, () => {
      const src = read(p);
      expect(src).toMatch(/export const metadata/);
      expect(src).toMatch(/title:/);
      expect(src).not.toMatch(/^"use client"/m);
    });
  }
});
