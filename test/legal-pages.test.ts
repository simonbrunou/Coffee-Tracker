import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const p = (...s: string[]) => join(process.cwd(), ...s);
const read = (...s: string[]) => readFileSync(p(...s), "utf8");
const PAGES = ["privacy", "terms", "cookies"] as const;

describe("(legal) group", () => {
  it("layout exists, is DB-independent, shows the disclaimer + footer links", () => {
    const layout = read("app/(legal)/layout.tsx");
    expect(layout).not.toMatch(/getAppData|@\/lib\/db|@\/lib\/queries|AppProvider/);
    expect(layout).toMatch(/review (it )?with (qualified )?counsel/i);
    expect(layout).toMatch(/title:/); // legal metadata title is set (merges over root)
    for (const slug of PAGES) expect(layout).toContain(`/${slug}`);
  });

  for (const slug of PAGES) {
    it(`${slug} page exists, imports no DB, has a heading + last-updated`, () => {
      const f = `app/(legal)/${slug}/page.tsx`;
      expect(existsSync(p(f)), `${f} exists`).toBe(true);
      const src = read(f);
      expect(src).not.toMatch(/getAppData|@\/lib\/db|@\/lib\/queries/);
      expect(src).toMatch(/<h1/);
      expect(src).toMatch(/Last updated/i);
    });
  }

  it("privacy discloses real processors + honest caveats, not fictional ones", () => {
    const f = "app/(legal)/privacy/page.tsx";
    expect(existsSync(p(f)), `${f} exists`).toBe(true);
    const src = read(f);
    expect(src).toMatch(/Resend/);
    expect(src).toMatch(/Google/);
    expect(src).toMatch(/GitHub/);
    expect(src).toMatch(/bcrypt/i);
    // honest deletion caveat (Risk #5) — assert the SEMANTICS, not just the word "log"
    expect(src).toMatch(/best[- ]effort|persist until|not .*purged by deletion|eligible for deletion/i);
    expect(src).toMatch(/other (people|users)/i); // deleting also removes others' interactions
    expect(src).not.toMatch(/total erasure|erase[sd]? all your data/i); // no over-promise
    // no fictional third parties
    expect(src).not.toMatch(/Google Analytics|Google Fonts|Gravatar|Sentry/);
  });

  it("cookie notice lists the real cookies + the localStorage theme key, no banner", () => {
    const f = "app/(legal)/cookies/page.tsx";
    expect(existsSync(p(f)), `${f} exists`).toBe(true);
    const src = read(f);
    expect(src).toMatch(/authjs\.session-token/);
    expect(src).toMatch(/authjs\.csrf-token/);
    expect(src).toMatch(/localStorage/);
    expect(src).toMatch(/no .*(analytics|tracking|advertising)/i);
  });
});
