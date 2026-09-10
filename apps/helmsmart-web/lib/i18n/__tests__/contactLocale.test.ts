import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contactLocale } from "@/lib/i18n/contactLocale";
import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { translatorFor } from "@/lib/i18n/translator";

import { ROOT } from "./bundles";

/**
 * Two vocabularies meet at `clients.preferred_language`, and the seam between
 * them is silent when it breaks.
 *
 * `lib/language.ts` writes that column. Its `Lang` is `"en" | "es" | "zh"` — a
 * bare `zh`, because that module classifies inbound messages and never needed a
 * script subtag. The app's locales carry one: `"zh-Hans"`. Hand the stored
 * string straight to a translator and it resolves nothing, falls back to
 * English, and renders an English invoice at a Chinese-reading client — with no
 * error anywhere, because "no bundle for this locale" and "this locale is
 * English" produce the same output.
 *
 * So the mapping is asserted from the SOURCE of the domain rather than from a
 * list retyped here. `SUPPORTED_LANGS` is parsed out of `lib/language.ts`: add a
 * fourth language there and this fails until `contactLocale` can place it, instead of
 * shipping a column value nothing can render.
 */

/** The languages `lib/language.ts` can actually store, read from its source. */
function storedLanguages(): string[] {
  // Parsed rather than imported: that module builds an Anthropic client at load,
  // which a unit test has no key for and no reason to construct.
  const src = readFileSync(join(ROOT, "lib", "language.ts"), "utf8");
  const m = src.match(/SUPPORTED_LANGS\s*:\s*Lang\[\]\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error("could not find SUPPORTED_LANGS in lib/language.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("contact locale", () => {
  it("finds the stored language domain", () => {
    // If the parse stops matching, every assertion below runs over an empty
    // list and this guard goes green while the seam rots.
    expect(storedLanguages()).toContain("zh");
    expect(storedLanguages().length).toBeGreaterThanOrEqual(3);
  });

  it("places every language the column can hold", () => {
    for (const lang of storedLanguages()) {
      const locale = contactLocale(lang);
      expect(locale, `preferred_language "${lang}" maps to nothing`).not.toBeNull();
      expect(SUPPORTED_LOCALES).toContain(locale!);
    }
  });

  it("maps a bare zh onto the script-tagged locale", () => {
    // The specific mismatch. `contactLocale("zh") === null` was the bug.
    expect(contactLocale("zh")).toBe("zh-Hans");
    expect(contactLocale("en")).toBe("en");
    expect(contactLocale("es")).toBe("es");
  });

  it("says it does not know, rather than guessing English", () => {
    expect(contactLocale(null)).toBeNull();
    expect(contactLocale(undefined)).toBeNull();
    expect(contactLocale("")).toBeNull();
    expect(contactLocale("fr")).toBeNull();
  });

  it("refuses Traditional rather than serving Simplified at it", () => {
    // zh-Hant is deliberately unsupported: those readers get English, not
    // Simplified characters they did not ask for. See `resolveLocale`.
    expect(contactLocale("zh-TW")).toBeNull();
    expect(contactLocale("zh-Hant")).toBeNull();
  });
});

describe("the printed invoice", () => {
  const KEYS = [
    "invoice.label",
    "invoice.billTo",
    "invoice.issueDate",
    "invoice.dueDate",
    "invoice.description",
    "invoice.qty",
    "invoice.unitPrice",
    "invoice.amount",
    "invoice.subtotal",
    "invoice.total",
    "invoice.notes",
    "invoice.paid",
  ];

  it("has copy in every language a client's preference can resolve to", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const t = translatorFor(locale, "public");
      for (const key of KEYS) {
        const value = t(key);
        expect(value, `${locale} ${key}`).toBeTruthy();
        expect(value, `${locale} ${key} rendered its own key`).not.toBe(key);
      }
    }
  });

  it("keeps its interpolations intact in every language", () => {
    // The footer and the tax row carry values. A translation that drops a
    // placeholder prints a sentence with a hole in it, on a document a client
    // keeps.
    for (const locale of SUPPORTED_LOCALES) {
      const t = translatorFor(locale, "public");
      const footer = t("invoice.footer", { org: "Acme", number: "INV-1", date: "—" });
      expect(footer, `${locale} footer`).toContain("Acme");
      expect(footer, `${locale} footer`).toContain("INV-1");
      expect(t("invoice.tax", { rate: "8.25" }), `${locale} tax`).toContain("8.25");
    }
  });

  it("is Chinese for a Chinese-reading client", () => {
    const t = translatorFor("zh-Hans", "public");
    for (const key of KEYS) {
      expect(t(key), key).toMatch(/[一-鿿]/);
    }
  });
});
