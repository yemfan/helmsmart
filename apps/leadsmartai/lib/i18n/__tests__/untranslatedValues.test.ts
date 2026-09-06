import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A Chinese string that is byte-identical to its English source.
 *
 * The parity tests ask whether a key EXISTS in both bundles. Every one of
 * these passed that: the keys were all present, carrying the English text.
 * And since `getServerT` resolves locale → defaultValue → English → key, a
 * value that was never translated renders as clean English rather than as a
 * visible `pages.foo.bar`, so nothing downstream complains either.
 *
 * The /features page is what exposed it. Fetched from production with a
 * zh-Hans cookie, the command-chain diagram rendered entirely in Chinese —
 * and the AI team above it introduced itself in English, six times:
 *
 *     AI Receptionist  x6      AI 前台接待  x0
 *     Sales Assistant  x2      AI 销售助理  x0
 *
 * The roles and bodies in that file were translated. Only the names were
 * skipped, which is the shape this catches and no other check can: the guard
 * on residual English reads .tsx and never opens a bundle; the parity tests
 * open the bundles and never read a value.
 *
 * The rules below matter more than the list. 107 values are identical across
 * the two bundles and 87 of them are correct — a URL, an interpolation, a
 * plan name, `STOP`. Listing all 107 would be a wall nobody maintains, so the
 * shapes that are legitimately identical are described once, and what
 * survives is small enough to name individually.
 */

const LOCALES = join(__dirname, "..", "..", "..", "..", "..", "packages", "i18n", "locales");

/**
 * Values that are the same in both languages on purpose.
 *
 * Grouped by why. Adding one is a decision: say which group it joins, or
 * translate the string instead.
 */
const ALLOWED = new Set([
  /*
   * Other companies' product names. Chinese users search for these in the
   * Latin spelling, and a translated "Zillow Premier Agent" would name a
   * product that does not exist.
   */
  "Zillow Premier Agent",
  "Facebook Lead Ads",
  "Google Workspace",
  "Microsoft 365 / Outlook",
  "WhatsApp Business",
  "Retell AI",
  "Sync Lipsync",
  "Google Veo",
  "Anthropic Claude",
  "OpenAI GPT",
  "Follow Up Boss",
  "↗ Meta",
  /*
   * Our own names for things a customer buys or is told to say. A plan is
   * called Pro on the invoice in either language, and Max is Boss Assistant
   * the way a person is called by their name.
   */
  "Premium + Team",
  "Producer Track",
  "Top Producer Track",
  "Starter / Pro / Premium",
  "Boss Assistant",
  /*
   * CMA is read as CMA by a Chinese-speaking agent, like SMS and PDF. The
   * expansion appears where the term is introduced, not on every chip.
   */
  "AI CMA",
  /*
   * An address the field will hand to a US geocoder. The correct Chinese for
   * those words is the wrong thing to type into the box.
   */
  "123 Main St, City, State",
]);

/**
 * Shapes that are identical for a reason that has nothing to do with
 * translation, each rejected before the value is ever compared.
 */
function isExemptShape(value: string): boolean {
  const v = value.trim();
  // A URL, an email, an interpolation, a hex colour, a phone number: not prose.
  if (/:\/\/|@|\{\{|^#|^\+?\d[\d ()-]{6,}$/.test(v)) return true;
  /*
   * A single token with no space. Brand names (CloseBoss, LinkedIn), plan
   * names (Pro, Signature), acronyms (AI, CMA) and the SMS keywords all land
   * here — and STOP and HELP are not merely conventional, they are the words
   * a carrier requires the reply to contain.
   */
  if (!/\s/.test(v)) return true;
  // "123 Main St, Sugar Land, TX" — a US postal address, as above.
  if (/^\d+\s+[A-Za-z].*,\s*[A-Z]{2}$/.test(v)) return true;
  return false;
}

type Json = { [k: string]: string | Json };

const leaves = (o: Json, prefix = ""): Array<[string, string]> =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? leaves(v, `${prefix}${k}.`)
      : ([[`${prefix}${k}`, v]] as Array<[string, string]>),
  );

const read = (locale: string, file: string): Json =>
  JSON.parse(readFileSync(join(LOCALES, locale, file), "utf8")) as Json;

describe("untranslated values", () => {
  it("has no Chinese string that is still its English source", () => {
    const findings: string[] = [];

    for (const file of readdirSync(join(LOCALES, "en"))) {
      if (!file.endsWith(".json")) continue;
      let zh: Map<string, string>;
      try {
        zh = new Map(leaves(read("zh-Hans", file)));
      } catch {
        continue; // no Chinese counterpart; the parity tests own that gap
      }
      for (const [key, value] of leaves(read("en", file))) {
        if (typeof value !== "string") continue;
        if (zh.get(key) !== value) continue;
        // Nothing to translate without letters: "24/7", "—", "$".
        if (!/[A-Za-z]{2,}/.test(value)) continue;
        if (ALLOWED.has(value.trim())) continue;
        if (isExemptShape(value)) continue;
        findings.push(`${file}  ${key}  ${JSON.stringify(value.slice(0, 60))}`);
      }
    }

    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
  });
});
