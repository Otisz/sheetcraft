import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Standalone config: the app's vite.config.ts loads the TanStack Start plugin,
 * which is not needed — and not wanted — under the test runner.
 *
 * The `@/*` alias must stay in step with `package.json#imports`; a drift there
 * produces confusing resolution failures. See docs/adr/0002-testing-approach.md.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
