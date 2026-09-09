import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MESSAGES,
  PACKAGE_LOCALES,
  PROPER_NOUNS,
  ROOT,
  leafKeys,
  legitimatelyIdentical,
  loadNamespace,
  loadNamespaces,
  locales,
  lookup,
  packageOnlyCommonKey,
  readJson,
  translatedLocales,
  type Bundle,
} from "./bundles";

/**
 * The sidebar is the one surface every reader sees on every page, and it is
 * keyed by its own ENGLISH LABEL rather than by a symbolic key:
 *
 *     const relabel = (s: string) => t(terms[s] ?? s, { defaultValue: s });
 *
 * That is deliberate — a pack can relabel "Clients" to "Patients" before the
 * locale is applied, and a label with no translation renders itself rather than
 * a raw key. The cost is that the bundle and the component agree only by
 * spelling: rename a nav item in `components/sidebar.tsx` and the translated
 * sidebar silently goes back to English, one item at a time, with nothing
 * failing anywhere. `missingKeys` cannot see it either, because the key is a
 * variable.
 *
 * So this guard reads the labels out of the component and demands they exist in
 * every nav bundle. Ported from
 * `apps/leadsmartai/lib/i18n/__tests__/navLabels.test.ts`, which pins the same
 * contract for a nav tree assembled the same way, and extended here with the
 * two other navigations that share the `nav` namespace — `settings-tabs.tsx`
 * (`settingsTabs.*`) and `books-nav.tsx` (`books.*`), both of which build their
 * key with a template literal and are therefore invisible to every other guard
 * in this directory.
 *
 * The last block is the general parity check: for every namespace and every
 * shipped locale, the bundles carry the SAME leaf keys as English. A key
 * present in one and missing from the other is the gap that renders English to
 * a translated reader without anything looking wrong.
 *
 * Nothing here names a language. The locale list is read from the `messages/`
 * directory, so a new one is held to every assertion in this file the moment
 * its folder exists — the alternative is a guard that keeps checking the two
 * languages it was written for while a third ships unexamined beside them.
 */

const SIDEBAR = join(ROOT, "components", "sidebar.tsx");
const SETTINGS_TABS = join(ROOT, "components", "settings-tabs.tsx");
const BOOKS_NAV = join(ROOT, "components", "books-nav.tsx");

const enNav = readJson(join(MESSAGES, "en", "nav.json"));
/** Every translated locale's nav bundle, keyed by locale — read from disk so a
 *  new language is held to these assertions the moment its directory exists. */
const translatedNav = translatedLocales().map(
  (locale) => [locale, readJson(join(MESSAGES, locale, "nav.json"))] as const,
);

/**
 * The English labels in `navSections`, group titles and item labels alike.
 *
 * Read from SOURCE rather than imported: `navSections` is a module-scope const
 * inside a `"use client"` component that pulls in `next/navigation`, lucide
 * icons and `@helm/ui`. Importing it to read six strings would drag a React
 * tree into a node-environment test, and the failure would be about JSX rather
 * than about the sidebar.
 */
function sidebarLabels(): string[] {
  const src = readFileSync(SIDEBAR, "utf8");
  const start = src.indexOf("const navSections");
  expect(start, "components/sidebar.tsx no longer declares navSections").toBeGreaterThan(-1);
  // The declaration ends at the first `];` in column 0 after it.
  const end = src.indexOf("\n];", start);
  expect(end, "navSections declaration is unterminated").toBeGreaterThan(start);
  const block = src.slice(start, end);
  return [...block.matchAll(/\b(?:title|label):\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** The `key` field of each entry in a `TABS` array — settings tabs, books nav. */
function tabKeys(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const start = src.indexOf("const TABS");
  expect(start, `${file} no longer declares TABS`).toBeGreaterThan(-1);
  const end = src.indexOf("\n]", start);
  const block = src.slice(start, end);
  return [...block.matchAll(/\bkey:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("sidebar labels", () => {
  it("reads a plausible set of labels out of the component", () => {
    /*
     * The extractor is the load-bearing part: if the regex stops matching, every
     * assertion below passes over an empty array and the guard goes green while
     * the sidebar rots. So the shape of what it found is pinned first.
     */
    const labels = sidebarLabels();
    expect(labels.length).toBeGreaterThan(20);
    expect(labels).toContain("Workspace"); // a group title
    expect(labels).toContain("Settings"); // an item label
    /*
     * Group titles and item labels are read by ONE regex and share one
     * bundle, which is correct — `relabel()` treats them identically — and it
     * means a label may legitimately appear twice ("Marketing" is both a
     * section and a page). So the set is deduplicated below rather than
     * asserted unique.
     */
  });

  it("has an English nav key for every label the sidebar renders", () => {
    const missing = [...new Set(sidebarLabels())].filter(
      (l) => typeof lookup(enNav, l) !== "string",
    );
    expect(missing, `\nmessages/en/nav.json is missing:\n${missing.join("\n")}\n`).toEqual([]);
  });

  it("has a translated nav key for every label the sidebar renders", () => {
    for (const [locale, nav] of translatedNav) {
      const missing = [...new Set(sidebarLabels())].filter(
        (l) => typeof lookup(nav, l) !== "string",
      );
      expect(
        missing,
        `\nmessages/${locale}/nav.json is missing:\n${missing.join("\n")}\n`,
      ).toEqual([]);
    }
  });
});

describe("settings tabs and books nav", () => {
  it("has both locales for every settings tab", () => {
    const keys = tabKeys(SETTINGS_TABS);
    expect(keys.length).toBeGreaterThan(3);
    for (const k of keys) {
      expect(typeof lookup(enNav, `settingsTabs.${k}`), `en settingsTabs.${k}`).toBe("string");
      for (const [locale, nav] of translatedNav) {
        expect(
          typeof lookup(nav, `settingsTabs.${k}`),
          `${locale} settingsTabs.${k}`,
        ).toBe("string");
      }
    }
  });

  it("has both locales for every books sub-nav tab", () => {
    const keys = tabKeys(BOOKS_NAV);
    expect(keys.length).toBeGreaterThan(6);
    for (const k of keys) {
      expect(typeof lookup(enNav, `books.${k}`), `en books.${k}`).toBe("string");
      for (const [locale, nav] of translatedNav) {
        expect(typeof lookup(nav, `books.${k}`), `${locale} books.${k}`).toBe("string");
      }
    }
  });
});

/**
 * A leaf key with its i18next plural suffix removed.
 *
 * The two bundles do NOT hold the same suffixed keys and must not be asked to:
 * `docs/i18n-howto.md` says a countable string is `items_one` + `items_other`
 * in English and `items_other` alone in Chinese, because Chinese has no `one`
 * category. A parity check that compared raw leaves would fail every correct
 * plural in the app and be switched off within a week — which is how a guard
 * stops protecting anything. What both bundles must agree on is the set of
 * keys a CALL SITE can name, and `t("items", { count })` names `items`.
 */
const PLURAL_SUFFIX = /_(one|other|zero|two|few|many)$/;
const logicalKeys = (b: Bundle): Set<string> =>
  new Set(leafKeys(b).map((k) => k.replace(PLURAL_SUFFIX, "")));

/** A base key that is pluralised but has no `_other` — broken in every locale. */
function pluralsWithoutOther(b: Bundle): string[] {
  const bases = new Map<string, Set<string>>();
  for (const k of leafKeys(b)) {
    const m = k.match(PLURAL_SUFFIX);
    if (!m) continue;
    const base = k.replace(PLURAL_SUFFIX, "");
    if (!bases.has(base)) bases.set(base, new Set());
    bases.get(base)!.add(m[1]);
  }
  return [...bases].filter(([, forms]) => !forms.has("other")).map(([base]) => base);
}

describe("plural-aware key comparison", () => {
  it("treats items_one and items_other as the one key a call site names", () => {
    const en = { items_one: "1 item", items_other: "{{count}} items" };
    const zh = { items_other: "{{count}} 项" };
    expect([...logicalKeys(en)]).toEqual(["items"]);
    expect([...logicalKeys(zh)]).toEqual(["items"]);
    expect(pluralsWithoutOther(en)).toEqual([]);
    // `_one` alone resolves for nobody — Chinese has no `one` category at all.
    expect(pluralsWithoutOther({ items_one: "1 item" })).toEqual(["items"]);
  });
});

describe("nav namespace", () => {
  it("carries the same key set in every locale", () => {
    const en = logicalKeys(enNav as Bundle);
    for (const [locale, nav] of translatedNav) {
      const other = logicalKeys(nav as Bundle);
      expect([...en].filter((k) => !other.has(k)), `missing from ${locale}`).toEqual([]);
      expect([...other].filter((k) => !en.has(k)), `not declared in en (${locale})`).toEqual([]);
    }
  });

  it("has no translated value that is still its English source", () => {
    /*
     * A half-translated sidebar reads as translated to the parity check above:
     * the key is there, carrying the English.
     *
     * `legitimatelyIdentical` is the SAME predicate `untranslatedValues` uses,
     * deliberately — this check used to accept only a proper noun, and so
     * reported Spanish "General" as untranslated. It is the correct Spanish
     * word, and a guard that fails a correct translation teaches people to
     * edit the translation to appease it.
     */
    for (const [locale, nav] of translatedNav) {
      const identical = leafKeys(enNav as Bundle).filter((k) => {
        const e = lookup(enNav, k);
        const other = lookup(nav, k);
        if (typeof e !== "string" || e !== other) return false;
        return !legitimatelyIdentical(e);
      });
      expect(
        identical,
        `\n${locale} nav values still in English:\n${identical.join("\n")}\n`,
      ).toEqual([]);
    }
  });
});

describe("bundle parity", () => {
  it("gives every namespace the same leaf keys in every shipped locale", () => {
    /*
     * The general form of the nav check above, across every bundle this app
     * ships and every language it ships them in. `common` is compared in
     * RESOLVED form — the shared package's half overlaid with the app's —
     * because that is what a reader actually gets, and a gap on either side of
     * that overlay renders English to a translated reader with nothing else in
     * this directory complaining.
     *
     * The locale list is read from disk, not written here: naming the
     * languages in a literal is how a third one ships unchecked beside the
     * two that are named.
     */
    const en = loadNamespaces("en");
    const findings: string[] = [];

    for (const locale of translatedLocales()) {
      const other = loadNamespaces(locale);

      for (const ns of Object.keys(en)) {
        const otherBundle = other[ns];
        if (!otherBundle) {
          findings.push(`${ns}: no messages/${locale}/${ns}.json at all`);
          continue;
        }
        const otherKeys = logicalKeys(otherBundle);
        const enKeys = logicalKeys(en[ns]);
        for (const k of enKeys) {
          if (!otherKeys.has(k)) findings.push(`${locale} ${ns}: ${k} missing`);
        }
        for (const k of otherKeys) {
          if (!enKeys.has(k)) findings.push(`${locale} ${ns}: ${k} is in ${locale} but not in en`);
        }
        for (const base of pluralsWithoutOther(otherBundle)) {
          findings.push(`${locale} ${ns}: ${base} is pluralised with no _other form`);
        }
      }

      for (const ns of Object.keys(other)) {
        if (!en[ns]) findings.push(`${ns}: no messages/en/${ns}.json at all`);
      }
    }

    for (const ns of Object.keys(en)) {
      for (const base of pluralsWithoutOther(en[ns])) {
        findings.push(`en ${ns}: ${base} is pluralised with no _other form`);
      }
    }

    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
  });

  it("compares common through the overlay, not through messages/ alone", () => {
    // If this stopped resolving the package half, the parity check above would
    // compare two nearly-empty objects and pass while saying nothing.
    const common = loadNamespace("en", "common");
    expect(leafKeys(common as Bundle).length).toBeGreaterThan(20);
    expect(typeof lookup(common, packageOnlyCommonKey("en"))).toBe("string");
    expect(lookup(common, "app_name")).toBe("HelmSmart");
  });
});

describe("the common overlay", () => {
  /**
   * `common` is the shared package's bundle with this app's own on top, and
   * both are nested. The overlay in `lib/i18n/config.ts` was a SHALLOW spread
   * first:
   *
   *     common: { ...pkgEnCommon, ...enCommon, app_name: "HelmSmart" }
   *
   * which meant an app `common.json` declaring its own `actions: {…}` did not
   * merge into the package's `actions` group — it REPLACED it. Adding a single
   * `actions.saved_bang` deleted `actions.save`, `actions.cancel`,
   * `actions.delete` and thirty-odd siblings from the app at once, and every
   * `t("common:actions.cancel")` rendered its raw key. Nothing looked wrong at
   * the merge: the bundle was still a valid object, just missing forty strings.
   *
   * Nothing else here could see it either. The parity check compares en to
   * zh-Hans and they lose the same keys together, so it passes; `missingKeys`
   * reports the call sites without naming the cause.
   *
   * `config.ts` now merges deeply, so a nested app group EXTENDS the package's
   * rather than replacing it, and only leaves collide. This asserts that
   * property directly — every package leaf survives the overlay unless the app
   * deliberately overrides that exact leaf — so a return to a shallow spread
   * in either `config.ts` or `bundles.ts` fails here, where the overlay is
   * defined, rather than as hundreds of confusing findings elsewhere.
   */
  it("keeps every package key an app group does not itself override", () => {
    const findings: string[] = [];

    for (const locale of locales()) {
      const pkg = readJson(join(PACKAGE_LOCALES, locale, "common.json")) ?? {};
      const app = readJson(join(MESSAGES, locale, "common.json")) ?? {};
      const resolved = loadNamespace(locale, "common");

      for (const key of leafKeys(pkg as Bundle)) {
        // `app_name` is forced to the product name on purpose.
        if (key === "app_name") continue;
        if (lookup(resolved, key) === undefined) {
          findings.push(
            `messages/${locale}/common.json drops the package key "${key}" — ` +
              `the overlay replaced a group instead of merging into it`,
          );
        }
      }

      // And the app's own additions have to survive too, or the merge is
      // backwards.
      for (const key of leafKeys(app as Bundle)) {
        if (lookup(resolved, key) === undefined) {
          findings.push(`messages/${locale}/common.json declares "${key}" but it does not resolve`);
        }
      }
    }

    expect(findings, `\n${findings.join("\n")}\n`).toEqual([]);
  });
});
