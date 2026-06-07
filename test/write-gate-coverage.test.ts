import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "app/actions.ts"), "utf8");
const CONTENT_WRITES = [
  "logBrew", "addBag", "updateBrew", "deleteBrew", "updateBag", "deleteBag",
  "toggleLike", "toggleFollowUser", "toggleFollowRoaster", "toggleSaveTasting",
  "toggleWishlistBean", "addComment", "updateComment", "deleteComment",
];

function body(name: string) {
  const start = src.indexOf(`export async function ${name}`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport async function", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("content-write actions are verification-gated", () => {
  for (const fn of CONTENT_WRITES) {
    it(`${fn} uses requireVerifiedUserId`, () => {
      expect(body(fn)).toMatch(/requireVerifiedUserId\(\)/);
    });
  }
});
