import { describe, it, expect, vi } from "vitest";
import {
  resolveOrCreateOAuthUser,
  findCredentialUserByEmail,
  createCredentialUser,
  getSessionVersion,
  bumpSessionVersion,
} from "@/lib/users-repo";

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

  it("returns null when no row is found", async () => {
    const { client } = fakeClient([{ rows: [] }]);
    const row = await findCredentialUserByEmail(client, "nobody@example.com");
    expect(row).toBeNull();
  });
});

describe("createCredentialUser", () => {
  it("inserts a user row and returns a u- prefixed id", async () => {
    const { client, queries } = fakeClient([{ rows: [] }]);
    const id = await createCredentialUser(client, {
      name: "Theo",
      email: "t@e.com",
      passwordHash: "hashed",
      handle: null,
      avatar: "#b07a3c",
    });
    expect(id).toMatch(/^u-/);
    expect(queries[0].text).toMatch(/insert into users/i);
    expect(queries[0].params).toContain(0);        // session_version
    expect(queries[0].params).toContain("hashed"); // password hash
  });

  it("propagates pg errors (e.g. unique violation)", async () => {
    const dupError = Object.assign(new Error("dup"), { code: "23505" });
    const throwingClient = { query: vi.fn(async () => { throw dupError; }) };
    await expect(
      createCredentialUser(throwingClient, {
        name: "Theo",
        email: "t@e.com",
        passwordHash: "hashed",
        handle: null,
        avatar: "#b07a3c",
      }),
    ).rejects.toThrow("dup");
  });
});

describe("getSessionVersion", () => {
  it("returns the session_version integer when the user exists", async () => {
    const { client } = fakeClient([{ rows: [{ session_version: 5 }] }]);
    const version = await getSessionVersion(client, "u-1");
    expect(version).toBe(5);
  });

  it("returns null when no user row is found", async () => {
    const { client } = fakeClient([{ rows: [] }]);
    const version = await getSessionVersion(client, "u-missing");
    expect(version).toBeNull();
  });
});

describe("bumpSessionVersion", () => {
  it("runs an UPDATE that increments session_version for the given user id", async () => {
    const { client, queries } = fakeClient([{ rows: [] }]);
    await bumpSessionVersion(client, "u-1");
    expect(queries[0].text).toMatch(/update users set session_version = session_version \+ 1/i);
    expect(queries[0].params).toEqual(["u-1"]);
  });
});
