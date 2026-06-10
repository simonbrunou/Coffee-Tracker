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
    delete process.env.LEGAL_MIN_AGE;
    delete process.env.LEGAL_DB_TLS;
    delete process.env.DATABASE_SSL;
  });
  it("operator/identity facts render an honest marker when unset, and the env value when set", () => {
    expect(legal.entity()).toBe("[to be configured]");
    process.env.LEGAL_ENTITY = "Acme Coffee Ltd";
    expect(legal.entity()).toBe("Acme Coffee Ltd");
    process.env.LEGAL_ENTITY = "   "; // whitespace-only is treated as unset
    expect(legal.entity()).toBe("[to be configured]");
  });
  it("GDPR-first policy fields ship accurate DEFAULTS (no [to be configured]) but stay env-overridable", () => {
    // these describe the app, not the operator, so they're filled out of the box
    expect(legal.minAge()).toBe("16");
    expect(legal.legalBases()).toMatch(/Art\. 6\(1\)\(b\) GDPR/);
    expect(legal.dataTransfer()).toMatch(/EU\/EEA/);
    expect(legal.liability()).toMatch(/'as is'/);
    expect(legal.dsarProcess()).toMatch(/export/i);
    for (const fn of [legal.minAge, legal.legalBases, legal.dataTransfer, legal.liability, legal.dbTls, legal.dsarProcess]) {
      expect(fn()).not.toBe("[to be configured]");
    }
    process.env.LEGAL_MIN_AGE = "13";
    expect(legal.minAge()).toBe("13"); // env still wins
  });
  it("dbTls reflects the REAL DATABASE_SSL posture (never over-claims TLS)", () => {
    // default deploy: TLS off (private network) → must NOT assert encryption
    expect(legal.dbTls()).not.toMatch(/encrypted with TLS/i);
    expect(legal.dbTls()).toMatch(/private network/i);
    process.env.DATABASE_SSL = "require";
    expect(legal.dbTls()).toMatch(/encrypted with TLS/i);
    process.env.LEGAL_DB_TLS = "Custom posture.";
    expect(legal.dbTls()).toBe("Custom posture."); // explicit override wins over the derived value
  });
});
