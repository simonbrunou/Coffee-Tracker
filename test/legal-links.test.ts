import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...s: string[]) => readFileSync(join(process.cwd(), ...s), "utf8");

describe("legal links are discoverable", () => {
  it("signup form links to terms and privacy", () => {
    const src = read("app/(app)/signup/signup-form.tsx");
    expect(src).toMatch(/href="\/terms"/);
    expect(src).toMatch(/href="\/privacy"/);
  });

  it("settings links to privacy, terms and cookies", () => {
    const src = read("components/settings.tsx");
    expect(src).toMatch(/href="\/privacy"/);
    expect(src).toMatch(/href="\/terms"/);
    expect(src).toMatch(/href="\/cookies"/);
  });
});
