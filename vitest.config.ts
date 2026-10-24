import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(__dirname, "./src"),
  "@server": path.resolve(__dirname, "./server"),
};

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "web",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "server",
          environment: "node",
          setupFiles: ["./server/test/setupEnv.ts"],
          include: ["server/**/*.test.ts"],
          testTimeout: 60000,
          hookTimeout: 120000,
          // Each file starts its own in-memory MongoDB; run files one at a time to keep memory sane.
          fileParallelism: false,
        },
      },
    ],
  },
});
