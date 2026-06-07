import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

beforeEach(() => { process.env.AUTH_SECRET = "test-secret"; });

import { generateToken, createVerificationToken, consumeVerificationToken } from "@/lib/verification-tokens";

function fakeClient(responses: Array<{ rows: unknown[] }>) {
  const queries: Array<{ text: string; params: unknown[] }> = [];
  let i = 0;
  return {
    queries,
    client: { query: vi.fn(async (text: string, params: unknown[] = []) => { queries.push({ text, params }); return responses[i++] ?? { rows: [] }; }) },
  };
}

describe("generateToken", () => {
  it("returns a raw token and its HMAC-SHA256(raw, AUTH_SECRET) hash; unique per call", () => {
    const a = generateToken();
    expect(a.raw).not.toBe(a.hash);
    expect(a.hash).toBe(createHmac("sha256", "test-secret").update(a.raw).digest("hex"));
    expect(generateToken().raw).not.toBe(a.raw);
  });
});

describe("createVerificationToken", () => {
  it("deletes prior tokens then inserts and returns the raw token", async () => {
    const { client, queries } = fakeClient([{ rows: [] }, { rows: [] }]);
    const raw = await createVerificationToken(client, "u-1", "a@b.com");
    expect(typeof raw).toBe("string");
    expect(queries[0].text).toMatch(/delete from verification_tokens where user_id/i);
    expect(queries[1].text).toMatch(/insert into verification_tokens/i);
    expect(queries[1].params).toContain("u-1");
    expect(queries[1].params).toContain("a@b.com");
    expect(queries[1].params).not.toContain(raw); // the HASH is stored, never the raw token
  });
});

describe("consumeVerificationToken", () => {
  it("atomically deletes by hash + unexpired and returns the userId", async () => {
    const { client, queries } = fakeClient([{ rows: [{ user_id: "u-1" }] }]);
    const res = await consumeVerificationToken(client, "rawtoken");
    expect(res).toEqual({ userId: "u-1" });
    expect(queries[0].text).toMatch(/delete from verification_tokens where token_hash = \$1 and expires_at > now\(\) returning user_id/i);
    expect(queries[0].params[0]).toBe(createHmac("sha256", "test-secret").update("rawtoken").digest("hex"));
  });
  it("returns null when no row matches (invalid/expired/used)", async () => {
    const { client } = fakeClient([{ rows: [] }]);
    expect(await consumeVerificationToken(client, "x")).toBeNull();
  });
});
