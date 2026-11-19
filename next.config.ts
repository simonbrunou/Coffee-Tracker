import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server at `.next/standalone` (minimal traced node_modules
  // + server.js). The Dockerfile's runtime stage ships only this: small image,
  // fast cold start. NB: `.next/static` and `public/` are NOT bundled by Next and
  // must be copied alongside server.js (scripts/postbuild-standalone.mjs does it).
  output: "standalone",
  // `pg` is a native Node dependency used only in server code (queries + actions);
  // keep it external to the server bundle.
  serverExternalPackages: ["pg"],
  // Next 16 dropped the build-time lint pass entirely (and removed the `eslint`
  // config option), so no opt-out is needed here. `npm run lint` (native flat
  // config) runs as its own CI step and locally — that remains the gate.
};

export default nextConfig;
