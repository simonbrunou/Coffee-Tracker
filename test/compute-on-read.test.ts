import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "lib/queries.ts"), "utf8");
function body(name: string) {
  const start = src.indexOf(`export async function ${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("compute-on-read counts", () => {
  it("getBeans derives avgRating/ratings from tastings, not stored columns", () => {
    const b = body("getBeans");
    expect(b).toMatch(/avg\(rating\)/i);
    expect(b).toMatch(/count\(\*\)/i);
    expect(b).toMatch(/coalesce/i);
    expect(b).not.toMatch(/b\.avg_rating/i);
    expect(b).not.toMatch(/b\.ratings/i);
  });
  it("getUsers derives the tastings count", () => {
    const b = body("getUsers");
    expect(b).toMatch(/count\(\*\)/i);
    expect(b).not.toMatch(/u\.tastings/i);
  });
  it("getTastings derives likes + likedByMe and exposes createdAt", () => {
    const b = body("getTastings");
    expect(b).toMatch(/count\(\*\)/i);
    expect(b).toMatch(/"likedByMe"/);
    expect(b).toMatch(/"createdAt"/);
  });
  it("getLikedTastingIds is removed", () => {
    expect(src).not.toContain("getLikedTastingIds");
  });
});
