import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MESSAGES, PROPER_NOUNS, readJson, type Bundle } from "./bundles";

/**
 * A Chinese string that is byte-identical to its English source.
 *
 * The parity check asks whether a key EXISTS in both bundles. Every one of
 * these passes that: the keys are all present, carrying the English text. And
 * since the translator resolves locale → defaultValue → English → key, a value
 * that was never translated renders as clean English rather than as a visible
 * `books.invoices.title`, so nothing downstream complains either.
 *
 * Ported from `apps/leadsmartai/lib/i18n/__tests__/untranslatedValues.test.ts`,
 * where a features page exposed it: fetched with a zh-Hans cookie, the diagram
 * rendered entirely in Chinese — and the AI team above it introduced itself in
 * English, six times. The roles and bodies in that file were translated. Only
 * the names were skipped, which is the shape this catches and no other check
 * can: the guard on residual English reads .tsx and never opens a bundle; the
 * parity check opens the bundles and never reads a value.
 *
 * The rules below matter more than the list. Many values are legitimately
 * identical across the two bundles — a URL, an interpolation, a proper noun.
 * Listing every one would be a wall nobody maintains, so the shapes that are
 * legitimately identical are described once, and what survives is small enough
 * to name individually.
 *
 * SCOPE. `messages/<locale>/*.json` only — this app's own bundles. The shared
 * package's `common` half is the same guard's business in `apps/leadsmartai`,
 * and reporting it here would hand HelmSmart findings it cannot fix in its own
 * tree.
 */

/**
 * Values that are the same in both languages on purpose.
 *
 * The product's own name, the AI employees (a person is called by their name
 * in either language), the third-party services a Chinese-speaking owner
 * searches for in the Latin spelling, and the acronyms read as acronyms.
 * Shared with the source scans through `./bundles` so the three cannot
 * disagree about whether "Google Business" is English.
 *
 * Adding one is a decision: it belongs in PROPER_NOUNS, or the string wants
 * translating instead.
 */
const ALLOWED = PROPER_NOUNS;

/**
 * Shapes that are identical for a reason that has nothing to do with
 * translation, each rejected before the value is ever compared.
 */
function isExemptShape(value: string): boolean {
  const v = value.trim();
  // A URL, an email, an interpolation, a hex colour, a phone number: not prose.
  if (/:\/\/|@|\{\{|^#|^\+?\d[\d ()-]{6,}$/.test(v)) return true;
  /*
   * A single token with no space. Brand names (HelmSmart, QuickBooks),
   * acronyms (AI, CSV, OFX) and the SMS keywords all land here — and STOP and
   * HELP are not merely conventional, they are the words a carrier requires
   * the reply to contain.
   */
  if (!/\s/.test(v)) return true;
  // "123 Main St, Sugar Land, TX" — a US postal address the field hands to a
  // geocoder. The correct Chinese for those words is the wrong thing to type.
  // Kept in step with the same test in residualEnglish.test.ts.
  if (/^\d+\s+[A-Za-z].*,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(v)) return true;
  return false;
}

const leaves = (o: Bundle, prefix = ""): Array<[string, unknown]> =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? leaves(v as Bundle, `${prefix}${k}.`)
      : ([[`${prefix}${k}`, v]] as Array<[string, unknown]>),
  );

describe("untranslated values", () => {
  it("has no Chinese string that is still its English source", () => {
    const findings: string[] = [];

    for (const file of readdirSync(join(MESSAGES, "en"))) {
      if (!file.endsWith(".json")) continue;
      const zhBundle = readJson(join(MESSAGES, "zh-Hans", file));
      const enBundle = readJson(join(MESSAGES, "en", file));
      if (!zhBundle || !enBundle) continue; // no counterpart; the parity check owns that gap
      const zh = new Map(leaves(zhBundle));
      for (const [key, value] of leaves(enBundle)) {
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

  it("recognises the shapes that are identical on purpose", () => {
    // Pinned so the exemptions cannot quietly widen into "nothing is a
    // finding" — the failure mode of every allow-list.
    for (const v of [
      "https://example.com/x",
      "owner@example.com",
      "{{count}}",
      "#0F172A",
      "QuickBooks",
      "123 Main St, Sugar Land, TX",
    ]) {
      expect(isExemptShape(v), v).toBe(true);
    }
    for (const v of ["Save changes", "Overdue invoices", "Send the reminder now"]) {
      expect(isExemptShape(v), v).toBe(false);
      expect(ALLOWED.has(v), v).toBe(false);
    }
    // A proper noun with a space is exempt by NAME, not by shape — which is
    // exactly why the list has to exist alongside the rules.
    expect(isExemptShape("Google Business")).toBe(false);
    expect(ALLOWED.has("Google Business")).toBe(true);
  });
});
