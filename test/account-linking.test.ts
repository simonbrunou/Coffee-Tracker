import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("link-tokens lib", () => {
  const src = read("lib/link-tokens.ts");
  it("HMAC-binds to AUTH_SECRET and consumes provider-scoped + single-use", () => {
    expect(src).toMatch(/createHmac\("sha256", process\.env\.AUTH_SECRET/);
    expect(src).toMatch(/delete from link_tokens where token_hash = \$1 and provider = \$2 and expires_at > now\(\)/i);
    expect(src).toMatch(/delete from link_tokens where user_id = \$1 and provider = \$2/i); // prior-per-user-provider
  });
});

describe("auth.ts lazy init", () => {
  const src = read("auth.ts");
  it("uses the NextAuth(async (req) => config) factory form", () => {
    expect(src).toMatch(/NextAuth\(\s*async\s*\(\s*req/);
  });
  it("still exports the handlers + exposes unstable_update", () => {
    expect(src).toMatch(/export const \{[^}]*handlers[^}]*\} = NextAuth/);
    expect(src).toMatch(/unstable_update/);
  });
  it("re-stamps token.sv on the update trigger BEFORE the uid short-circuit (R1)", () => {
    // The trigger==="update" branch must precede `if (token.uid) return token`,
    // or unstable_update is a no-op and the bump logs the actor out.
    const updateIdx = src.search(/trigger === "update"/);
    const shortCircuitIdx = src.search(/if \(token\.uid\) return token/);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(shortCircuitIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(shortCircuitIdx);
    expect(src).toMatch(/token\.sv = session\.sessionVersion/);
  });
});
