import { resolveLocale } from "@leadsmart/i18n";

import { SUPPORTED_LOCALES, type SupportedLocale } from "./config";

/**
 * Locale-prefixed URLs for the public marketing pages.
 *
 * THE PROBLEM. Every page was served from one URL in whichever language the
 * reader negotiated — cookie, then `Accept-Language`. A crawler sends neither,
 * so Googlebot only ever saw English: measured at 6 CJK characters on the
 * Chinese homepage against 1,788 for the same URL with `Accept-Language: zh-CN`.
 * Nobody could find the Chinese site by searching, and nobody could share a
 * link that opened in Chinese. The translation work was unreachable.
 *
 * THE SHAPE. English keeps the bare path and the other languages get a prefix:
 *
 *     /pricing        en       (unchanged — every existing link still works)
 *     /zh/pricing     zh-Hans
 *     /es/pricing     es
 *
 * English is unprefixed on purpose. A `/en` prefix would mean redirecting every
 * existing URL, every backlink and every bookmark, to buy symmetry nobody reads.
 *
 * The prefix is a REWRITE, not a redirect (see `proxy.ts`): the browser keeps
 * `/zh/pricing` while Next renders `/pricing` with the locale passed down in a
 * header. So one route tree serves all three languages and no page moved.
 *
 * The bare paths still negotiate by cookie and `Accept-Language`, because that
 * is the right greeting for a human who typed the domain. It is safe alongside
 * the prefixed URLs only because each page names its own canonical: a crawler
 * indexes English at `/pricing` and Chinese at `/zh/pricing`, and `hreflang`
 * ties the set together. Without those tags the two would compete as duplicates.
 *
 * NOT EVERY PAGE. Only pages whose copy lives in the `site` bundle get a locale
 * URL. `/blog` and `/blog/[slug]` are database records written in one language:
 * serving the same English post at `/zh/blog/x` would promise a translation that
 * does not exist, which is worse for a reader than no Chinese URL at all.
 */

/** The path segment each non-default locale is served under. */
export const LOCALE_PREFIX: Partial<Record<SupportedLocale, string>> = {
  "zh-Hans": "zh",
  es: "es",
};

/** Reverse of `LOCALE_PREFIX`, for reading a path. */
const BY_PREFIX: Record<string, SupportedLocale> = Object.fromEntries(
  Object.entries(LOCALE_PREFIX).map(([locale, prefix]) => [prefix, locale as SupportedLocale]),
);

/**
 * Marketing paths that exist in all three languages.
 *
 * Explicit rather than derived from the route tree: a route existing is not a
 * promise that its copy is translated, and this list is what the sitemap
 * publishes and what `hreflang` claims. Adding a page here without translating
 * it advertises a translation that is not there.
 */
export const LOCALIZED_PATHS = [
  "/",
  "/features",
  "/pricing",
  "/faq",
  "/about",
  "/contact",
  "/contact/sales",
  "/privacy",
  "/terms",
] as const;

/**
 * Is this one of the paths published in all three languages?
 *
 * Load-bearing for security, not just for SEO. `proxy.ts` rewrites a
 * locale-prefixed URL and returns BEFORE its auth guards, so without this
 * check `/zh/home` would rewrite to `/home` and skip the dashboard
 * redirect — an auth bypass spelled with a language prefix.
 */
export function isLocalizedPath(path: string): boolean {
  return (LOCALIZED_PATHS as readonly string[]).includes(path);
}

/**
 * The locale an `Accept-Language` header asks for, or null.
 *
 * A copy of what `getServerLocale()` does with the same header, because the
 * proxy has to make the same judgement one layer earlier — before the render,
 * to decide whether this reader belongs on a prefixed URL — and the proxy
 * cannot call a `server-only` module.
 */
export function negotiateLocale(acceptLanguage: string | null): SupportedLocale | null {
  if (!acceptLanguage) return null;
  for (const entry of acceptLanguage.split(",")) {
    const tag = entry.split(";")[0]?.trim();
    if (!tag) continue;
    const resolved = resolveLocale(tag, SUPPORTED_LOCALES);
    if (resolved) return resolved;
  }
  return null;
}

/** Split a request path into its locale prefix and the path Next should render. */
export function splitLocalePath(pathname: string): {
  locale: SupportedLocale | null;
  path: string;
} {
  const m = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!m) return { locale: null, path: pathname };
  const locale = BY_PREFIX[m[1]];
  if (!locale) return { locale: null, path: pathname };
  // `/zh` alone is the Chinese homepage, so an empty remainder is "/".
  return { locale, path: m[2] && m[2] !== "/" ? m[2] : "/" };
}

/** The URL path a given unprefixed path is served at, in `locale`. */
export function localizedPath(path: string, locale: SupportedLocale): string {
  const prefix = LOCALE_PREFIX[locale];
  if (!prefix) return path;
  return path === "/" ? `/${prefix}` : `/${prefix}${path}`;
}

/**
 * `alternates` for one page's metadata: its own canonical, plus every language
 * it exists in.
 *
 * Canonical is per-PAGE and must stay that way. Setting it once on the
 * marketing layout would give every page the layout's canonical — Next merges
 * metadata down and never resets it — which is how a whole section ends up
 * collapsing onto one URL in the index.
 *
 * `x-default` points at the bare path: it is the URL that greets an unmatched
 * reader by negotiating, which is exactly what `x-default` is for.
 */
export function localeAlternates(
  path: string,
  locale: SupportedLocale,
  baseUrl: string,
): { canonical: string; languages: Record<string, string> } {
  const abs = (p: string) => `${baseUrl.replace(/\/$/, "")}${p === "/" ? "" : p}` || baseUrl;
  const languages: Record<string, string> = { "x-default": abs(path) };
  languages.en = abs(path);
  for (const [loc, prefix] of Object.entries(LOCALE_PREFIX)) {
    languages[hreflangTag(loc as SupportedLocale)] = abs(
      path === "/" ? `/${prefix}` : `/${prefix}${path}`,
    );
  }
  return { canonical: abs(localizedPath(path, locale)), languages };
}

/**
 * The `hreflang` value for a locale.
 *
 * `hreflang` takes a BCP-47 language tag, which `zh-Hans` already is — unlike
 * `og:locale`, which wants `zh_CN`. Two neighbouring tags, two different
 * formats, and neither errors when wrong; they just stop being understood.
 */
export function hreflangTag(locale: SupportedLocale): string {
  return locale;
}
