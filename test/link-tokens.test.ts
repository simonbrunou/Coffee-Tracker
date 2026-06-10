import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLinkToken, consumeLinkToken } from "@/lib/link-tokens";

function mkDb() {
  const calls: { text: string; params: unknown[] }[] = [];
  const db = {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      calls.push({ text, params: params ?? [] });
      return { rows: text.includes("returning user_id") ? [{ user_id: "u-1" }] : [] };
    }),
  };
  return { db, calls };
}

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret";
});

describe("createLinkToken (purpose-scoped nonce)", () => {
  it("defaults to the 'link' purpose and scopes the prior-token cleanup to it", async () => {
    const { db, calls } = mkDb();
    await createLinkToken(db, "u-1", "google");
    const del = calls.find((c) => /delete from link_tokens where user_id/i.test(c.text))!;
    expect(del.params).toEqual(["u-1", "google", "link"]);
    const ins = calls.find((c) => /insert into link_tokens/i.test(c.text))!;
    expect(ins.text).toMatch(/purpose/i);
    expect(ins.params).toContain("link");
  });
  it("mints a 'reauth_delete' nonce without clobbering a pending 'link' nonce", async () => {
    const { db, calls } = mkDb();
    await createLinkToken(db, "u-1", "google", "reauth_delete");
    const del = calls.find((c) => /delete from link_tokens where user_id/i.test(c.text))!;
    // the cleanup is scoped to the SAME purpose, so a link nonce survives
    expect(del.params).toEqual(["u-1", "google", "reauth_delete"]);
    const ins = calls.find((c) => /insert into link_tokens/i.test(c.text))!;
    expect(ins.params).toContain("reauth_delete");
  });
});

describe("consumeLinkToken (purpose-scoped, atomic single-use)", () => {
  it("consumes only a token of the matching purpose", async () => {
    const { db, calls } = mkDb();
    const res = await consumeLinkToken(db, "raw-token", "google", "reauth_delete");
    expect(res).toEqual({ userId: "u-1" });
    const del = calls[0];
    expect(del.text).toMatch(/delete from link_tokens where token_hash = \$1 and provider = \$2 and purpose = \$3 and expires_at > now\(\) returning user_id/i);
    expect(del.params?.[1]).toBe("google");
    expect(del.params?.[2]).toBe("reauth_delete");
  });
  it("defaults to the 'link' purpose for the existing link flow", async () => {
    const { db, calls } = mkDb();
    await consumeLinkToken(db, "raw-token", "github");
    expect(calls[0].params?.[2]).toBe("link");
  });
  it("returns null when nothing matched (wrong purpose / expired / already used)", async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) };
    expect(await consumeLinkToken(db, "raw", "google", "reauth_delete")).toBeNull();
  });
});
