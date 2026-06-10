import jsxA11y from "eslint-plugin-jsx-a11y";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";

// eslint-config-next 16 ships NATIVE flat config (eslint-config-next/core-web-vitals
// is a Linter.Config[]), so it is spread directly — no FlatCompat. It already
// registers the @next/next, react, react-hooks, import, jsx-a11y and
// @typescript-eslint plugins.
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
  ...nextCoreWebVitals,
  // core-web-vitals only ships ~6 jsx-a11y rules at "warn". Re-apply the plugin's
  // FULL recommended set (31 rules at error) so `eslint .` actually gates on a11y.
  // Rules-only (no `plugins` key): the jsx-a11y plugin is already registered by
  // core-web-vitals, so re-registering it would throw "Cannot redefine plugin".
  { rules: jsxA11y.flatConfigs.recommended.rules },
  ...tseslint.configs.recommended,
  // `react-hooks/set-state-in-effect` is new in eslint-plugin-react-hooks 7 (pulled
  // in by eslint-config-next 16). Our flagged call sites are all legitimate or
  // behavior-sensitive: the SSR mount guard (app-provider), the hydration-safe
  // relative-time label (ui), and the loading-flag-then-fetch effects (detail,
  // screens) are correct React; the URL/prop→state mirrors (discover, log-sheet,
  // use-load-more) are pre-existing and a separate refactor. Keep the signal as a
  // warning rather than contorting correct code or expanding the upgrade.
  { rules: { "react-hooks/set-state-in-effect": "warn" } },
);
