/**
 * Copy that belongs to no single page: the tagline under the wordmark on every
 * `(auth)` screen, and the 404 a mistyped URL lands on.
 *
 * Both were English on a Chinese site, and both were invisible to the guards.
 * The tagline came off a TypeScript constant (`packs.ts`) and reached the DOM
 * through `{pack.tagline}` — not a missing key, and not a string literal in JSX,
 * so neither `missingKeys` nor `jsxExpressionEnglish` could see it. The 404 had
 * no `not-found.tsx` at all, so the English belonged to Next, not to a bundle,
 * and nothing that reads `messages/` was ever going to find it.
 *
 * What is asserted here is the property those guards cannot express: the string
 * a reader ACTUALLY sees on these two surfaces is translated in every locale we
 * ship. Deleting `taglineKey`, renaming `footer.tagline`, or adding a fourth
 * locale without this copy all fail here.
 */
import { describe, expect, it, vi } from "vitest";

import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import { translatorFor } from "@/lib/i18n/translator";

// `getActivePack` resolves the pack from the request host.
vi.mock("next/headers", () => ({
  headers: async () => new Map([["host", "www.helmsmart.ai"]]),
}));

const { getActivePack } = await import("@/lib/packs");

describe("the tagline on every auth screen", () => {
  it("is addressed by a key, not by an English literal", async () => {
    const pack = await getActivePack();
    expect(pack.taglineKey).toBeTruthy();
  });

  it("resolves to real copy in every locale this app ships", async () => {
    const pack = await getActivePack();
    for (const locale of SUPPORTED_LOCALES) {
      const value = translatorFor(locale, "site")(pack.taglineKey!);
      expect(value, `${locale} tagline`).toBeTruthy();
      // A miss returns the key path — the exact "raw key on screen" symptom.
      expect(value, `${locale} tagline resolved to its own key`).not.toBe(pack.taglineKey);
      expect(value, `${locale} tagline`).not.toContain(".");
    }
  });

  it("is not English outside English", async () => {
    const pack = await getActivePack();
    const en = translatorFor("en", "site")(pack.taglineKey!);
    for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "en")) {
      expect(translatorFor(locale, "site")(pack.taglineKey!), locale).not.toBe(en);
    }
  });

  it("keeps the untranslated fallback in step with the English copy", async () => {
    // `tagline` is what a pack with no bundle falls back to. If the two drift,
    // the fallback quietly becomes wrong rather than merely untranslated.
    const pack = await getActivePack();
    expect(pack.tagline).toBe(translatorFor("en", "site")(pack.taglineKey!));
  });
});

describe("the 404 page", () => {
  const KEYS = ["notFound.title", "notFound.body", "notFound.backHome"];

  it("has translated copy in every locale this app ships", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of KEYS) {
        const value = translatorFor(locale, "site")(key);
        expect(value, `${locale} ${key}`).toBeTruthy();
        expect(value, `${locale} ${key} resolved to its own key`).not.toBe(key);
      }
    }
  });

  it("says something different in each language", () => {
    const seen = SUPPORTED_LOCALES.map((l) => translatorFor(l, "site")("notFound.title"));
    expect(new Set(seen).size, `titles: ${seen.join(" | ")}`).toBe(SUPPORTED_LOCALES.length);
  });

  it("is Chinese for a Chinese reader", () => {
    for (const key of KEYS) {
      expect(translatorFor("zh-Hans", "site")(key), key).toMatch(/[一-鿿]/);
    }
  });
});
