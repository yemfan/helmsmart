import { describe, expect, it } from "vitest";

import { interpolate, resolveKey } from "../resolveKey";

/**
 * The server translator shipped RAW KEYS to the reader.
 *
 * `getServerT` looked in the requested locale's bundle and returned the key on
 * any miss. So a gap in the zh-Hans bundle ALONE — the common kind, since the
 * English side is what the guards check — rendered
 * `pages.demoContent.sources.zillow` on a Chinese-speaking agent's screen
 * while the English string sat one lookup away. Found on /demo/inbox, which
 * had passed every i18n check in the suite: `missingKeys` only walks the
 * English bundle, and a raw key is not English so the residual-English scans
 * can't see it either.
 *
 * These cases pin the order — locale → defaultValue → English → key — because
 * nothing else can. The behaviour has been reasoned into and back out of once
 * already ("a visible key makes regressions obvious"), and the counter-argument
 * is in the module's own comment; this is what keeps the decision from being
 * quietly reverted.
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
    expect(resolveKey("onlyEnglish", { bundle: ZH, fallbackBundle: EN })).toBe(
      "English only",
    );
  });

  it("prefers an explicit defaultValue over the English bundle", () => {
    // The call site's own copy is more specific than a generic English hit —
    // this is what lets lib/demo/localize.ts pass the fixture's string.
    expect(
      resolveKey("onlyEnglish", {
        bundle: ZH,
        fallbackBundle: EN,
        defaultValue: "from the fixture",
      }),
    ).toBe("from the fixture");
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
    expect(
      resolveKey("missing.everywhere", { bundle: ZH, defaultValue: 3 }),
    ).toBeNull();
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
    expect(interpolate("← 全部 CMA", { irrelevant: 1 })).toBe("← 全部 CMA");
  });
});
