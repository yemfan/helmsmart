import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

/** Next.js 16: use ESLint CLI (see https://nextjs.org/docs/app/api-reference/config/eslint). */
export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    // Original design prototypes kept for reference — not part of the app source.
    "files/**",
    "Design/**",
  ]),
]);
