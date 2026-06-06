import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default tseslint.config(
  // Global ignores MUST be a standalone object (flat config; .eslintignore is dead).
  // The vendored trees (.agents ~197 files, .claude, .playwright-mcp) must be excluded
  // or `eslint .` would crawl thousands of non-app files.
  {
    ignores: [
      ".agents/**",
      ".claude/**",
      ".playwright-mcp/**",
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "docs/**",
      "next-env.d.ts",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  ...tseslint.configs.recommended,
);
