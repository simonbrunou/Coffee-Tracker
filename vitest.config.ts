import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths()], // resolves the @/* alias from tsconfig.json
  test: { environment: "node", include: ["test/**/*.test.ts"] },
  resolve: {
    alias: { "server-only": path.resolve(__dirname, "test/stubs/server-only.ts") },
  },
});
