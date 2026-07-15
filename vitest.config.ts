import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // @ts-expect-error Vitest supports environmentMatchGlobs at runtime in this workspace.
    environmentMatchGlobs: [
      ["tests/contract-line-item-router.test.ts", "node"],
      ["tests/health-route.test.ts", "node"],
      ["tests/invitation-router.test.ts", "node"],
      ["tests/logger.test.ts", "node"],
      ["tests/operations-routers.test.ts", "node"],
      ["tests/organisation-details-router.test.ts", "node"],
      ["tests/tradebook-import-router.test.ts", "node"],
      ["tests/trpc-setup.test.ts", "node"],
      ["tests/tradebook-parser.test.ts", "node"],
      ["tests/tradebook-mapping.test.ts", "node"],
      ["tests/tradebook-validation.test.ts", "node"],
      ["tests/tradebook-persistence.test.ts", "node"],
      ["tests/tradebook-sample-flow.test.ts", "node"],
      ["tests/tradebook-export.test.ts", "node"],
      ["tests/tradebook-events.test.ts", "node"],
      ["tests/tradebook-export-route.test.ts", "node"],
    ],
    globals: true,
    include: ["**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
      "server-only": new URL("./tests/support/server-only.ts", import.meta.url)
        .pathname,
    },
  },
});
