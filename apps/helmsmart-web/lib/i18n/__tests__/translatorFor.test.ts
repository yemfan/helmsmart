import { describe, expect, it } from "vitest";

import { createTranslator } from "@leadsmart/i18n";

import { translatorFor } from "@/lib/i18n/translator";

/**
 * `getServerT()` translates for whoever is asking. Some copy has nobody asking:
 * a weekly digest is written by a cron and mailed to an address, an invite goes
 * out to someone who has never set a cookie, an approval notice reaches a
 * phone. Their language comes from the recipient's stored preference —
 * `userUiLocale(userId)` — and is handed to `translatorFor(locale, ns)`.
 *
 * Ported from `apps/leadsmartai/lib/i18n/__tests__/translatorFor.test.ts` and
 * pointed at HelmSmart's own translator, so what is asserted is this app's
 * resources going through the shared factory rather than the factory in the
 * abstract. `./resolveKey.test.ts` pins the resolution order one layer down.
 */

describe("translatorFor", () => {
  it("translates for the locale it is handed, not for a request", () => {
    const zh = translatorFor("zh-Hans", "nav");
    const en = translatorFor("en", "nav");
    expect(zh("Command Center")).toBe("指挥中心");
    expect(en("Command Center")).toBe("Command Center");
    expect(zh("settingsTabs.general")).toBe("常规");
  });

  it("accepts the tags the rest of the app actually carries", () => {
    // A stored preference may be "zh"; a browser sends "zh-CN".
    for (const tag of ["zh", "zh-CN", "zh-Hans"]) {
      expect(translatorFor(tag, "nav")("Invoices"), tag).toBe("发票");
    }
  });

  it("falls back to English for an unknown, empty or missing locale", () => {
    for (const tag of ["", "fr", "zh-Hant", null, undefined]) {
      expect(translatorFor(tag, "nav")("Invoices"), String(tag)).toBe("Invoices");
    }
  });

  it("reaches another namespace through the ns option", () => {
    /*
     * The request-free twin of `t("common:…")`. Asserted against an app-owned
     * bundle rather than a `common` verb on purpose: `common` is an overlay of
     * the shared package's file, and which of its groups survive depends on
     * what `messages/*\/common.json` declares — a question `navLabels.test.ts`
     * owns. What is being pinned here is only that `{ ns }` redirects.
     */
    const t = translatorFor("zh-Hans", "common");
    expect(t("Dashboard", { ns: "nav" })).toBe("仪表盘");
  });

  it("still renders the key when nothing anywhere defines it", () => {
    // A key in NO bundle is a bug, and it is meant to be loud.
    expect(translatorFor("zh-Hans", "nav")("nope.notAKey")).toBe("nope.notAKey");
  });

  it("interpolates into the locale's own string", () => {
    expect(translatorFor("en", "common")("app_name")).toBe("HelmSmart");
  });
});

/**
 * Two behaviours the shipped bundles cannot demonstrate, asserted through the
 * SAME factory `lib/i18n/translator.ts` is built with:
 *
 *   - PLURALS. No HelmSmart bundle carries an `_one`/`_other` pair yet, and
 *     `docs/i18n-howto.md` documents the shape ahead of the first one.
 *   - THE ENGLISH FALLBACK. A key that exists only in `en` is precisely what
 *     `navLabels`' parity check forbids in a real bundle, so demonstrating it
 *     on real bundles would mean breaking the thing this suite protects.
 *
 * A fixture is the honest way to pin both: same factory, same resolution path,
 * a resources map small enough to read.
 */
const fixtureTranslator = createTranslator({
  resources: {
    en: {
      demo: {
        items_one: "{{count}} item",
        items_other: "{{count}} items",
        onlyEnglish: "Written in English only",
      },
    },
    "zh-Hans": {
      // Chinese has no `one` category — `_other` alone is the correct bundle.
      demo: { items_other: "{{count}} 项" },
    },
    es: {
      // Spanish HAS both categories, like English. A bundle that copied the
      // Chinese shape and shipped `_other` alone would render "1 artículos".
      demo: { items_one: "{{count}} artículo", items_other: "{{count}} artículos" },
    },
  },
  defaultLocale: "en",
  supported: ["en", "zh-Hans", "es"],
});

describe("translatorFor, on shapes the shipped bundles do not have yet", () => {
  it("picks items_one in English and items_other in Chinese for count 1", () => {
    expect(fixtureTranslator("en", "demo")("items", { count: 1 })).toBe("1 item");
    expect(fixtureTranslator("en", "demo")("items", { count: 3 })).toBe("3 items");
    expect(fixtureTranslator("zh-Hans", "demo")("items", { count: 1 })).toBe("1 项");
    expect(fixtureTranslator("zh-Hans", "demo")("items", { count: 3 })).toBe("3 项");
  });

  it("renders English rather than a key path when only en has the string", () => {
    /*
     * The whole reason the resolution order was changed. A visible key makes a
     * regression obvious to us; to a Chinese-speaking reader it is a broken
     * page, with good English sitting one lookup away.
     */
    expect(fixtureTranslator("zh-Hans", "demo")("onlyEnglish")).toBe("Written in English only");
    // And a key in NO bundle is still loud.
    expect(fixtureTranslator("zh-Hans", "demo")("neither")).toBe("neither");
  });
});
