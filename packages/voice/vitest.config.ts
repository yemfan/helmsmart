import { defineConfig } from "vitest/config";

/**
 * The shared voice core's own suite.
 *
 * Until this config existed, `src/__tests__/appointmentTypes.test.ts` ran
 * NOWHERE: both apps' vitest configs include only `lib/**\/*.test.ts` inside the
 * app, so nothing ever pointed at this package. Code every app depends on was
 * the only code with no gate on it.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
