import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { routeGroupFor } from "../routeGroups";

/**
 * A client component can only read what its route group downloaded.
 *
 * The client locale bundle is split in two — `bundles/<locale>.app.ts` for the
 * signed-in routes, `.web.ts` for the public ones — because loading every
 * namespace meant 904 KB of translations on each page to use about half. The
 * public bundle also maps `dashboard` to a TRIMMED slice of that namespace
 * (80 KB of 364 KB), under the same name, so no component has to know which
 * group renders it.
 *
 * Both of those are only safe while each group carries every KEY its own
 * components read — not merely the namespace those keys live in. The first
 * version of this check tested namespace presence alone and passed while the
 * logo tagline rendered `pages.brandLogo.tagline` on every public page,
 * because the namespace was there and the key was not. So it resolves keys.
 *
 * "Reach" is a property of the import graph, not of the folder a file sits in:
 * `components/dashboard/TopBar.tsx` renders on `/plans`. Hence the walk from
 * every route entry point.
 *
 * Only literal keys are checked, and only client components. A key built at
 * runtime cannot be resolved statically, and `getServerT` translates through
 * `lib/i18n/translator.ts`, which holds the full map and never sees the split.
 */
const APP_DIR = join(__dirname, "..", "..", "..");
const LOCALES = join(APP_DIR, "..", "..", "packages", "i18n", "locales", "en");

const ENTRY = new Set([
  "page.tsx",
  "layout.tsx",
  "error.tsx",
  "not-found.tsx",
  "loading.tsx",
  "template.tsx",
]);

type Bundle = Record<string, unknown>;

/**
 * The namespaces a group serves, mapped to the JSON it actually serves for
 * them — which for `dashboard` on the public side is the trimmed file.
 */
function bundlesOf(group: "app" | "web"): Record<string, Bundle> {
  const src = readFileSync(join(APP_DIR, "lib", "i18n", "bundles", `en.${group}.ts`), "utf8");
  const fileOfVar = new Map<string, string>();
  for (const m of src.matchAll(/import (\w+) from "@leadsmart\/i18n\/locale\/en\/(\w+)"/g)) {
    fileOfVar.set(m[1], m[2]);
  }
  const out: Record<string, Bundle> = {};
  for (const m of src.matchAll(/^ {2}(\w+): (\w+),$/gm)) {
    const file = fileOfVar.get(m[2]);
    if (!file) continue;
    out[m[1]] = JSON.parse(readFileSync(join(LOCALES, `${file}.json`), "utf8")) as Bundle;
  }
  return out;
}

const PLURALS = ["_one", "_other", "_zero", "_two", "_few", "_many", "_plural"];

function lookup(bundle: Bundle | undefined, key: string): boolean {
  if (!bundle) return false;
  let cur: unknown = bundle;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Bundle)) cur = (cur as Bundle)[part];
    else return false;
  }
  return true;
}

function resolves(bundles: Record<string, Bundle>, ns: string, key: string): boolean {
  const b = bundles[ns];
  if (!b) return false;
  return lookup(b, key) || PLURALS.some((s) => lookup(b, key + s));
}

const sources = new Map<string, string>();
function read(file: string): string {
  let s = sources.get(file);
  if (s === undefined) {
    s = existsSync(file) ? readFileSync(file, "utf8") : "";
    sources.set(file, s);
  }
  return s;
}

function resolveImport(spec: string, importer: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(APP_DIR, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(importer), spec);
  else return null; // a package, not our source
  for (const c of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

const IMPORT = /(?:from|import)\s+["']([^"']+)["']/g;

function reachableFrom(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const m of read(cur).matchAll(IMPORT)) {
      const next = resolveImport(m[1], cur);
      if (next && !seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

function walkRoutes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__" && name !== "api") walkRoutes(p, out);
    } else if (ENTRY.has(name)) out.push(p);
  }
  return out;
}

/** URL path for a route file, ignoring route groups like `(marketing)`. */
function pathnameOf(file: string): string {
  const rel = relative(join(APP_DIR, "app"), dirname(file)).split(sep).join("/");
  const segments = rel.split("/").filter((s) => s && !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

const HOOK = /useTranslation\(\s*(\[[^\]]*\]|"[a-z0-9_]+")/;
/** `t("a.b")` / `tr("a.b")`, with the options object if it is on the same line. */
const CALL = /\b(?:t|tr)\(\s*"([^"${}:]+\.[^"${}:]+)"\s*(?:,\s*\{([^}]*)\})?/g;
const NS_OPT = /\bns:\s*"([a-z0-9_]+)"/;

describe("route groups carry what their client components read", () => {
  const bundles = { app: bundlesOf("app"), web: bundlesOf("web") };

  it("has no client component whose key is absent from its group's bundle", () => {
    const misses: string[] = [];

    for (const entry of walkRoutes(join(APP_DIR, "app"))) {
      const group = routeGroupFor(pathnameOf(entry));
      const carried = bundles[group];

      for (const mod of reachableFrom(entry)) {
        const src = read(mod);
        if (!HOOK.test(src)) continue; // server-rendered copy is unaffected

        // The namespace in force is the nearest hook ABOVE the call — one file
        // can hold several components with different bindings.
        const lines = src.split("\n");
        let bound: string[] | null = null;
        const boundAt: (string[] | null)[] = [];
        for (const line of lines) {
          const m = line.match(HOOK);
          if (m) bound = [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]);
          boundAt.push(bound);
        }

        for (const m of src.matchAll(CALL)) {
          const line = src.slice(0, m.index ?? 0).split("\n").length;
          const explicit = m[2]?.match(NS_OPT)?.[1] ?? null;
          const candidates = explicit ? [explicit] : boundAt[line - 1];
          if (!candidates?.length) continue;
          // Unknown namespaces (a package's own) are not this check's business.
          if (!candidates.some((ns) => bundles.app[ns] || bundles.web[ns])) continue;
          if (candidates.some((ns) => resolves(carried, ns, m[1]))) continue;
          const rel = relative(APP_DIR, mod).split(sep).join("/");
          const line1 = `${rel}:${line} [${candidates.join("|")}] ${m[1]} — the ${group} bundle does not have it`;
          if (!misses.includes(line1)) misses.push(line1);
        }
      }
    }

    expect(misses).toEqual([]);
  });

  it("serves the trimmed dashboard to the public group and the full one to the server", () => {
    const trimmed = bundles.web.dashboard as { pages?: Bundle };
    const full = bundles.app.dashboard as { pages?: Bundle };
    expect(Object.keys(trimmed.pages ?? {}).length).toBeGreaterThan(0);
    expect(Object.keys(full.pages ?? {}).length).toBeGreaterThan(
      Object.keys(trimmed.pages ?? {}).length,
    );
    // every trimmed subtree must be the same copy the full namespace holds,
    // or the public site drifts away from the dashboard one edit at a time
    for (const [key, value] of Object.entries(trimmed.pages ?? {})) {
      expect(JSON.stringify(value), `pages.${key} has drifted from dashboard.json`).toEqual(
        JSON.stringify((full.pages ?? {})[key]),
      );
    }
    // the composed server map must take the FULL namespace, not the slice
    const composed = readFileSync(join(APP_DIR, "lib", "i18n", "bundles", "en.ts"), "utf8");
    expect(composed.indexOf("...web")).toBeLessThan(composed.indexOf("...app"));
  });

  it("routes the two halves of the app to different bundles", () => {
    expect(routeGroupFor("/dashboard")).toBe("app");
    expect(routeGroupFor("/dashboard/contacts")).toBe("app");
    expect(routeGroupFor("/admin/jobs")).toBe("app");
    expect(routeGroupFor("/plans")).toBe("web");
    expect(routeGroupFor("/")).toBe("web");
    expect(routeGroupFor("/cap-rate-calculator")).toBe("web");
    // a path that merely starts with the same letters is not the dashboard
    expect(routeGroupFor("/dashboards-are-great")).toBe("web");
    expect(routeGroupFor(null)).toBe("web");
  });
});
