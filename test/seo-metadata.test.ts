import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("root metadata", () => {
  it("sets metadataBase from the public base url and keeps the viewport export", () => {
    const src = read("app/layout.tsx");
    expect(src).toMatch(/metadataBase/);
    expect(src).toMatch(/getPublicBaseUrl/);
    expect(src).toMatch(/export const viewport/); // R9: not clobbered
  });
});
