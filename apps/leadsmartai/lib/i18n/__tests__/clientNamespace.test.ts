import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A client component that reads a key from the wrong namespace renders the KEY.
 *
 * `useTranslation("web_landing")` binds one namespace for the whole component,
 * and i18next returns the key unchanged when the lookup misses. So a call like
 *
 *     const { t } = useTranslation("web_landing");
 *     …
 *     {t("pages.landing.sixSpecialists")}     // lives in `dashboard`
 *
 * puts the literal text `pages.landing.sixSpecialists` on the screen. That
 * shipped on the homepage — the "Meet your AI team" section rendered three raw
 * keys as its headline, in English and in Chinese alike, above six portraits of
 * the team it was failing to introduce.
 *
 * {@link ./serverNamespace.test.ts} is the same failure on the server side, and
 * its reasoning applies here: the residual-English scan looks for English and a
 * raw key is not English, while the locale files agree with each other
 * perfectly — the key is simply somewhere else. Nothing else here can see it.
 *
 * Only the `en` locale is checked. A key that resolves in one locale and not
 * the other is a parity problem, not a namespace one, and belongs to the checks
 * that compare locale files.
 *
 * The `dashboard` namespace is not special-cased. `pages.*` keys living there
 * is a convention, not a rule, and several `web_*` namespaces carry their own
 * copy — what matters is only that the key is findable from where the hook is
 * bound.
 */

const ROOT = join(__dirname, "..", "..", "..");
const LOCALES = join(ROOT, "..", "..", "packages", "i18n", "locales", "en");
const SCAN = ["app", "components"];

type Bundle = Record<string, unknown>;

function loadNamespaces(): Record<string, Bundle> {
  const out: Record<string, Bundle> = {};
  for (const f of readdirSync(LOCALES)) {
    if (f.endsWith(".json")) {
      out[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(LOCALES, f), "utf8")) as Bundle;
    }
  }
  return out;
}

/**
 * i18next stores a countable string under suffixed siblings — `comps_one`,
 * `comps_other` — and picks between them at render from the `count` option. So
 * `t("pages.cma.comps", { count })` is correct even though `pages.cma.comps`
 * does not itself exist. 35 findings in the first run of this check were that
 * shape, all of them working code.
 */
const PLURAL_SUFFIXES = ["_one", "_other", "_zero", "_two", "_few", "_many", "_plural"];

function lookup(bundles: Record<string, Bundle>, ns: string, key: string): boolean {
  let cur: unknown = bundles[ns];
  if (cur === undefined) return false;
  for (const part of key.split(".")) {
    if (cur !== null && typeof cur === "object" && part in (cur as Bundle)) {
      cur = (cur as Bundle)[part];
    } else {
      return false;
    }
  }
  return true;
}

function resolves(bundles: Record<string, Bundle>, ns: string, key: string): boolean {
  return (
    lookup(bundles, ns, key) || PLURAL_SUFFIXES.some((s) => lookup(bundles, ns, key + s))
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * Keys with an interpolation, a template literal, or an explicit `ns:` prefix
 * are skipped: the first two are not knowable statically, and the third says
 * outright which namespace it means. A key with no dot is a namespace root and
 * is not the shape this check is about.
 */
const T_CALL = /\bt\(\s*"([^"${}:]+\.[^"${}:]+)"/g;
const HOOK = /useTranslation\(\s*"([a-z_]+)"/;

function findingsByFile(): Map<string, string[]> {
  const bundles = loadNamespaces();
  const byFile = new Map<string, string[]>();
  for (const root of SCAN) {
    for (const file of walk(join(ROOT, root))) {
      const src = readFileSync(file, "utf8");
      if (!HOOK.test(src)) continue;
      /*
       * A file can hold several components, each with its own hook — the
       * landing page binds `web_landing` at the top and used to bind
       * `dashboard` again 1000 lines down for its FAQ. So the namespace in
       * force is the nearest one ABOVE the call, not the first in the file.
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
        const line = src.slice(0, m.index ?? 0).split("\n").length;
        const ns = boundAt[line - 1];
        if (!ns) continue; // call sits above every hook — not a component key
        if (resolves(bundles, ns, m[1])) continue;
        const rel = relative(ROOT, file).split(sep).join("/");
        const hits = byFile.get(rel) ?? [];
        hits.push(`${rel}:${line}  [${ns}]  ${m[1]}`);
        byFile.set(rel, hits);
      }
    }
  }
  return byFile;
}

describe("client namespace", () => {
  it("resolves every key from the namespace its hook binds", () => {
    const findings = [...findingsByFile().values()].flat();
    expect(findings, findings.join("\n")).toEqual([]);
  });
});
