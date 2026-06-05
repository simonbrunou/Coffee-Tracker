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
  // Regressions caught by the live-DB spike: pg returns bigint count(*) as a
  // STRING, so counts must be cast to int (else `likes + 1` string-concats to "01");
  // and a bare `$1 is not null` has no inferable type, so the param needs ::text.
  it("casts count aggregates to int (pg returns bigint as string)", () => {
    expect(body("getBeans")).toMatch(/coalesce\(r\.ratings, 0\)::int/);
    expect(body("getUsers")).toMatch(/coalesce\(t\.tastings, 0\)::int/);
    expect(body("getTastings")).toMatch(/coalesce\(l\.likes, 0\)::int/);
  });
  it("casts the current-user param to text for null-safety", () => {
    expect(body("getTastings")).toMatch(/\$1::text is not null/);
  });
});
