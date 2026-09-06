import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

/** Next.js 16: use ESLint CLI (see https://nextjs.org/docs/app/api-reference/config/eslint). */
export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // Stricter in eslint-plugin-react-hooks v6; allow gradual cleanup.
      "react-hooks/purity": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
      // Native dialogs are unstyled, untranslatable and block the thread.
      // Use useConfirm() (components/ui/useConfirm.tsx) and the Toast.
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use useConfirm() from @/components/ui/useConfirm." },
        { name: "alert", message: "Use the Toast (@/components/ui/Toast) or inline status text." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "confirm", message: "Use useConfirm() from @/components/ui/useConfirm." },
        { object: "window", property: "alert", message: "Use the Toast (@/components/ui/Toast) or inline status text." },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
  ]),
]);
