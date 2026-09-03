import path from "node:path";
import { defineConfig } from "vitest/config";

const PACKAGES = path.resolve(__dirname, "..", "..", "packages");
const I18N = path.join(PACKAGES, "i18n");

/**
 * Workspace packages laid out as `src/<subpath>.ts`, pinned to THIS tree for
 * the same reason as `@leadsmart/i18n` below.
 *
 * The symlink in node_modules is an ABSOLUTE path into the parent checkout, so
 * every worktree resolves these out of whatever branch that checkout happens to
 * be sitting on. Adding `./noCompsMessage` to @repo/valuation's exports map and
 * running its test from a worktree failed with `Missing "./noCompsMessage"
 * specifier` — green in CI, red locally — because the export existed here and
 * the package.json being read was over there.
 *
 * `@repo/ui` is deliberately absent: it exports `./navigation/index.ts`, not a
 * `src/` path, so this rule would point it at a file that does not exist. Add a
 * package here only after checking its exports map really is `src/`-shaped.
 */
const SRC_PACKAGES = ["valuation", "voice", "growth"];

const srcPackageAliases = SRC_PACKAGES.flatMap((name) => {
  const root = path.join(PACKAGES, name);
  return [
    // Subpath first — a bare-name rule would otherwise never be reached.
    {
      find: new RegExp(`^@repo/${name}/(.+)$`),
      replacement: path.join(root, "src", "$1.ts"),
    },
    {
      find: new RegExp(`^@repo/${name}$`),
      replacement: path.join(root, "src", "index.ts"),
    },
  ];
});

export default defineConfig({
  resolve: {
    alias: [
      ...srcPackageAliases,
      /*
       * Pin @leadsmart/i18n to THIS tree's locale files.
       *
       * A git worktree has no node_modules of its own, so Node walks up and
       * resolves the workspace link out of the parent checkout — and the
       * locale assertions below then grade whatever that checkout happens to
       * have on disk, including another branch's unsaved work. It failed and
       * passed three times in one afternoon without a line of this branch
       * changing. A test that reads its own repo is the only one whose result
       * means anything.
       *
       * In CI and in a normal checkout the link already points here, so this
       * resolves to the same files it always did.
       */
      {
        find: /^@leadsmart\/i18n\/locale\/(en|zh-Hans)\/(.+)$/,
        replacement: path.join(I18N, "locales", "$1", "$2.json"),
      },
      {
        find: /^@leadsmart\/i18n\/locales\/(.+)$/,
        replacement: path.join(I18N, "locales", "$1"),
      },
      { find: /^@leadsmart\/i18n$/, replacement: path.join(I18N, "src", "index.ts") },
      { find: "@", replacement: path.resolve(__dirname, ".") },
    ],
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
