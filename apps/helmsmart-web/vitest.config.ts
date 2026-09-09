import path from "node:path";
import { defineConfig } from "vitest/config";

const I18N = path.resolve(__dirname, "..", "..", "packages", "i18n");

export default defineConfig({
  resolve: {
    alias: [
      /*
       * Pin @leadsmart/i18n to THIS tree.
       *
       * A git worktree has no node_modules of its own, so Node walks up and
       * resolves the workspace link out of the parent checkout — and the i18n
       * guard tests then grade whatever that checkout happens to have on
       * disk, including another branch's unsaved work. In CI and in a normal
       * checkout the link already points here, so this resolves to the same
       * files it always did. Same rule as apps/leadsmartai/vitest.config.ts.
       */
      {
        find: /^@leadsmart\/i18n\/locale\/(en|zh-Hans)\/(.+)$/,
        replacement: path.join(I18N, "locales", "$1", "$2.json"),
      },
      { find: /^@leadsmart\/i18n\/next\/(.+)$/, replacement: path.join(I18N, "src", "next", "$1") },
      { find: /^@leadsmart\/i18n$/, replacement: path.join(I18N, "src", "index.ts") },
      { find: "@", replacement: path.resolve(__dirname, ".") },
    ],
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
