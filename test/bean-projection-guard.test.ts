import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("getBeans owner-scoping guard", () => {
  it("redacts private bag fields for non-owners", () => {
    const src = readFileSync("lib/queries.ts", "utf8");
    const start = src.indexOf("export async function getBeans");
    const body = src.slice(start, src.indexOf("\nexport", start + 1));
    // private bag fields must be owner-scoped, not raw columns
    expect(body).toMatch(/case when user_id = \$1 then bag_weight/);
    expect(body).toMatch(/case when user_id = \$1 then purchased/);
    expect(body).toMatch(/case when user_id = \$1 then remaining/);
    expect(body).toMatch(/coalesce\(owned and user_id = \$1, false\)/);
    // getBeans must take the current user id
    expect(body).toMatch(/getBeans\(\s*currentUserId/);
  });
});
