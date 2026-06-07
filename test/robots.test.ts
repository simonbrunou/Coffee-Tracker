import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import robots from "@/app/robots";

let orig: string | undefined;
beforeEach(() => { orig = process.env.AUTH_URL; process.env.AUTH_URL = "https://cortado.example.com"; });
afterEach(() => { if (orig === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = orig; });

describe("robots", () => {
  it("indexes catalog, disallows api + personal routes, links sitemap", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule?.allow).toBe("/");
    for (const d of ["/api/", "/settings", "/login", "/signup", "/profile", "/journal"]) {
      expect(rule?.disallow).toContain(d);
    }
    expect(r.sitemap).toBe("https://cortado.example.com/sitemap.xml");
  });
  it("is force-dynamic so runtime AUTH_URL (not the build-time localhost) is used", () => {
    expect(readFileSync(join(process.cwd(), "app/robots.ts"), "utf8")).toMatch(/export const dynamic = "force-dynamic"/);
  });
});
