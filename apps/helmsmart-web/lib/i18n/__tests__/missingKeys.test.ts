import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { loadNamespace, packageOnlyCommonKey, resolvesIn, type Bundle } from "./bundles";

/**
 * A key that resolves to nothing renders itself.
 *
 * i18next returns the key unchanged on a miss, so `t("invoices.list.title")`
 * against a bundle that has no such key puts the literal string
 * `invoices.list.title` on the screen. Ported from
 * `apps/leadsmartai/lib/i18n/__tests__/missingKeys.test.ts`, where exactly that
 * shipped: a page's tab title read `pages.cma.metaTitle | CloseBoss AI` in BOTH
 * locales, found by a human working through the dashboard rather than by
 * anything in the suite.
 *
 * Nothing else in this directory could have caught it, which is the point of
 * having it. The residual-English scans look for English, and a raw key is not
 * English. The parity checks compare the locale files to each other — and a key
 * absent from both is perfectly consistent. `serverNamespace` proves a call
 * NAMES a namespace, never that the namespace CONTAINS the key.
 *
 * So this walks the other way: from every call site to the bundle, asking only
 * "does this resolve".
 *
 * WHAT IS CHECKED. Literal keys only. A key built at runtime —
 * ``t(`books.status.${row.state}`)``, or one chosen by a ternary — cannot be
 * resolved statically, and guessing would produce noise that gets the whole
 * check ignored. Calls carrying `defaultValue` are also exempt: they render
 * that default on a miss, which is the documented way to ship a key ahead of
 * its translation.
 *
 * English only. The zh-Hans side is covered by the parity check in
 * `navLabels.test.ts`, and repeating it here would report every gap twice.
 *
 * HELMSMART SHAPE. Bundles are `messages/en/<ns>.json`, except `common`, which
 * `lib/i18n/config.ts` builds by overlaying the app's `common.json` on the
 * shared package's. `./bundles` does that overlay once so this guard cannot
 * report `t("actions.save")` — which resolves through the package half — as
 * missing. Cross-namespace calls are written `t("ns:key")` here, so a key
 * carrying a colon is split rather than looked up whole.
 */

/** apps/helmsmart-web */
const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components", "lib"];

/** Namespace assumed when a call names none and the file binds none. */
const DEFAULT_NS = "common";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const cache = new Map<string, Bundle | null>();
function bundle(ns: string): Bundle | null {
  if (!cache.has(ns)) cache.set(ns, loadNamespace("en", ns));
  return cache.get(ns) ?? null;
}

/** Resolve a dotted key, tolerating i18next's plural suffixes. */
function resolves(ns: string, key: string): boolean {
  const b = bundle(ns);
  if (!b) return true; // unknown namespace — not this check's business
  return resolvesIn(b, key);
}

/**
 * The namespaces a file binds for calls that do not name one.
 *
 * A LIST, because `useTranslation(["books", "common"])` is legal — i18next then
 * resolves a key against each in order. Reading only the first string reported
 * healthy components as broken in the source app, which is the second false
 * positive this check produced before anyone relied on it.
 */
function boundNamespaces(src: string): string[] {
  const array = src.match(/(?:useTranslation|getServerT)\(\s*\[([^\]]+)\]/i);
  if (array) {
    return [...array[1].matchAll(/["'`]([a-z0-9_-]+)["'`]/gi)].map((m) => m[1]);
  }
  const single = src.match(/(?:useTranslation|getServerT)\(\s*["'`]([a-z0-9_-]+)["'`]/i);
  return single ? [single[1]] : [];
}

type Miss = { file: string; ns: string; key: string };

/**
 * `t("key")` / `tr("key")` with a literal key.
 *
 * The options object is captured loosely so `{ ns }` and `defaultValue` can be
 * read off it without parsing TypeScript — enough for a literal call on one
 * line, which is every call this check claims to cover. A `:` is part of the
 * key charset because `t("common:status.saving")` is the documented way to
 * reach another namespace from a bound hook.
 */
const CALL = /\b(?:t|tr)\(\s*["'`]([A-Za-z0-9_.:-]+)["'`]\s*(,\s*\{([^}]*)\})?\s*\)/g;

describe("translation keys resolve", () => {
  it("has no call site whose key is missing from its bundle", () => {
    const misses: Miss[] = [];

    for (const dir of SCAN) {
      let files: string[] = [];
      try {
        files = walk(join(ROOT, dir));
      } catch {
        continue;
      }

      for (const file of files) {
        const src = readFileSync(file, "utf8");
        if (!/\b(?:t|tr)\(/.test(src)) continue;

        /*
         * A file that binds no namespace of its own is not choosing one — it
         * RECEIVES `t` as a parameter and renders whatever its caller bound.
         * Assuming "common" for those files reported five healthy keys as
         * broken in the source app, and a check that cries wolf is one nobody
         * reads.
         */
        if (!/useTranslation\(|getServerT\(/.test(src)) continue;

        const fileNs = boundNamespaces(src);

        for (const m of src.matchAll(CALL)) {
          const raw = m[1];
          const opts = m[3] ?? "";

          // Renders the default on a miss — the documented way to ship a key
          // before its translation lands.
          if (/defaultValue\s*:/.test(opts)) continue;

          // "ns:key" names its own namespace and wins over everything else.
          const colon = raw.indexOf(":");
          const prefixed = colon > 0 ? raw.slice(0, colon) : null;
          const key = colon > 0 ? raw.slice(colon + 1) : raw;

          const explicit = opts.match(/ns\s*:\s*["'`]([a-z0-9_-]+)["'`]/i);
          const candidates = prefixed
            ? [prefixed]
            : explicit
              ? [explicit[1]]
              : fileNs.length
                ? fileNs
                : [DEFAULT_NS];

          // A dotted key is copy; a bare word is usually a variable or an
          // unrelated single-letter function, and resolving it would be noise.
          // A `ns:key` call is exempt from that rule — the prefix already
          // proves it is a translation key.
          if (!prefixed && !key.includes(".")) continue;

          // Resolves in ANY bound namespace is resolved — that is what
          // i18next does with a list.
          if (!candidates.some((ns) => resolves(ns, key))) {
            misses.push({
              file: relative(ROOT, file).split(sep).join("/"),
              ns: candidates.join("|"),
              key,
            });
          }
        }
      }
    }

    expect(misses.map((x) => `${x.file}: t("${x.key}") missing from ${x.ns}.json`)).toEqual([]);
  });

  it("resolves a key that only the shared package's common half declares", () => {
    /*
     * The overlay is the whole reason this guard needs `./bundles`. HelmSmart's
     * own `messages/en/common.json` is nearly empty; the generic verbs live in
     * `packages/i18n/locales/en/common.json`, and a guard that read only the
     * app's half would report every `t("common:actions.save")` in the codebase.
     */
    expect(resolves("common", packageOnlyCommonKey("en"))).toBe(true);
    expect(resolves("common", "definitely.not.a.key")).toBe(false);
  });
});
