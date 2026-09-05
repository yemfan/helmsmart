import { describe, expect, it } from "vitest";

import { translatorFor } from "@/lib/i18n/translator";
import {
  METRIC_META,
  metricLabel,
  metricShort,
} from "@/lib/research/warehouse/format";

/**
 * `getServerT()` translates for whoever is asking. Some copy has nobody asking:
 * the weekly newsletter is written by a cron and mailed to an address, so its
 * language comes from the digest row being rendered. That is what this covers —
 * and the market-snapshot metric names, which were the last English strings
 * left inside a Chinese issue.
 */
describe("translatorFor", () => {
  it("translates for the locale it is handed, not for a request", () => {
    const zh = translatorFor("zh-Hans", "dashboard");
    const en = translatorFor("en", "dashboard");
    expect(metricShort("median_dom", zh)).toBe("在售天数");
    expect(metricShort("median_dom", en)).toBe("Days on market");
  });

  it("accepts the tags the rest of the app actually carries", () => {
    // contacts.preferred_language stores "zh"; a browser sends "zh-CN".
    for (const tag of ["zh", "zh-CN", "zh-Hans"]) {
      expect(metricShort("zhvi", translatorFor(tag, "dashboard"))).toBe("房屋价值");
    }
  });

  it("falls back to English for an unknown, empty or missing locale", () => {
    for (const tag of ["", "fr", "zh-Hant", null, undefined]) {
      expect(metricShort("zhvi", translatorFor(tag, "dashboard"))).toBe("Home value");
    }
  });

  it("leaves no snapshot metric untranslated — the whole point of the change", () => {
    const zh = translatorFor("zh-Hans", "dashboard");
    for (const metric of Object.keys(METRIC_META)) {
      const short = metricShort(metric, zh);
      const label = metricLabel(metric, zh);
      // A missing key renders the key path loudly rather than throwing.
      expect(short).not.toContain("pages.warehouseMetrics");
      expect(label).not.toContain("pages.warehouseMetrics");
      // Mortgage/Treasury names keep their English numerals, so identity is
      // only a failure when the English has letters the Chinese should replace.
      expect(short).not.toBe(METRIC_META[metric].short);
    }
  });

  it("still renders the key when nothing anywhere defines it", () => {
    expect(translatorFor("zh-Hans", "dashboard")("pages.nope.notAKey")).toBe(
      "pages.nope.notAKey",
    );
  });
});
