import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        plugins: [tsconfigPaths()],
        resolve: {
          alias: { "server-only": path.resolve(__dirname, "test/stubs/server-only.ts") },
        },
        test: {
          name: "unit",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["test/integration/**"],
        },
      },
      {
        plugins: [tsconfigPaths()],
        resolve: {
          alias: { "server-only": path.resolve(__dirname, "test/stubs/server-only.ts") },
        },
        test: {
          name: "integration",
          environment: "node",
          include: ["test/integration/**/*.test.ts"],
          fileParallelism: false,
          setupFiles: ["test/integration/setup.ts"],
        },
      },
    ],
  },
});
