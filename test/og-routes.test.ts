import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const p = (s: string) => join(process.cwd(), s);
const read = (s: string) => readFileSync(p(s), "utf8");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u2600-\u27bf]/u; // satori's default font can't render these (incl. ☕ U+2615, ★ U+2605)
const DYN_OG = ["app/(app)/bean/[id]/opengraph-image.tsx", "app/(app)/roaster/[id]/opengraph-image.tsx"];
const DYN_TW = ["app/(app)/bean/[id]/twitter-image.tsx", "app/(app)/roaster/[id]/twitter-image.tsx"];

describe("OG / twitter image routes", () => {
  it("static default OG + twitter exist", () => {
    expect(existsSync(p("app/opengraph-image.tsx"))).toBe(true);
    expect(existsSync(p("app/twitter-image.tsx"))).toBe(true);
  });
  it("static OG is force-static and emoji-free", () => {
    const src = read("app/opengraph-image.tsx");
    expect(src).toMatch(/export const dynamic = "force-static"/);
    expect(src).not.toMatch(EMOJI);
  });
  it("dynamic OG routes: force-dynamic, no edge runtime, null viewer, emoji-free", () => {
    for (const f of DYN_OG) {
      expect(existsSync(p(f)), `${f} exists`).toBe(true);
      const src = read(f);
      expect(src).toMatch(/export const dynamic = "force-dynamic"/);
      expect(src).not.toMatch(/runtime\s*=\s*["']edge["']/);
      expect(src).not.toMatch(/getCurrentUserId/); // R7: pass null viewer, no per-crawl auth hit
      expect(src).not.toMatch(EMOJI);
    }
  });
  it("dynamic twitter-image routes reuse the OG renderer with in-file force-dynamic", () => {
    // Next 16 / Turbopack can't statically parse route-segment config (`dynamic`)
    // when it's re-exported, so each twitter route re-exports only the default
    // renderer and declares its own config inline.
    for (const f of DYN_TW) {
      expect(existsSync(p(f)), `${f} exists`).toBe(true);
      const src = read(f);
      expect(src).toMatch(/export\s*\{\s*default\s*\}\s*from\s*["']\.\/opengraph-image["']/);
      expect(src).toMatch(/export const dynamic = "force-dynamic"/);
      // dynamic must NOT be re-exported (the Turbopack build error we are guarding against)
      expect(src).not.toMatch(/export\s*\{[^}]*\bdynamic\b[^}]*\}\s*from/);
    }
  });
});
