# Dependency holds

`npm outdated` shows these packages behind npm `latest`. They are held on purpose; keep them where they are.

- **eslint stays on 9** until `npm ci` resolves with eslint 10. Today `eslint-plugin-jsx-a11y`, `eslint-plugin-import` and `eslint-plugin-react` (all required by `eslint-config-next`) cap their `eslint` peer range at `^9`, so eslint 10 fails `npm ci` with ERESOLVE. Renovate's eslint 10 PR (#72) records the blocker scan.
- **TypeScript stays on 6** until `npm ci` resolves with TypeScript 7. Today `typescript-eslint` caps its `typescript` peer range below 6.1, so TypeScript 7 fails `npm ci` with ERESOLVE. Renovate's TypeScript 7 PR (#73) records the blocker scan.
- **next-auth stays on the v5 beta** (`next-auth@beta`). npm's `latest` tag is the old v4 line, so a 4.x "upgrade" is a downgrade.

Leave #72 and #73 open: closing a Renovate PR makes Renovate stop proposing that major version.
