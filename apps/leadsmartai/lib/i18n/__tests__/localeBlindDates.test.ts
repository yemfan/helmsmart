import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A date rendered through the wrong locale is the quietest way to half-undo a
 * translation: the labels are Chinese, the dates are "Mar 3, 2026", and nothing
 * looks wrong in source. It has slipped through four separate times, in three
 * different disguises:
 *
 *   toLocaleDateString("en-US")   — hardcoded; at least greppable
 *   toLocaleDateString(undefined) — follows the BROWSER, not the app
 *   toLocaleDateString()          — follows the SERVER in a server component
 *
 * plus `function f(iso, locale = "en-US")`, where every call site that omits
 * the argument silently stays English while looking correct.
 *
 * So: if a file is internationalised, its dates must be too. Pass the locale
 * from `intlLocale(i18n.language)` (client) or `intlLocale(await
 * getServerLocale())` (server).
 */

const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["app", "components"];

/** Ambiguous on purpose: Number.toLocaleString formats integers identically in
 *  en-US and zh-CN, so only Date-valued calls are worth failing over. */
const OFFENDERS = [
  /toLocale(?:Date|Time)String\(\s*(?:\)|undefined|"en-US"|'en-US')/,
  /new Date\([^)]*\)\.toLocaleString\(\s*(?:\)|undefined|"en-US"|'en-US')/,
  /Intl\.DateTimeFormat\(\s*(?:"en-US"|'en-US')/,
  /locale\s*=\s*(?:"en-US"|'en-US')/, // a default that silently wins
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if (p.endsWith(".tsx") || p.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

/** Strip comments so an explanatory note mentioning "en-US" isn't a finding. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("locale-blind dates", () => {
  it("does not appear in files that are already internationalised", () => {
    const findings: string[] = [];
    for (const root of SCAN) {
      for (const file of walk(join(ROOT, root))) {
        const src = readFileSync(file, "utf8");
        if (!/useTranslation|getServerT/.test(src)) continue;
        const code = stripComments(src);
        code.split("\n").forEach((line, i) => {
          if (OFFENDERS.some((re) => re.test(line))) {
            findings.push(`${file.slice(ROOT.length + 1)}:${i + 1}  ${line.trim().slice(0, 90)}`);
          }
        });
      }
    }
    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
  });
});
