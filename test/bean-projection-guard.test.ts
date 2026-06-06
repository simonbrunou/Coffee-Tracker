import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("bean owner-scoping guard", () => {
  it("redacts private bag fields for non-owners (shared BEAN_SELECT_COLS fragment)", () => {
    const src = readFileSync("lib/queries.ts", "utf8");
    const start = src.indexOf("const BEAN_SELECT_COLS");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("const BEAN_JOINS"));
    // private bag fields must be owner-scoped, not raw columns
    expect(body).toMatch(/case when beans\.user_id = \$1 then beans\.bag_weight/);
    expect(body).toMatch(/case when beans\.user_id = \$1 then beans\.purchased/);
    expect(body).toMatch(/case when beans\.user_id = \$1 then beans\.remaining/);
    expect(body).toMatch(/coalesce\(beans\.owned and beans\.user_id = \$1, false\)/);
  });
  it("getBean takes the viewer id as its first param", () => {
    const src = readFileSync("lib/queries.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function getBean("));
    expect(fn.slice(0, 90)).toMatch(/getBean\(\s*currentUserId/);
  });
});
