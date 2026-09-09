import { describe, expect, it } from "vitest";

import { interpolate, resolveKey } from "@leadsmart/i18n";

/**
 * The server translator used to ship RAW KEYS to the reader.
 *
 * `getServerT` looked in the requested locale's bundle and returned the key on
 * any miss. So a gap in the zh-Hans bundle ALONE — the common kind, since the
 * English side is what the guards check — rendered `books.invoices.title` on a
 * Chinese-speaking owner's screen while the English string sat one lookup away.
 * Found in `apps/leadsmartai` on a page that had passed every i18n check in the
 * suite: `missingKeys` only walks the English bundle, and a raw key is not
 * English so the residual-English scans cannot see it either.
 *
 * These cases pin the order — locale → defaultValue → English → key — because
 * nothing else can. The behaviour has been reasoned into and back out of once
 * already ("a visible key makes regressions obvious"), and the
 * counter-argument is in `packages/i18n/src/resolveKey.ts`'s own comment; this
 * is what keeps the decision from being quietly reverted.
 *
 * HelmSmart shares that module — `lib/i18n/server.ts` and
 * `lib/i18n/translator.ts` are both built by factories over it — so the
 * contract is HelmSmart's contract, and it is asserted here rather than
 * assumed. `./translatorFor.test.ts` exercises the same order end to end,
 * through this app's own translator.
 */

const ZH = { greeting: "你好", nested: { deep: "很深" } };
const EN = { greeting: "Hello", nested: { deep: "Deep" }, onlyEnglish: "English only" };

describe("resolveKey", () => {
  it("prefers the requested locale over everything else", () => {
    expect(
      resolveKey("greeting", {
        bundle: ZH,
        fallbackBundle: EN,
        defaultValue: "ignored",
      }),
    ).toBe("你好");
  });

  it("falls back to English rather than showing the reader a key path", () => {
    expect(resolveKey("onlyEnglish", { bundle: ZH, fallbackBundle: EN })).toBe("English only");
  });

  it("prefers an explicit defaultValue over the English bundle", () => {
    // The call site's own copy is more specific than a generic English hit.
    expect(
      resolveKey("onlyEnglish", {
        bundle: ZH,
        fallbackBundle: EN,
        defaultValue: "from the caller",
      }),
    ).toBe("from the caller");
  });

  it("returns null only when no bundle in any language has the key", () => {
    expect(resolveKey("missing.everywhere", { bundle: ZH, fallbackBundle: EN })).toBeNull();
  });

  it("resolves dotted paths through nested objects", () => {
    expect(resolveKey("nested.deep", { bundle: ZH, fallbackBundle: EN })).toBe("很深");
  });

  it("treats a non-string node as a miss, not as a value", () => {
    // `t("nested")` must not render "[object Object]".
    expect(resolveKey("nested", { bundle: ZH })).toBeNull();
  });

  it("survives a namespace that has no bundle at all", () => {
    expect(resolveKey("greeting", { bundle: undefined, fallbackBundle: EN })).toBe("Hello");
    expect(resolveKey("greeting", { bundle: undefined })).toBeNull();
  });

  it("ignores a non-string defaultValue", () => {
    // Callers pass `{ ns, count: 3 }` shapes; only a string is copy.
    expect(resolveKey("missing.everywhere", { bundle: ZH, defaultValue: 3 })).toBeNull();
  });

  /**
   * Plurals, the trap `docs/i18n-howto.md` names: a server-rendered
   * `{{count}}` line used to print the raw `_one` key, because only the client
   * half knew about i18next's suffixes. The same suffix rule runs here now, so
   * a key works identically on both sides of the boundary.
   */
  it("picks the plural form the locale's rules ask for", () => {
    const en = { items_one: "{{count}} item", items_other: "{{count}} items" };
    expect(resolveKey("items", { bundle: en, count: 1, pluralTag: "en-US" })).toBe("{{count}} item");
    expect(resolveKey("items", { bundle: en, count: 4, pluralTag: "en-US" })).toBe(
      "{{count}} items",
    );
  });

  it("accepts a bundle that wrote only the _other form", () => {
    // Chinese has no `one` category, so its bundles carry `_other` alone — and
    // an English reader's `one` must still find it rather than render the key.
    const zh = { items_other: "{{count}} 项" };
    expect(resolveKey("items", { bundle: zh, count: 1, pluralTag: "zh-CN" })).toBe("{{count}} 项");
    expect(resolveKey("items", { bundle: zh, count: 1, pluralTag: "en-US" })).toBe("{{count}} 项");
  });
});

describe("interpolate", () => {
  it("substitutes {{name}} the way i18next does", () => {
    expect(interpolate("{{n}} 条未读消息", { n: 3 })).toBe("3 条未读消息");
  });

  it("renders a missing variable as empty rather than as the placeholder", () => {
    expect(interpolate("Saved {{date}}", {})).toBe("Saved ");
  });

  it("leaves a string with no placeholders untouched", () => {
    expect(interpolate("← 全部发票", { irrelevant: 1 })).toBe("← 全部发票");
  });
});
