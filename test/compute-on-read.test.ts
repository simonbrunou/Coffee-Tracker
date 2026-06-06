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
// Tasting SELECT/JOINS are shared fragments now (M3·D); the per-row compute-on-read
// + denormalized author/bean columns live here, reused by getTastings/getFeedPage.
const tastingSql = src.slice(src.indexOf("const TASTING_SELECT_COLS"), src.indexOf("export type FeedTab"));

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
  it("the tasting fragment derives likes + likedByMe and exposes createdAt", () => {
    expect(tastingSql).toMatch(/count\(\*\)/i);
    expect(tastingSql).toMatch(/"likedByMe"/);
    expect(tastingSql).toMatch(/"createdAt"/);
  });
  it("getTastings + getFeedPage use the shared denormalized fragment", () => {
    expect(body("getTastings")).toMatch(/TASTING_SELECT_COLS/);
    expect(body("getFeedPage")).toMatch(/TASTING_SELECT_COLS/);
  });
  it("tasting rows carry denormalized author + bean display fields", () => {
    expect(tastingSql).toMatch(/"authorName"/);
    expect(tastingSql).toMatch(/"beanName"/);
    expect(tastingSql).toMatch(/"beanRoasterName"/);
    expect(tastingSql).toMatch(/"beanFlavors"/);
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
    expect(tastingSql).toMatch(/coalesce\(l\.likes, 0\)::int/);
  });
  it("casts the current-user param to text for null-safety", () => {
    expect(tastingSql).toMatch(/\$1::text is not null/);
  });
  it("getRoasters takes currentUserId, derives followers ::int, exposes followedByMe", () => {
    const b = body("getRoasters");
    expect(b).toMatch(/getRoasters\(\s*currentUserId/);
    expect(b).toMatch(/count\(\*\)[\s\S]*::int/i);
    expect(b).toMatch(/"followedByMe"/);
    expect(b).toMatch(/\$1::text is not null/);
  });
  it("getUsers derives followers/following ::int (not stored columns) + followedByMe", () => {
    const b = body("getUsers");
    expect(b).toMatch(/coalesce\([^)]*followers[^)]*\)::int/i);
    expect(b).toMatch(/coalesce\([^)]*following[^)]*\)::int/i);
    expect(b).not.toMatch(/u\.followers/);
    expect(b).not.toMatch(/u\.following/);
    expect(b).toMatch(/"followedByMe"/);
  });
  it("the tasting fragment derives commentsCount ::int + savedByMe (no stale column)", () => {
    expect(tastingSql).toMatch(/"commentsCount"/);
    expect(tastingSql).toMatch(/coalesce\([^)]*\)::int as "commentsCount"/i);
    expect(tastingSql).toMatch(/"savedByMe"/);
    expect(tastingSql).not.toMatch(/t\.comments/);
  });
  it("getBeans exposes wishlistedByMe (anon-safe)", () => {
    const b = body("getBeans");
    expect(b).toMatch(/"wishlistedByMe"/);
  });
  it("getFollowingTastings joins the follow graph", () => {
    const b = body("getFollowingTastings");
    expect(b).toMatch(/join user_follows/i);
    expect(b).toMatch(/followee_id = t\.user_id/);
  });
});
