import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { loadNamespace, packageOnlyCommonKey, resolvesIn } from "./bundles";

/**
 * A server page that forgets the namespace renders the KEY.
 *
 * `getServerT()` with no argument binds the `common` namespace, and the
 * translator returns the key unchanged when the lookup misses everywhere. So
 * `t("invoices.list.title")` in a server component that forgot to say
 * `getServerT("books")` puts the literal text `invoices.list.title` on the
 * screen.
 *
 * Ported from `apps/leadsmartai/lib/i18n/__tests__/serverNamespace.test.ts`,
 * where it shipped on 11 server files — including a data-deletion status page,
 * which exists so that someone chasing down their own data sees a sensible
 * message rather than a 404, and was instead showing them a key.
 *
 * No other check here could catch it. The residual-English scan looks for
 * English, and a raw key is not English; the parity checks compare the locale
 * files to each other and never look at a call site. It is the failure mode
 * that looks *most* like success from the outside — the page is fully wired
 * for translation, and renders neither language.
 *
 * THE HELMSMART FORM OF THE RULE. The source app could name one namespace
 * (`dashboard`) that every page key lived in, and assert `{ ns: "dashboard" }`
 * on each call. HelmSmart has no such namespace: `lib/i18n/config.ts` gives
 * each surface its own (`books`, `clients`, `voice`, …), and the documented
 * shape is to bind it ONCE at the translator:
 *
 *     const t = await getServerT("books");
 *
 * So the generalised rule is: a bare `getServerT()` is only correct for a file
 * whose keys are genuinely in `common`. Every literal `t("…")` in a file that
 * binds nothing, and whose key `common` does not contain, is a finding.
 *
 * Client components are exempt: `useTranslation("books")` binds the namespace
 * at the hook.
 *
 * So is the bound server form, for the same reason — and it is the better of
 * the two, because a per-call `{ ns }` sweep silently misses calls whose key is
 * not a literal on the same line: a multi-line call, or one that picks its key
 * with a ternary. A file only earns the exemption if EVERY `getServerT(` in it
 * passes a namespace; mixing the bound and unbound forms leaves the bare calls
 * ambiguous, so those are still reported.
 */

/** apps/helmsmart-web */
const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components", "lib"];

const COMMON = loadNamespace("en", "common");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** End index of the object literal opening at `open`, or -1 if unterminated. */
function objectEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/** `t("key")` or `tr("key")` — the literal form, the only one resolvable here. */
const T_CALL = /(?<![\w.])tr?\(\s*"([A-Za-z0-9_.:-]+)"/g;

describe("server translator namespace", () => {
  it("binds a namespace on every server file whose keys are not in common", () => {
    const findings: string[] = [];

    for (const root of SCAN) {
      let files: string[] = [];
      try {
        files = walk(join(ROOT, root));
      } catch {
        continue;
      }

      for (const file of files) {
        const src = readFileSync(file, "utf8");
        if (/^\s*["']use client["'];/m.test(src)) continue;
        if (!/getServerT/.test(src)) continue;
        // The factory's own definition, not a call site.
        if (relative(ROOT, file).split(sep).join("/") === "lib/i18n/server.ts") continue;

        // Namespace bound at the translator instead of at each call site.
        const bindings = [...src.matchAll(/getServerT\(\s*("?)([^)]*?)\1\s*\)/g)];
        if (bindings.length > 0 && bindings.every((b) => b[2].trim() !== "")) {
          continue;
        }

        for (const m of src.matchAll(T_CALL)) {
          const raw = m[1];
          const after = (m.index ?? 0) + m[0].length;

          // `t("common:actions.save")` names its namespace in the key itself.
          if (raw.includes(":")) continue;

          // A per-call `{ ns: "books" }` is the other way to say it.
          const rest = src.slice(after);
          const gap = rest.match(/^\s*/)?.[0].length ?? 0;
          if (rest[gap] === ",") {
            const brace = rest.indexOf("{", gap);
            const end = brace < 0 ? -1 : objectEnd(rest, brace);
            const opts = end >= 0 ? rest.slice(brace, end + 1) : "";
            // `defaultValue` renders copy the caller holds, so a miss is not
            // a raw key on the screen — the same exemption `missingKeys` makes.
            if (/\bns\s*:/.test(opts) || /\bdefaultValue\s*:/.test(opts)) continue;
          }

          // A bare word is a variable or an unrelated one-letter function.
          if (!raw.includes(".")) continue;
          // Genuinely a `common` key — a bare getServerT() is right for it.
          if (resolvesIn(COMMON, raw)) continue;

          const line = src.slice(0, after).split("\n").length;
          const rel = relative(ROOT, file).split(sep).join("/");
          findings.push(`${rel}:${line}  ${raw}`);
        }
      }
    }

    expect(
      findings,
      `\nServer t() from an unbound getServerT(), with a key that is not in common — these render the key, not the copy:\n${findings.join("\n")}\n`,
    ).toEqual([]);
  });

  it("knows what a common key looks like", () => {
    // The rule is only as good as this lookup: if `common` failed to load, every
    // file would be reported and the failure would read like an app problem.
    expect(COMMON).not.toBeNull();
    expect(resolvesIn(COMMON, packageOnlyCommonKey("en"))).toBe(true);
    expect(resolvesIn(COMMON, "invoices.list.title")).toBe(false);
  });
});
