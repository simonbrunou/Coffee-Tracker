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
    for (const p of ["app/(app)/login/page.tsx", "app/(app)/signup/page.tsx"]) {
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
  it("bean: null → minimal not-found title", () => {
    expect(beanMetadata(null, "x").title).toBe("Bean not found — Cortado");
  });
  it("roaster: title + canonical", () => {
    const m = roasterMetadata(roaster, "r1");
    expect(String(m.title)).toContain("Onyx");
    expect(m.alternates?.canonical).toBe("/roaster/r1");
  });
  it("roaster: null → minimal not-found title", () => {
    expect(roasterMetadata(null, "x").title).toBe("Roaster not found — Cortado");
  });
});
