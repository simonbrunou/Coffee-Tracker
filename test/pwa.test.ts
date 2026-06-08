import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { THEME_LIGHT, THEME_DARK } from "@/lib/theme-colors";
import manifest from "@/app/manifest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("PWA theme colors", () => {
  it("exports the true cream sRGB values", () => {
    expect(THEME_LIGHT).toBe("#f8f3eb");
    expect(THEME_DARK).toBe("#18130e");
  });
  it("root viewport sets a static themeColor from the shared constant", () => {
    const src = read("app/layout.tsx");
    expect(src).toMatch(/themeColor/);
    expect(src).toMatch(/THEME_LIGHT/);
  });
  it("app-provider uses the shared theme constants (no drifting hex)", () => {
    const src = read("components/app-provider.tsx");
    expect(src).toMatch(/THEME_(LIGHT|DARK)/);
  });
});

describe("web app manifest", () => {
  const m = manifest();
  it("is a standalone installable PWA rooted at /", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.name).toMatch(/Cortado/);
  });
  it("references stable /icons PNGs incl. a maskable", () => {
    const srcs = (m.icons ?? []).map((i) => i.src);
    expect(srcs).toContain("/icons/icon-192.png");
    expect(srcs).toContain("/icons/icon-512.png");
    expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
  });
  it("declares force-static so it prerenders at the no-DB build", () => {
    expect(read("app/manifest.ts")).toMatch(/export const dynamic = "force-static"/);
  });
});

describe("generated icons", () => {
  for (const f of ["public/icons/icon-192.png", "public/icons/icon-512.png", "public/icons/maskable-512.png"]) {
    it(`${f} exists and is non-empty`, () => {
      const p = join(process.cwd(), f);
      expect(existsSync(p)).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(500);
    });
  }
});

describe("apple-icon", () => {
  const src = read("app/apple-icon.tsx");
  it("is force-static and DB-free", () => {
    expect(src).toMatch(/export const dynamic = "force-static"/);
    expect(src).not.toMatch(/@\/lib\/(db|queries)/);
  });
});

describe("Dockerfile", () => {
  it("copies public/ into the runner so /icons PNGs exist at runtime", () => {
    expect(read("Dockerfile")).toMatch(/COPY --chown=nextjs:nodejs --from=build \/app\/public/);
  });
});
