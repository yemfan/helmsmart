import "server-only";

import { cookies, headers } from "next/headers";

import { resolveLocale, type Locale } from "../locales";
import { createTranslator, type Resources, type Translate } from "../translator";

export type ServerI18nConfig<L extends Locale> = {
  /** The cookie the language picker writes. Per app, so two apps on one host never share a choice. */
  cookieName: string;
  resources: Resources;
  defaultLocale: L;
  /** The locales this app ships bundles for — what the picker offers and what the cookie may hold. */
  supported: readonly L[];
  /**
   * Request header carrying a locale the app's own proxy resolved from the URL
   * path, e.g. `/zh/pricing` -> "zh-Hans". Checked BEFORE the cookie, because a
   * locale in the URL is the most explicit request there is: somebody followed a
   * Chinese link, or a crawler asked for the Chinese page. A cookie from an
   * earlier visit must not override it, or a shared link would open in the
   * reader's own language and the URL would be a lie.
   *
   * Optional. An app with no locale-prefixed routes leaves it unset and
   * resolution is cookie -> Accept-Language exactly as before.
   */
  localeHeaderName?: string;
};

/**
 * Server-side locale resolution + `t()` for Server Components and Route
 * Handlers, bound to one app's resources and cookie.
 *
 * Order: the URL (via `localeHeaderName`, when the app sets one), then the
 * cookie, then Accept-Language, then the default. Cookie beats Accept-Language
 * so a reader who picked Chinese stays in Chinese on an English browser; the URL
 * beats the cookie so a link means what it says. The cookie is set client-side
 * after the language picker fires — see `setLocaleCookie()` from
 * `createClientI18n`.
 */
export function createServerI18n<L extends Locale>(config: ServerI18nConfig<L>) {
  const translatorFor = createTranslator(config);

  async function getServerLocale(): Promise<L> {
    const headerList = await headers();

    if (config.localeHeaderName) {
      const fromPath = resolveLocale(headerList.get(config.localeHeaderName), config.supported);
      if (fromPath) return fromPath;
    }

    const cookieStore = await cookies();
    const fromCookie = resolveLocale(cookieStore.get(config.cookieName)?.value, config.supported);
    if (fromCookie) return fromCookie;

    const accept = headerList.get("accept-language");
    if (accept) {
      // Accept-Language: "zh-CN,zh;q=0.9,en-US;q=0.8" — walk left-to-
      // right and pick the first tag we recognize.
      const tags = accept
        .split(",")
        .map((entry) => entry.split(";")[0]?.trim())
        .filter((tag): tag is string => Boolean(tag));
      for (const tag of tags) {
        const resolved = resolveLocale(tag, config.supported);
        if (resolved) return resolved;
      }
    }

    return config.defaultLocale;
  }

  /**
   * Synchronous `t()` for Server Components. We don't spin up an i18next
   * instance on the server — just key into the bundled resources directly.
   *
   * `defaultNs` mirrors `useTranslation(ns)` on the client: a component moved
   * from the hook to this translator keeps its bare `t("…")` calls, which
   * would otherwise resolve against "common", miss, and render the raw key
   * path on screen. Passing the namespace once here keeps every call site
   * correct — including the multi-line and option-bearing calls a per-call
   * `{ ns }` sweep silently skips.
   */
  async function getServerT(defaultNs = "common"): Promise<Translate> {
    return translatorFor(await getServerLocale(), defaultNs);
  }

  return { getServerLocale, getServerT, translatorFor };
}
