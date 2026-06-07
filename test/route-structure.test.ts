import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const p = (...s: string[]) => join(root, ...s);
const read = (...s: string[]) => readFileSync(p(...s), "utf8");

describe("route-group restructure (Architecture B)", () => {
  it("root layout is DB-independent but stays force-dynamic", () => {
    const layout = read("app/layout.tsx");
    // change-driving asserts = the two not.toMatch below; the rest are CSP/theme regression guards
    expect(layout).not.toMatch(/getAppData/);
    expect(layout).not.toMatch(/AppProvider/);
    expect(layout).toMatch(/export const dynamic = "force-dynamic"/);
    expect(layout).toMatch(/ThemeProvider/);
    expect(layout).toMatch(/x-nonce/);
  });

  it("(app) layout owns getAppData + AppProvider", () => {
    const layout = read("app/(app)/layout.tsx");
    expect(layout).toMatch(/getAppData/);
    expect(layout).toMatch(/AppProvider/);
  });

  it("every route whose tree uses useShell/useData lives under (app)", () => {
    for (const f of [
      "app/(app)/page.tsx",
      "app/(app)/discover/page.tsx",
      "app/(app)/journal/page.tsx",
      "app/(app)/profile/page.tsx",
      "app/(app)/settings/page.tsx",
      "app/(app)/login/page.tsx",
      "app/(app)/signup/page.tsx",
      "app/(app)/bean/[id]/page.tsx",
      "app/(app)/roaster/[id]/page.tsx",
      "app/(app)/loading.tsx",
    ]) {
      expect(existsSync(p(f)), `${f} exists`).toBe(true);
    }
    // old locations are gone
    for (const f of ["app/page.tsx", "app/bean", "app/roaster", "app/loading.tsx"]) {
      expect(existsSync(p(f)), `${f} moved`).toBe(false);
    }
  });

  it("DB-independent special files stay at app/ root", () => {
    for (const f of ["app/error.tsx", "app/not-found.tsx", "app/global-error.tsx", "app/globals.css", "app/icon.svg"]) {
      expect(existsSync(p(f)), `${f} at root`).toBe(true);
    }
  });

  it("api routes are NOT inside a route group", () => {
    for (const f of [
      "app/api/health/route.ts",
      "app/api/csp-report/route.ts",
      "app/api/verify/route.ts",
      "app/api/auth/[...nextauth]/route.ts",
    ]) {
      expect(existsSync(p(f)), `${f} unchanged`).toBe(true);
    }
  });
});
