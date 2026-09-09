import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MESSAGES,
  PROPER_NOUNS,
  legitimatelyIdentical,
  readJson,
  translatedLocales,
  type Bundle,
} from "./bundles";

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

/*
 * Whether an identical value is legitimately identical lives in `./bundles`
 * as `legitimatelyIdentical` — the proper-noun list plus the mechanical
 * shapes — and is shared with `navLabels`, which asks the same question about
 * the sidebar. It was answered in two places once, and they disagreed:
 * `navLabels` accepted only proper nouns, so Spanish "General" was reported
 * as untranslated when it is simply the same word.
 *
 * Adding a proper noun is a decision: it belongs in `PROPER_NOUNS`, or the
 * string wants translating instead.
 */
const leaves = (o: Bundle, prefix = ""): Array<[string, unknown]> =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? leaves(v as Bundle, `${prefix}${k}.`)
      : ([[`${prefix}${k}`, v]] as Array<[string, unknown]>),
  );

describe("untranslated values", () => {
  it("has no translated string that is still its English source", () => {
    const findings: string[] = [];

    /*
     * Every shipped locale, not one named in a literal. This read the
     * `zh-Hans` directory by name until Spanish landed, which would have let a
     * whole third language ship with English values in it while the check
     * stayed green — the same class of blind spot the check exists to close,
     * one level up.
     */
    for (const locale of translatedLocales()) {
      for (const file of readdirSync(join(MESSAGES, "en"))) {
        if (!file.endsWith(".json")) continue;
        const localeBundle = readJson(join(MESSAGES, locale, file));
        const enBundle = readJson(join(MESSAGES, "en", file));
        if (!localeBundle || !enBundle) continue; // no counterpart; parity owns that gap
        const translated = new Map(leaves(localeBundle));
        for (const [key, value] of leaves(enBundle)) {
          if (typeof value !== "string") continue;
          if (translated.get(key) !== value) continue;
          if (legitimatelyIdentical(value)) continue;
          findings.push(`${locale}/${file}  ${key}  ${JSON.stringify(value.slice(0, 60))}`);
        }
      }
    }

    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
  });

  it("recognises the values that are identical on purpose", () => {
    // Pinned so the exemptions cannot quietly widen into "nothing is a
    // finding" — the failure mode of every allow-list.
    for (const v of [
      "https://example.com/x",
      "owner@example.com",
      "{{count}}",
      "#0F172A",
      "QuickBooks",
      "123 Main St, Sugar Land, TX",
      "24/7",
      "—",
      // Words spelled the same in English and Spanish. Single tokens, so the
      // shape rule covers them without anyone maintaining a word list.
      "General",
      "Total",
      "Normal",
    ]) {
      expect(legitimatelyIdentical(v), v).toBe(true);
    }
    for (const v of ["Save changes", "Overdue invoices", "Send the reminder now"]) {
      expect(legitimatelyIdentical(v), v).toBe(false);
    }
    // A proper noun with a space is exempt by NAME, not by shape — which is
    // exactly why the list has to exist alongside the rules.
    expect(PROPER_NOUNS.has("Google Business")).toBe(true);
    expect(legitimatelyIdentical("Google Business")).toBe(true);
  });
});
