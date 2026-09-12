import { defineConfig } from "vitest/config";

/**
 * The shared package's own suite.
 *
 * Until this config existed, `src/utils/__tests__/promptCache.test.ts` ran
 * NOWHERE: the package's only script was `build` (a `tsc --noEmit` typecheck,
 * which compiles the test file but never executes it), and every app's vitest
 * config includes only `lib/**\/*.test.ts` inside that app. Same hole
 * `packages/voice` had, closed the same way.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
