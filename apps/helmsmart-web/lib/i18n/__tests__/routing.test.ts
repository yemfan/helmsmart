import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES } from "@/lib/i18n/config";
import {
  LOCALE_PREFIX,
  LOCALIZED_PATHS,
  isLocalizedPath,
  MARKETING_CACHE_CONTROL,
  localeAlternates,
  localizedPath,
  negotiateLocale,
  splitLocalePath,
} from "@/lib/i18n/routing";

/**
 * Locale-prefixed marketing URLs.
 *
 * The audit measured the problem these solve: the same homepage URL returned 6
 * CJK characters to a crawler and 1,788 with `Accept-Language: zh-CN`. Language
 * lived in a cookie, so the Chinese site had no address anyone could link to or
 * index.
 *
 * Two properties here matter more than the rest.
 *
 * SECURITY. `proxy.ts` rewrites a prefixed URL and returns BEFORE its auth
 * guards. If any prefixed path were accepted, `/zh/home` would rewrite to
 * `/home` with the dashboard check skipped — an auth bypass spelled with a
 * language prefix. `isLocalizedPath` is what confines the rewrite to public
 * pages, so it is tested as a deny-list, not just an allow-list.
 *
 * ROUND-TRIPPING. `splitLocalePath` and `localizedPath` are inverses. When they
 * disagree the failure is silent and awful: the toggle navigates somewhere that
 * renders the other language, or a canonical tag points at a URL that serves
 * different content than it claims.
 */

describe("reading a locale out of a path", () => {
  it("recognises each prefix it publishes", () => {
    for (const [locale, prefix] of Object.entries(LOCALE_PREFIX)) {
      expect(splitLocalePath(`/${prefix}/pricing`)).toEqual({ locale, path: "/pricing" });
    }
  });

  it("treats a bare prefix as that language's homepage", () => {
    expect(splitLocalePath("/zh")).toEqual({ locale: "zh-Hans", path: "/" });
    expect(splitLocalePath("/zh/")).toEqual({ locale: "zh-Hans", path: "/" });
  });

  it("leaves an unprefixed path alone", () => {
    for (const p of ["/", "/pricing", "/blog/some-post", "/home", "/books/invoices"]) {
      expect(splitLocalePath(p)).toEqual({ locale: null, path: p });
    }
  });

  it("does not mistake a page for a prefix", () => {
    // `/about` starts with a letter pair too. Only the exact segments count.
    expect(splitLocalePath("/about").locale).toBeNull();
    expect(splitLocalePath("/estimates").locale).toBeNull();
    expect(splitLocalePath("/zhongwen").locale).toBeNull();
  });

  it("keeps nested paths intact", () => {
    expect(splitLocalePath("/zh/contact/sales")).toEqual({
      locale: "zh-Hans",
      path: "/contact/sales",
    });
  });
});

describe("what a prefix is allowed to reach", () => {
  it("accepts every path it publishes", () => {
    for (const p of LOCALIZED_PATHS) expect(isLocalizedPath(p), p).toBe(true);
  });

  it("refuses anything behind the dashboard's auth guard", () => {
    // The deny-list IS the security boundary. `proxy.ts` returns early on a
    // match, so a false positive here skips the auth redirect below it.
    for (const p of [
      "/home",
      "/settings",
      "/books",
      "/books/invoices",
      "/clients",
      "/inbox",
      "/onboarding",
      "/login",
      "/signup",
      "/api/cron/invoices/reminders",
      "/pay/abc",
      "/portal/tok",
    ]) {
      expect(isLocalizedPath(p), `${p} must not be reachable via a locale prefix`).toBe(false);
    }
  });

  it("refuses blog posts, which exist in one language only", () => {
    expect(isLocalizedPath("/blog")).toBe(false);
    expect(isLocalizedPath("/blog/whatever")).toBe(false);
  });
});

describe("building a localized path", () => {
  it("leaves English bare, so existing links keep working", () => {
    expect(localizedPath("/pricing", "en")).toBe("/pricing");
    expect(localizedPath("/", "en")).toBe("/");
  });

  it("prefixes the others", () => {
    expect(localizedPath("/pricing", "zh-Hans")).toBe("/zh/pricing");
    expect(localizedPath("/", "zh-Hans")).toBe("/zh");
    expect(localizedPath("/contact/sales", "es")).toBe("/es/contact/sales");
  });

  it("round-trips every published path in every locale", () => {
    for (const path of LOCALIZED_PATHS) {
      for (const locale of SUPPORTED_LOCALES) {
        const url = localizedPath(path, locale);
        const back = splitLocalePath(url);
        expect(back.path, `${locale} ${path} -> ${url}`).toBe(path);
        expect(back.locale ?? "en", `${locale} ${path} -> ${url}`).toBe(locale);
      }
    }
  });
});

describe("canonical and hreflang", () => {
  const BASE = "https://www.helmsmart.ai";

  it("points each language at its own URL", () => {
    const zh = localeAlternates("/pricing", "zh-Hans", BASE);
    expect(zh.canonical).toBe(`${BASE}/zh/pricing`);
    expect(zh.languages.en).toBe(`${BASE}/pricing`);
    expect(zh.languages["zh-Hans"]).toBe(`${BASE}/zh/pricing`);
    expect(zh.languages.es).toBe(`${BASE}/es/pricing`);
  });

  it("makes the negotiating bare path the x-default", () => {
    expect(localeAlternates("/pricing", "es", BASE).languages["x-default"]).toBe(
      `${BASE}/pricing`,
    );
  });

  it("gives each locale a DIFFERENT canonical for the same page", () => {
    // The whole point. One canonical shared across locales is how three
    // languages collapse into one indexed page.
    const seen = SUPPORTED_LOCALES.map((l) => localeAlternates("/faq", l, BASE).canonical);
    expect(new Set(seen).size).toBe(SUPPORTED_LOCALES.length);
  });

  it("names every shipped locale in hreflang", () => {
    const langs = localeAlternates("/", "en", BASE).languages;
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(langs), `hreflang missing ${locale}`).toContain(locale);
    }
  });

  it("emits absolute URLs, and no double slash at the root", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const { canonical, languages } = localeAlternates("/", locale, BASE);
      for (const url of [canonical, ...Object.values(languages)]) {
        expect(url, url).toMatch(/^https:\/\//);
        expect(url, url).not.toMatch(/[^:]\/\//);
      }
    }
  });

  it("tolerates a base URL with a trailing slash", () => {
    expect(localeAlternates("/pricing", "en", `${BASE}/`).canonical).toBe(`${BASE}/pricing`);
  });
});

describe("negotiating a language for a bare path", () => {
  /*
   * The proxy sends a reader who wants another language to their own URL, and
   * that redirect is what lets the bare path be cached: only default-locale
   * readers ever reach the cached copy. A wrong answer here either caches the
   * wrong language for everybody or redirects in a loop.
   */
  it("reads the first tag it recognises", () => {
    expect(negotiateLocale("zh-CN,zh;q=0.9,en-US;q=0.8")).toBe("zh-Hans");
    expect(negotiateLocale("es-MX,es;q=0.9")).toBe("es");
    expect(negotiateLocale("en-GB,en;q=0.9")).toBe("en");
  });

  it("skips languages it does not ship, rather than defaulting early", () => {
    expect(negotiateLocale("fr-FR,fr;q=0.9,zh-CN;q=0.8")).toBe("zh-Hans");
    expect(negotiateLocale("de,fr")).toBeNull();
  });

  it("answers null when there is nothing to go on", () => {
    expect(negotiateLocale(null)).toBeNull();
    expect(negotiateLocale("")).toBeNull();
  });

  it("refuses Traditional, so those readers get English not Simplified", () => {
    expect(negotiateLocale("zh-TW,zh-Hant;q=0.9")).toBeNull();
  });

  it("never sends a reader to a prefix for the default locale", () => {
    // The proxy only redirects when the preference differs from the default.
    // If `en` ever gained a prefix, /pricing would redirect to /en/pricing,
    // which would redirect again.
    expect(localizedPath("/pricing", "en")).toBe("/pricing");
  });
});

describe("marketing cache policy", () => {
  /** The header split into its directives, which is how a cache reads it. */
  const directives = MARKETING_CACHE_CONTROL.split(",").map((d) => d.trim());
  const value = (name: string) =>
    directives.find((d) => d.startsWith(name + "="))?.split("=")[1];

  it("is shareable, which is the whole point", () => {
    // These pages were `private, no-store` on every request — every one an
    // X-Vercel-Cache MISS. A shared cache needs `public` and an `s-maxage`;
    // without both, the CDN holds nothing.
    expect(directives).toContain("public");
    expect(directives).not.toContain("private");
    expect(directives).not.toContain("no-store");
    expect(Number(value("s-maxage"))).toBeGreaterThan(0);
  });

  it("lets the browser revalidate while the CDN serves", () => {
    // max-age=0 keeps the BROWSER honest while s-maxage lets the shared cache
    // answer. Without the first, a reader could hold a stale page for an hour
    // after a deploy.
    expect(value("max-age")).toBe("0");
    expect(Number(value("stale-while-revalidate"))).toBeGreaterThan(0);
  });
});
