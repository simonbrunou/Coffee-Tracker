import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { legal } from "@/lib/legal";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("legal config is env-driven", () => {
  it("no [PLACEHOLDER] strings remain in the legal pages", () => {
    for (const f of ["app/(legal)/privacy/page.tsx", "app/(legal)/terms/page.tsx", "app/(legal)/cookies/page.tsx"]) {
      expect(read(f)).not.toMatch(/\[PLACEHOLDER/);
    }
  });
  it("the legal pages interpolate the env-driven helper", () => {
    const privacy = read("app/(legal)/privacy/page.tsx");
    expect(privacy).toMatch(/legal\.entity\(\)/);
    expect(privacy).toMatch(/legal\.dsarProcess\(\)/);
    expect(read("app/(legal)/terms/page.tsx")).toMatch(/legal\.jurisdiction\(\)/);
  });
});

describe("lib/legal helper", () => {
  afterEach(() => {
    delete process.env.LEGAL_ENTITY;
  });
  it("renders an honest marker when unset, and the env value when set (read per call)", () => {
    expect(legal.entity()).toBe("[to be configured]");
    process.env.LEGAL_ENTITY = "Acme Coffee Ltd";
    expect(legal.entity()).toBe("Acme Coffee Ltd");
    process.env.LEGAL_ENTITY = "   "; // whitespace-only is treated as unset
    expect(legal.entity()).toBe("[to be configured]");
  });
});
