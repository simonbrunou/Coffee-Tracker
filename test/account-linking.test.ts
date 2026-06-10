import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("link-tokens lib", () => {
  const src = read("lib/link-tokens.ts");
  it("HMAC-binds to AUTH_SECRET and consumes provider-scoped + single-use", () => {
    expect(src).toMatch(/createHmac\("sha256", process\.env\.AUTH_SECRET/);
    // consume + prior-cleanup are now scoped by purpose too (link vs reauth_delete)
    expect(src).toMatch(/delete from link_tokens where token_hash = \$1 and provider = \$2 and purpose = \$3 and expires_at > now\(\)/i);
    expect(src).toMatch(/delete from link_tokens where user_id = \$1 and provider = \$2 and purpose = \$3/i);
  });
});

describe("link start + signIn branch", () => {
  it("sets the per-provider Lax/secure-in-prod cookie right before signIn (no try around signIn)", () => {
    const src = read("app/account-link-actions.ts");
    expect(src).toMatch(/link_nonce_/);
    expect(src).toMatch(/sameSite:\s*"lax"/);
    expect(src).toMatch(/httpOnly:\s*true/);
    expect(src).toMatch(/secure:\s*process\.env\.NODE_ENV === "production"/);
    expect(src).toMatch(/cookies\(\)[\s\S]{0,400}signIn\(/);
    expect(src).not.toMatch(/try\s*\{[\s\S]{0,800}signIn\(/); // signIn's redirect must throw uncaught
  });
  it("auth.ts link branch reads the per-provider cookie + consumes + links + redirect-strings", () => {
    const src = read("auth.ts");
    expect(src).toMatch(/consumeLinkToken/);
    expect(src).toMatch(/linkAccount/);
    expect(src).toMatch(/"\/settings\?linkError=taken"/);
    expect(src).toMatch(/"\/settings\?linked=1"/);
  });
  it("auth.ts reauth-delete branch consumes the purpose-scoped nonce, verifies the OWNER, then deletes", () => {
    const src = read("auth.ts");
    // reads the per-provider reauth cookie and consumes the reauth_delete-scoped nonce
    expect(src).toMatch(/reauth_delete_\$\{account\.provider\}/);
    expect(src).toMatch(/consumeLinkToken\(queryDb, delRaw, account\.provider, "reauth_delete"\)/);
    // SECURITY: the returning OAuth identity must own the account that requested delete
    expect(src).toMatch(/accountOwner\(account\.provider, account\.providerAccountId\)/);
    expect(src).toMatch(/owner !== consumed\.userId/);
    // only then is the hard delete run; a redirect string short-circuits session creation
    expect(src).toMatch(/deleteUserWithPii/);
    expect(src).toMatch(/return "\/\?deleted=1"/);
    // the owner-mismatch guard must return BEFORE the delete call runs
    expect(src.search(/deleteError=mismatch/)).toBeLessThan(src.search(/deleteUserWithPii\(\{ query/));
  });
});

describe("settings sign-in methods UI", () => {
  const src = read("components/settings.tsx");
  it("wires all four account-link actions + the last-method disable", () => {
    expect(src).toMatch(/linkOAuthStart/);
    expect(src).toMatch(/unlinkOAuth/);
    expect(src).toMatch(/setPassword/);
    expect(src).toMatch(/removePassword/);
    expect(src).toMatch(/methodCount <= 1/);
  });
});

describe("disconnect / password actions", () => {
  const src = read("app/account-link-actions.ts");
  it("removal bumps session_version then re-stamps via unstable_update", () => {
    expect(src).toMatch(/bumpSessionVersion/);
    expect(src).toMatch(/unstable_update/);
  });
  it("returns the last-method error string", () => {
    expect(src).toMatch(/at least one sign-in method/i);
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
    // Authoritative DB read — never the client-supplied session payload.
    expect(src).toMatch(/token\.sv = \(await getSessionVersion\(queryDb, token\.uid\)\)/);
    expect(src).not.toMatch(/token\.sv = session\.sessionVersion/);
  });
});
