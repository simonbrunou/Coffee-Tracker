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
      "scripts/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
  // M5·B: jsx-a11y registers the plugin via next/core-web-vitals already, so extend
  // the EXISTING plugin's recommended set (error-severity → `eslint .` actually gates)
  // rather than re-registering it (which throws "Cannot redefine plugin").
  ...compat.extends("plugin:jsx-a11y/recommended"),
  ...tseslint.configs.recommended,
);
