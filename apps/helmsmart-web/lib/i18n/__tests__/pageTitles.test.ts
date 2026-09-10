import { describe, expect, it } from "vitest";

import { OG_LOCALES, SUPPORTED_LOCALES } from "@/lib/i18n/config";

import { loadNamespace, lookup } from "./bundles";

/**
 * Marketing page titles, which nothing else in this suite looks at.
 *
 * Two things went wrong here and neither is a missing key, so no other guard
 * could see either.
 *
 * `/pricing` rendered "HelmSmart——更多掌控，更少投入 | HelmSmart" — the brand
 * twice. It was the one marketing page with no metadata of its own, so it fell
 * through to the `(marketing)` layout's title, which already ends in the brand,
 * and the root template appended it again. Every sibling overrode the layout and
 * hid the fault, which is why it survived: the bug lived in the DEFAULT, and the
 * default was only reachable from one page.
 *
 * And the separator drifted. Six titles read "About — HelmSmart"; the seventh
 * read "Frequently Asked Questions | HelmSmart". Both are fine sentences; only
 * the pair is wrong, and a per-string check can never see a pair.
 */

/** Every `site.<group>.meta.title` — the marketing pages' own titles. */
function pageTitles(locale: string): Record<string, string> {
  const site = loadNamespace(locale, "site");
  if (!site) throw new Error(`no site bundle for ${locale}`);
  const out: Record<string, string> = {};
  for (const [group, value] of Object.entries(site)) {
    // `meta` is the site-wide default, whose title leads with the brand rather
    // than ending in it. It is the thing these override, not one of them.
    if (group === "meta" || !value || typeof value !== "object") continue;
    const title = lookup(value as Record<string, unknown>, "meta.title");
    if (typeof title === "string") out[group] = title;
  }
  return out;
}

describe("marketing page titles", () => {
  it("finds the titles at all", () => {
    // If the shape changes, every assertion below passes over an empty object.
    const titles = pageTitles("en");
    expect(Object.keys(titles).length).toBeGreaterThanOrEqual(6);
    expect(titles).toHaveProperty("about");
  });

  it("gives /pricing a title of its own", () => {
    // Without one it inherits the layout's, and the root template doubles the
    // brand. This is the page the fault actually reached.
    for (const locale of SUPPORTED_LOCALES) {
      expect(pageTitles(locale).pricing, `${locale} pricing.meta.title`).toBeTruthy();
    }
  });

  it("names the brand exactly once per title", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [page, title] of Object.entries(pageTitles(locale))) {
        const hits = title.split("HelmSmart").length - 1;
        expect(hits, `${locale} ${page}: "${title}"`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("separates the page from the brand the same way throughout a locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const seps = new Set<string>();
      for (const title of Object.values(pageTitles(locale))) {
        const i = title.lastIndexOf("HelmSmart");
        if (i <= 0) continue;
        seps.add(title.slice(0, i).replace(/^.*?(\s*[—|·-]+\s*)$/, "$1"));
      }
      expect(
        [...seps],
        `${locale} mixes title separators — pick one and use it for every page`,
      ).toHaveLength(1);
    }
  });
});

describe("og:locale", () => {
  it("covers every locale this app ships", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(OG_LOCALES[locale], `no og:locale for ${locale}`).toBeTruthy();
    }
  });

  it("uses Open Graph's language_TERRITORY form, not BCP-47", () => {
    // `zh-Hans` in an og:locale is silently ignored by every scraper that reads
    // it — the failure mode that let the tag be missing entirely without anyone
    // noticing.
    for (const tag of Object.values(OG_LOCALES)) {
      expect(tag, `"${tag}" is not language_TERRITORY`).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
  });
});
