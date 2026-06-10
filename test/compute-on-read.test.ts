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
// SELECT/JOINS are shared fragments now (M3·D): the per-row compute-on-read +
// denormalized columns live here, reused by the feed/scoped queries.
const tastingSql = src.slice(src.indexOf("const TASTING_SELECT_COLS"), src.indexOf("export type FeedTab"));
const beanSql = src.slice(src.indexOf("const BEAN_SELECT_COLS"), src.indexOf("export async function getMyTastings"));
// R7: the roaster aggregate/projection is now a shared fragment, reused by
// getRoasters + getRoasterById. R6: the user aggregate projection + joins are
// shared fragments, reused by getUserById + getUserProfileByHandle.
const roasterSql = src.slice(src.indexOf("const ROASTER_SELECT"), src.indexOf("export async function getRoasters"));
const userSql = src.slice(src.indexOf("const USER_SELECT_COLS"), src.indexOf("export async function getUserById"));

describe("compute-on-read counts", () => {
  it("the bean fragment derives avgRating/ratings from tastings, not stored columns", () => {
    expect(beanSql).toMatch(/avg\(rating\)/i);
    expect(beanSql).toMatch(/count\(\*\)/i);
    expect(beanSql).toMatch(/coalesce\(r\.avg_rating/i);
    expect(beanSql).toMatch(/coalesce\(r\.ratings/i);
    expect(beanSql).not.toMatch(/beans\.avg_rating/i);
    expect(beanSql).not.toMatch(/beans\.ratings\b/i);
  });
  it("the user fragment derives the tastings count", () => {
    expect(userSql).toMatch(/count\(\*\)/i);
    expect(userSql).not.toMatch(/u\.tastings/i);
  });
  it("the tasting fragment derives likes + likedByMe and exposes createdAt", () => {
    expect(tastingSql).toMatch(/count\(\*\)/i);
    expect(tastingSql).toMatch(/"likedByMe"/);
    expect(tastingSql).toMatch(/"createdAt"/);
  });
  it("the feed/scoped tasting queries use the shared denormalized fragment", () => {
    expect(body("getFeedPage")).toMatch(/TASTING_SELECT_COLS/);
    expect(body("getTastingById")).toMatch(/TASTING_SELECT_COLS/);
    expect(body("getMyTastings")).toMatch(/TASTING_SELECT_COLS/);
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
  // STRING, so counts must be cast to int; a bare `$1 is not null` needs ::text.
  it("casts count aggregates to int (pg returns bigint as string)", () => {
    expect(beanSql).toMatch(/coalesce\(r\.ratings, 0\)::int/);
    expect(userSql).toMatch(/coalesce\(t\.tastings, 0\)::int/);
    expect(tastingSql).toMatch(/coalesce\(l\.likes, 0\)::int/);
  });
  it("casts the current-user param to text for null-safety", () => {
    expect(tastingSql).toMatch(/\$1::text is not null/);
  });
  it("getRoasters takes currentUserId; the roaster fragment derives followers ::int, exposes followedByMe", () => {
    expect(body("getRoasters")).toMatch(/getRoasters\(\s*currentUserId/);
    expect(roasterSql).toMatch(/count\(\*\)[\s\S]*::int/i);
    expect(roasterSql).toMatch(/"followedByMe"/);
    expect(roasterSql).toMatch(/\$1::text is not null/);
  });
  it("the user fragment derives followers/following ::int (not stored columns) + followedByMe", () => {
    expect(userSql).toMatch(/coalesce\([^)]*followers[^)]*\)::int/i);
    expect(userSql).toMatch(/coalesce\([^)]*following[^)]*\)::int/i);
    expect(userSql).not.toMatch(/u\.followers/);
    expect(userSql).not.toMatch(/u\.following/);
    expect(userSql).toMatch(/"followedByMe"/);
  });
  it("the tasting fragment derives commentsCount ::int + savedByMe (no stale column)", () => {
    expect(tastingSql).toMatch(/"commentsCount"/);
    expect(tastingSql).toMatch(/coalesce\([^)]*\)::int as "commentsCount"/i);
    expect(tastingSql).toMatch(/"savedByMe"/);
    expect(tastingSql).not.toMatch(/t\.comments/);
  });
  it("the bean fragment exposes wishlistedByMe (anon-safe)", () => {
    expect(beanSql).toMatch(/"wishlistedByMe"/);
  });
  it("getFeedPage's Following branch joins the follow graph", () => {
    const b = body("getFeedPage");
    expect(b).toMatch(/join user_follows/i);
    expect(b).toMatch(/followee_id = t\.user_id/);
  });
});
