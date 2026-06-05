import { describe, it, expect, vi } from "vitest";
import { resolveOrCreateOAuthUser, findCredentialUserByEmail } from "@/lib/users-repo";

function fakeClient(responses: Array<{ rows: unknown[] }>) {
  const queries: Array<{ text: string; params: unknown[] }> = [];
  let i = 0;
  const client = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      queries.push({ text, params });
      return responses[i++] ?? { rows: [] };
    }),
  };
  return { client, queries };
}

describe("resolveOrCreateOAuthUser", () => {
  it("reuses the existing user when the account row exists", async () => {
    const { client, queries } = fakeClient([{ rows: [{ user_id: "u-existing" }] }]);
    const id = await resolveOrCreateOAuthUser(client, {
      provider: "github", providerAccountId: "gh-123", name: "Theo", email: "t@e.com", image: null, type: "oauth",
    });
    expect(id).toBe("u-existing");
    expect(queries).toHaveLength(1); // only the account lookup
  });

  it("creates a user + account when none exists", async () => {
    const { client, queries } = fakeClient([
      { rows: [] },          // account lookup → miss
      { rows: [] },          // insert users
      { rows: [] },          // insert accounts
    ]);
    const id = await resolveOrCreateOAuthUser(client, {
      provider: "google", providerAccountId: "g-9", name: "Mara", email: "m@e.com", image: "http://x/y", type: "oidc",
    });
    expect(id).toMatch(/^u-/);
    expect(queries[1].text).toMatch(/insert into users/i);
    expect(queries[2].text).toMatch(/insert into accounts/i);
    expect(queries[1].params).toContain(0); // session_version 0 on a new row
  });
});

describe("findCredentialUserByEmail", () => {
  it("lowercases the email and returns the row", async () => {
    const { client, queries } = fakeClient([{ rows: [{ id: "u-1", password_hash: "h", session_version: 2 }] }]);
    const row = await findCredentialUserByEmail(client, "Theo@Example.com");
    expect(row).toEqual({ id: "u-1", password_hash: "h", session_version: 2 });
    expect(queries[0].params).toEqual(["theo@example.com"]);
  });
});
