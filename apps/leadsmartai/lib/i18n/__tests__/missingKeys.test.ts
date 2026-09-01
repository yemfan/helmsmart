import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A key that resolves to nothing renders itself.
 *
 * i18next returns the key unchanged on a miss, so `t("pages.cma.metaTitle")`
 * against a bundle that has no such key puts the literal string
 * `pages.cma.metaTitle` on the screen. That exact one shipped: the CMA tab
 * title read `pages.cma.metaTitle | CloseBoss AI` in BOTH locales, found by a
 * human working through the dashboard rather than by anything here.
 *
 * Nothing in this directory could have caught it, which is the point of adding
 * it. The residual-English scans look for English, and a raw key is not
 * English. The parity checks compare the locale files to each other — and a key
 * absent from both is perfectly consistent. `serverNamespace` proves a call
 * NAMES a namespace, never that the namespace CONTAINS the key.
 *
 * So this walks the other way: from every call site to the bundle, asking only
 * "does this resolve".
 *
 * WHAT IS CHECKED. Literal keys only. A key built at runtime —
 * `t(\`plans.blurb.${tier.id}\`)`, or one chosen by a ternary — cannot be
 * resolved statically, and guessing would produce noise that gets the whole
 * check ignored. Calls carrying `defaultValue` are also exempt: they render
 * that default on a miss, which is the documented way to ship a key ahead of
 * its translation.
 *
 * English only. The zh-Hans side is already covered by the parity checks, and
 * repeating it here would report every gap twice.
 */

const ROOT = join(__dirname, "..", "..", "..");
const LOCALES = join(ROOT, "..", "..", "packages", "i18n", "locales", "en");
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

function loadBundle(ns: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(join(LOCALES, `${ns}.json`), "utf8"));
  } catch {
    return null;
  }
}

const bundles = new Map<string, Record<string, unknown> | null>();
function bundle(ns: string) {
  if (!bundles.has(ns)) bundles.set(ns, loadBundle(ns));
  return bundles.get(ns) ?? null;
}

/** Resolve a dotted key, tolerating i18next's plural suffixes. */
function resolves(ns: string, key: string): boolean {
  const b = bundle(ns);
  if (!b) return true; // unknown namespace — not this check's business

  const get = (k: string): unknown =>
    k.split(".").reduce<unknown>(
      (acc, seg) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[seg] : undefined,
      b,
    );

  if (get(key) !== undefined) return true;
  // t("x", { count }) resolves to x_one / x_other, and the bare key is absent
  // BY DESIGN — treating that as missing would punish correct pluralisation.
  return ["_one", "_other", "_zero", "_two", "_few", "_many"].some(
    (suffix) => get(`${key}${suffix}`) !== undefined,
  );
}

/**
 * The namespaces a file binds for calls that do not name one.
 *
 * A LIST, because `useTranslation(["dashboard", "dashboard_nav"])` is legal and
 * used here — i18next then resolves a key against each in order. Reading only
 * the first string reported ActionsHub and LanguagePanel as broken when both
 * resolve fine, which is the second false positive this check produced before
 * anyone relied on it.
 */
function boundNamespaces(src: string): string[] {
  const array = src.match(/(?:useTranslation|getServerT)\(\s*\[([^\]]+)\]/i);
  if (array) {
    return [...array[1].matchAll(/["'`]([a-z0-9_]+)["'`]/gi)].map((m) => m[1]);
  }
  const single = src.match(/(?:useTranslation|getServerT)\(\s*["'`]([a-z0-9_]+)["'`]/i);
  return single ? [single[1]] : [];
}

type Miss = { file: string; ns: string; key: string };

/**
 * `t("key")` / `tr("key")` with a literal key.
 *
 * The options object is captured loosely so `{ ns }` and `defaultValue` can be
 * read off it without parsing TypeScript — enough for a literal call on one
 * line, which is every call this check claims to cover.
 */
const CALL = /\b(?:t|tr)\(\s*["'`]([A-Za-z0-9_.]+)["'`]\s*(,\s*\{([^}]*)\})?\s*\)/g;

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

        // A file that binds no namespace of its own is not choosing one — it
        // RECEIVES `t` as a parameter and renders whatever its caller bound.
        // `lib/closeboss/transactionHealthText.ts` is the case that proved it:
        // it takes a `Translate`, and both call sites pass a `t` bound to
        // dashboard, so its keys resolve fine. Assuming "common" for those
        // files reported five healthy keys as broken, and a check that cries
        // wolf is one nobody reads.
        if (!/useTranslation\(|getServerT\(/.test(src)) continue;

        const fileNs = boundNamespaces(src);

        for (const m of src.matchAll(CALL)) {
          const key = m[1];
          const opts = m[3] ?? "";

          // Renders the default on a miss — the documented way to ship a key
          // before its translation lands.
          if (/defaultValue\s*:/.test(opts)) continue;

          const explicit = opts.match(/ns\s*:\s*["'`]([a-z0-9_]+)["'`]/i);
          const candidates = explicit
            ? [explicit[1]]
            : fileNs.length
              ? fileNs
              : [DEFAULT_NS];

          // A dotted key is copy; a bare word is usually a variable or an
          // unrelated single-letter function, and resolving it would be noise.
          if (!key.includes(".")) continue;

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

    expect(
      misses.map((x) => `${x.file}: t("${x.key}") missing from ${x.ns}.json`),
    ).toEqual([]);
  });
});
