import { describe, it, expect, vi, beforeEach } from "vitest";
import { githubEmailVerified } from "@/lib/oauth-email";

beforeEach(() => vi.restoreAllMocks());

describe("githubEmailVerified", () => {
  it("true when the primary email is verified", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify([
      { email: "x@e.com", primary: false, verified: true },
      { email: "p@e.com", primary: true, verified: true },
    ]), { status: 200 }));
    expect(await githubEmailVerified("tok")).toBe(true);
  });
  it("false when the primary email is unverified", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify([
      { email: "p@e.com", primary: true, verified: false },
    ]), { status: 200 }));
    expect(await githubEmailVerified("tok")).toBe(false);
  });
  it("false on a non-OK response (fail-safe: treat as unverified)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("nope", { status: 401 }));
    expect(await githubEmailVerified("tok")).toBe(false);
  });
});
