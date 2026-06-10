import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const beanIds = vi.fn();
const roasterIds = vi.fn();
const userHandles = vi.fn();
vi.mock("@/lib/queries", () => ({
  getBeanIdsForSitemap: (...a: unknown[]) => beanIds(...a),
  getRoasterIdsForSitemap: (...a: unknown[]) => roasterIds(...a),
  getUserHandlesForSitemap: (...a: unknown[]) => userHandles(...a),
}));
import sitemap from "@/app/sitemap";

let orig: string | undefined;
beforeEach(() => {
  orig = process.env.AUTH_URL;
  process.env.AUTH_URL = "https://cortado.example.com";
  beanIds.mockResolvedValue([{ id: "b1", createdAt: "2026-01-01T00:00:00Z" }]);
  roasterIds.mockResolvedValue([{ id: "r1" }]);
  userHandles.mockResolvedValue([]); // default: no discoverable users
});
afterEach(() => { if (orig === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = orig; });

describe("sitemap", () => {
  it("lists static + bean + roaster URLs, excludes personal routes", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain("https://cortado.example.com/bean/b1");
    expect(urls).toContain("https://cortado.example.com/roaster/r1");
    expect(urls).toContain("https://cortado.example.com/discover");
    expect(urls.some((u) => /\/profile|\/u\/|\/settings|\/login|\/signup|\/journal/.test(u))).toBe(false);
  });
  it("lists discoverable users' profile URLs", async () => {
    userHandles.mockResolvedValue([{ handle: "sam" }]);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain("https://cortado.example.com/u/sam");
  });
  it("is force-dynamic so it never hits the DB at build", () => {
    expect(readFileSync(join(process.cwd(), "app/sitemap.ts"), "utf8")).toMatch(/export const dynamic = "force-dynamic"/);
  });
});
