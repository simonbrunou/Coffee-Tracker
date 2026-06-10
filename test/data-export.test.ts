import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("DSAR data export", () => {
  it("route is auth-gated, an attachment, and never cached", () => {
    const src = read("app/api/export/route.ts");
    expect(src).toMatch(/getCurrentUserId/);
    expect(src).toMatch(/status: 401/);
    expect(src).toMatch(/attachment; filename/);
    expect(src).toMatch(/no-store/);
  });
  it("gatherer scopes every query to the caller", () => {
    const src = read("lib/data-export.ts");
    expect(src).toMatch(/from users where id = \$1/);
    expect(src).toMatch(/from comments where user_id = \$1/);
    expect(src).toMatch(/from user_follows where follower_id = \$1/);
    expect(src).toMatch(/from accounts where user_id = \$1/);
  });
});
