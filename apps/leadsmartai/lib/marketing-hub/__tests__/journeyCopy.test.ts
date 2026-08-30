import { describe, expect, it } from "vitest";

import en from "@leadsmart/i18n/locales/en/dashboard.json";
import zh from "@leadsmart/i18n/locales/zh-Hans/dashboard.json";

/**
 * The journey line in the lead drawer is the payoff of the whole visitor
 * stitch, and it is assembled from plural keys — the shape most likely to be
 * half-added and then fail silently in one locale only.
 *
 * i18next resolves `t("k", {count})` to `k_one` or `k_other`. A missing
 * `_other` does not throw; it renders the raw key, so "Read journeyPages_other
 * pages" ships to whichever language was forgotten.
 */

type Dict = Record<string, unknown>;

function leadDrawer(bundle: unknown): Dict {
  const pages = (bundle as Dict).pages as Dict | undefined;
  return ((pages?.leadDrawer as Dict) ?? {}) as Dict;
}

const LOCALES: Array<[string, Dict]> = [
  ["en", leadDrawer(en)],
  ["zh-Hans", leadDrawer(zh)],
];

const REQUIRED = [
  "howTheyFoundYou",
  "journeyPages_one",
  "journeyPages_other",
  "journeyVisits",
  "journeyBefore",
  "journeyFirstVia",
  "journeyCampaign",
  "journeyStillBrowsing",
];

describe("lead-drawer journey copy", () => {
  for (const [name, dict] of LOCALES) {
    it(`${name} has every key the drawer asks for`, () => {
      for (const key of REQUIRED) {
        expect(typeof dict[key], `${name} is missing ${key}`).toBe("string");
        expect(String(dict[key]).trim().length).toBeGreaterThan(0);
      }
    });

    it(`${name} keeps the interpolation placeholders`, () => {
      // A translation that drops {{count}} renders "Read pages", which reads
      // like a bug to the person holding the phone.
      expect(String(dict.journeyPages_one)).toContain("{{count}}");
      expect(String(dict.journeyPages_other)).toContain("{{count}}");
      expect(String(dict.journeyVisits)).toContain("{{count}}");
      expect(String(dict.journeyFirstVia)).toContain("{{source}}");
      expect(String(dict.journeyCampaign)).toContain("{{campaign}}");
    });

    it(`${name} does not define a bare journeyPages, which would defeat plurals`, () => {
      // i18next prefers an exact key over the plural suffixes; a stray
      // `journeyPages` would win and the singular case would never render.
      expect(dict.journeyPages).toBeUndefined();
    });
  }

  it("is actually translated, not English copied into the Chinese bundle", () => {
    const [, enDict] = LOCALES[0];
    const [, zhDict] = LOCALES[1];
    for (const key of REQUIRED) {
      expect(String(zhDict[key]), `${key} was not translated`).not.toBe(String(enDict[key]));
    }
  });
});
