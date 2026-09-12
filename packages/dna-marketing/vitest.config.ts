import { defineConfig } from "vitest/config";

/**
 * The marketing DNA module's own suite.
 *
 * Until this config existed, the four files under `src/social/` (Meta and
 * Threads Graph payloads, the social helpers, publish-time planning) ran
 * NOWHERE: the package had no scripts at all, and every app's vitest config
 * includes only `lib/**\/*.test.ts` inside that app, so nothing ever pointed at
 * this package. Same hole `packages/voice` had, closed the same way.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
