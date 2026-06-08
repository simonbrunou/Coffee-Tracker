import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("a11y global foundations", () => {
  const css = read("app/globals.css");
  it("focus-visible indicator with an outline (button/a/role widgets)", () => {
    expect(css).toMatch(/button:focus-visible[\s\S]*?outline:/);
    expect(css).toMatch(/a:focus-visible/);
    expect(css).toMatch(/\[role="radio"\]:focus-visible/);
  });
  it("honors prefers-reduced-motion", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
  it("defines a skip link", () => {
    expect(css).toMatch(/\.skip-link/);
  });
  it("shell renders the skip link + a clean <main> landmark (R1 restructure)", () => {
    const shell = read("components/app-provider.tsx");
    expect(shell).toMatch(/href="#main-content"/);
    expect(shell).toMatch(/<main id="main-content" tabIndex=\{-1\}/);
    // the scroll container is now a <div>, not <main>
    expect(shell).not.toMatch(/<main ref=\{scrollRef\}/);
  });
  it("uses AA contrast tokens (R4): darker --mocha + a ≥3:1 control border", () => {
    expect(css).toMatch(/--mocha:\s*oklch\(0\.50/);
    expect(css).toMatch(/--control-border:\s*oklch\(0\.6[0-3]/);
    expect(css).toMatch(/--border:\s*var\(--control-border\)/);
    expect(css).toMatch(/--input:\s*var\(--control-border\)/);
  });
});
