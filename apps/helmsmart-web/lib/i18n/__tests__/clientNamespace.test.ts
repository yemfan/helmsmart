import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { loadNamespaces, packageOnlyCommonKey, resolvesIn, type Bundle } from "./bundles";

/**
 * A client component that reads a key from the wrong namespace renders the KEY.
 *
 * `useTranslation("home")` binds one namespace for the whole component, and
 * i18next returns the key unchanged when the lookup misses. So a call like
 *
 *     const { t } = useTranslation("home");
 *     …
 *     {t("invoices.list.title")}     // lives in `books`
 *
 * puts the literal text `invoices.list.title` on the screen. Ported from
 * `apps/leadsmartai/lib/i18n/__tests__/clientNamespace.test.ts`, where that
 * shipped on the homepage — a "Meet your AI team" section rendered three raw
 * keys as its headline, in English and in Chinese alike, above six portraits of
 * the team it was failing to introduce.
 *
 * {@link ./serverNamespace.test.ts} is the same failure on the server side, and
 * its reasoning applies here: the residual-English scan looks for English and a
 * raw key is not English, while the locale files agree with each other
 * perfectly — the key is simply somewhere else. Nothing else here can see it.
 *
 * Only the `en` locale is checked. A key that resolves in one locale and not
 * the other is a parity problem, not a namespace one, and belongs to the parity
 * check in `navLabels.test.ts`.
 *
 * HELMSMART SHAPE. Namespaces are the files under `messages/en/`, with `common`
 * resolved through `./bundles` as the overlay `lib/i18n/config.ts` builds — so
 * `t("common:actions.save")` resolves through the shared package's half rather
 * than being reported. The `ns:key` prefix and a `{ ns }` option both name
 * their own namespace and are checked against THAT one; saying which namespace
 * you mean is documented practice, and what still matters is that the key is
 * actually there.
 */

/** apps/helmsmart-web */
const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function resolves(bundles: Record<string, Bundle>, ns: string, key: string): boolean {
  const b = bundles[ns];
  if (b === undefined) return false;
  return resolvesIn(b, key);
}

/**
 * Keys with an interpolation or a template literal are skipped: neither is
 * knowable statically. A key with no dot and no `ns:` prefix is a namespace
 * root or a variable, and is not the shape this check is about.
 */
const T_CALL = /\bt\(\s*"([^"${}]+)"\s*(?:,\s*\{([^}]*)\})?/g;
const NS_OPT = /\bns:\s*"([a-z0-9_-]+)"/;
const HOOK = /useTranslation\(\s*"([a-z0-9_-]+)"/;

function findings(): string[] {
  const bundles = loadNamespaces("en");
  const out: string[] = [];
  for (const root of SCAN) {
    let files: string[] = [];
    try {
      files = walk(join(ROOT, root));
    } catch {
      continue;
    }
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!HOOK.test(src)) continue;
      /*
       * A file can hold several components, each with its own hook — a landing
       * page binds one namespace at the top and another 1000 lines down for its
       * FAQ. So the namespace in force is the nearest one ABOVE the call, not
       * the first in the file.
       */
      const lines = src.split("\n");
      let bound: string | null = null;
      const boundAt: (string | null)[] = [];
      for (const line of lines) {
        const m = line.match(HOOK);
        if (m) bound = m[1];
        boundAt.push(bound);
      }
      for (const m of src.matchAll(T_CALL)) {
        const raw = m[1];
        const line = src.slice(0, m.index ?? 0).split("\n").length;

        const colon = raw.indexOf(":");
        const prefixed = colon > 0 ? raw.slice(0, colon) : null;
        const key = colon > 0 ? raw.slice(colon + 1) : raw;
        // A colon that is not a namespace prefix (a time, a sentence) is not
        // a key at all.
        if (colon > 0 && !/^[a-z0-9_-]+$/.test(prefixed ?? "")) continue;
        if (!prefixed && !key.includes(".")) continue;

        const explicit = m[2]?.match(NS_OPT)?.[1] ?? null;
        // A `defaultValue` renders on a miss — the documented way to ship a
        // key ahead of its translation.
        if (m[2] && /\bdefaultValue\s*:/.test(m[2])) continue;

        const ns = prefixed ?? explicit ?? boundAt[line - 1];
        if (!ns) continue; // call sits above every hook — not a component key
        if (resolves(bundles, ns, key)) continue;
        const rel = relative(ROOT, file).split(sep).join("/");
        out.push(`${rel}:${line}  [${ns}]  ${key}`);
      }
    }
  }
  return out;
}

describe("client namespace", () => {
  it("resolves every key from the namespace its hook binds", () => {
    const hits = findings();
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("resolves a cross-namespace call through the common overlay", () => {
    // `t("common:actions.save")` is the documented way to reach a shared verb
    // from a bound hook, and the verb lives in the PACKAGE's common half. A
    // guard that read only `messages/en/common.json` would report every one.
    const bundles = loadNamespaces("en");
    expect(resolves(bundles, "common", packageOnlyCommonKey("en"))).toBe(true);
    expect(resolves(bundles, "nav", "settingsTabs.general")).toBe(true);
    expect(resolves(bundles, "nav", "settingsTabs.nope")).toBe(false);
  });
});
