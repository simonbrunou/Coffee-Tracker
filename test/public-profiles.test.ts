import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isValidHandle } from "@/lib/handles";
import { resolveOrCreateOAuthUser } from "@/lib/users-repo";
import { userMetadata } from "@/lib/seo";
import { personJsonLd } from "@/lib/json-ld";
import { computeTopFlavors } from "@/lib/profile-flavors";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("PublicProfile type", () => {
  it("extends User with discoverable", () => {
    const src = read("lib/types.ts");
    expect(src).toMatch(/interface PublicProfile extends User/);
    expect(src).toMatch(/discoverable: boolean/);
  });
});

describe("reserved handles", () => {
  it("rejects route-shadowing handles", () => {
    for (const h of ["settings", "discover", "u", "api", "profile"]) expect(isValidHandle(h)).toBe(false);
  });
  it("still accepts normal handles", () => {
    expect(isValidHandle("simon_b")).toBe(true);
  });
});

const prof = (d: boolean) => ({
  id: "u1", name: "Sam", handle: "sam", avatar: "#abc",
  tastings: 3, followers: 1, following: 2, followedByMe: false, bio: "hi", discoverable: d,
});

describe("userMetadata", () => {
  it("noindex when not found", () => {
    expect(userMetadata(null, "x").robots).toEqual({ index: false, follow: false });
  });
  it("noindex when not discoverable, index when discoverable, canonical set", () => {
    expect(userMetadata(prof(false), "sam").robots).toEqual({ index: false, follow: false });
    expect(userMetadata(prof(true), "sam").robots).toEqual({ index: true, follow: true });
    expect(userMetadata(prof(true), "sam").alternates?.canonical).toBe("/u/sam");
  });
});

describe("personJsonLd", () => {
  it("is a ProfilePage with a Person main entity", () => {
    const ld = personJsonLd(prof(true), "https://x/u/sam");
    expect(ld["@type"]).toBe("ProfilePage");
    const main = ld.mainEntity as Record<string, unknown>;
    expect(main["@type"]).toBe("Person");
    expect(main.alternateName).toBe("@sam");
  });
});

describe("computeTopFlavors", () => {
  it("counts + orders by count desc then name, capped", () => {
    const t = (flavors: string[]) => ({ beanFlavors: flavors });
    const out = computeTopFlavors([t(["cocoa", "nutty"]), t(["cocoa"]), t(["apple"])], 2);
    expect(out).toEqual([{ flavor: "cocoa", n: 2 }, { flavor: "apple", n: 1 }]);
  });
});

describe("OAuth handle-collision retry", () => {
  it("retries the user insert once on a handle unique violation", async () => {
    const calls: string[] = [];
    let userInserts = 0;
    const db = {
      query: async (text: string) => {
        if (text.startsWith("select user_id from accounts")) return { rows: [] };
        if (text.startsWith("insert into users")) {
          userInserts++;
          calls.push("user");
          if (userInserts === 1) {
            throw Object.assign(new Error("dup"), { code: "23505", constraint: "users_handle_lower_uq" });
          }
          return { rows: [] };
        }
        if (text.startsWith("insert into accounts")) {
          calls.push("account");
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    const id = await resolveOrCreateOAuthUser(db, {
      provider: "google",
      providerAccountId: "x",
      type: "oidc",
      name: "A",
      email: null,
      image: null,
    });
    expect(userInserts).toBe(2); // retried once
    expect(calls).toContain("account"); // proceeded after the retry
    expect(id).toMatch(/^u-/);
  });
});
