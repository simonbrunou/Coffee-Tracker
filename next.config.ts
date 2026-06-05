import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` is a native Node dependency used only in server code (queries + actions);
  // keep it external to the server bundle.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
