import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server at `.next/standalone` (minimal traced node_modules
  // + server.js). Railpack ships only this for the runtime image — small image,
  // fast cold start. NB: `.next/static` and `public/` are NOT bundled by Next and
  // must be copied alongside server.js (handled in railpack.json's build step).
  output: "standalone",
  // `pg` is a native Node dependency used only in server code (queries + actions);
  // keep it external to the server bundle.
  serverExternalPackages: ["pg"],
  // Lint runs as its own CI step (`npm run lint`, flat config via FlatCompat) and
  // locally — so the redundant `next build` lint pass only slows the build and
  // emits a spurious "Next.js plugin was not detected" warning (a flat-config
  // detection quirk; the plugin IS active via next/core-web-vitals). Skip it here;
  // `eslint .` remains the gate.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
