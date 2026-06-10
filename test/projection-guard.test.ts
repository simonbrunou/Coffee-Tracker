import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("client projection guard", () => {
  it("getUserById selects no sensitive columns", () => {
    const src = readFileSync(join(process.cwd(), "lib/queries.ts"), "utf8");
    const start = src.indexOf("export async function getUserById");
    expect(start).toBeGreaterThan(-1);
    // Slice up to the next top-level export so we capture the whole function body
    const nextExport = src.indexOf("\nexport", start + 1);
    const body = src.slice(start, nextExport === -1 ? undefined : nextExport);
    for (const col of ["password_hash", "email", "email_verified", "session_version"]) {
      expect(body.includes(col)).toBe(false);
    }
  });
});
