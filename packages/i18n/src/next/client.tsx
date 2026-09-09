"use client";

import i18n, { type Resource } from "i18next";
import { useRouter } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";

import type { Locale } from "../locales";
import type { Resources } from "../translator";

export type ClientI18nConfig<L extends Locale> = {
  cookieName: string;
  /** How long the locale cookie sticks around. One year by default, refreshed on each change. */
  cookieMaxAgeSeconds?: number;
  resources: Resources;
  namespaces: readonly string[];
  defaultLocale: L;
  supported: readonly L[];
  /**
   * Where to POST `{ locale }` so the choice survives outside this browser.
   * The cookie only exists here, so anything running without a request — an
   * overnight run, a cron, a digest — has no way to know the reader's language
   * without a durable copy. Omit for apps with nothing request-less to serve.
   */
  persistUrl?: string;
};

/**
 * Build the client half of one app's i18n: the i18next singleton, the cookie
 * writer, the `useSetLocale` hook and `<I18nProvider>`.
 *
 * Called once per app, at module scope in the app's `lib/i18n/client`. It binds
 * the DEFAULT i18next instance — the one `useTranslation()` reads through
 * `initReactI18next` — because two apps never share a process, and code that
 * imports `i18n` from "i18next" directly (for `i18n.language`) keeps working.
 */
export function createClientI18n<L extends Locale>(config: ClientI18nConfig<L>) {
  let initialized = false;
  const maxAge = config.cookieMaxAgeSeconds ?? 60 * 60 * 24 * 365;

  /**
   * Initialize the client-side i18next instance. Called by the top-level
   * `<I18nProvider>` with the server-resolved locale so the client matches
   * what SSR rendered, avoiding hydration flicker.
   *
   * Safe to call multiple times — subsequent calls just sync the language if
   * it changed.
   */
  function initClientI18n(initialLocale: L): typeof i18n {
    if (!initialized) {
      void i18n.use(initReactI18next).init({
        resources: config.resources as unknown as Resource,
        lng: initialLocale,
        fallbackLng: config.defaultLocale,
        supportedLngs: [...config.supported],
        defaultNS: "common",
        ns: [...config.namespaces],
        interpolation: { escapeValue: false },
        react: { useSuspense: false },
      });
      initialized = true;
    } else if (i18n.language !== initialLocale) {
      void i18n.changeLanguage(initialLocale);
    }
    return i18n;
  }

  /**
   * Fire-and-forget mirror of the pick to the server. Signed-out visitors get
   * a 401 and that is fine: the cookie has already done the visible work.
   */
  function persistLocale(locale: L): void {
    if (!config.persistUrl) return;
    void fetch(config.persistUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
      keepalive: true,
    }).catch(() => {});
  }

  /**
   * Persist the reader's language pick. Writes the cookie so SSR picks up the
   * choice on the next navigation, then flips the client instance so the
   * current page re-renders.
   */
  function setLocaleCookie(locale: L): void {
    if (typeof document === "undefined") return;
    const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    document.cookie = [
      `${config.cookieName}=${locale}`,
      "path=/",
      `max-age=${maxAge}`,
      "samesite=lax",
      isHttps ? "secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
    void i18n.changeLanguage(locale);
    persistLocale(locale);
  }

  /**
   * Flip the language for the WHOLE page, server-rendered parts included.
   *
   * `setLocaleCookie` only reaches client components: it swaps the live
   * i18next instance, so anything calling `useTranslation` re-renders, and
   * anything rendered on the server keeps the locale it was built with. On a
   * page that is mostly server-rendered that reads as a toggle that does
   * nothing at all; where the page mixes the two it reads worse — a Chinese
   * header over an English body.
   *
   * `router.refresh()` re-requests the RSC payload, which carries the cookie
   * that was just written, so the server half catches up in the same
   * interaction. It also re-runs the root layout, which is where `<html lang>`
   * is set.
   */
  function useSetLocale(): (locale: L) => void {
    const router = useRouter();
    return useCallback(
      (locale: L) => {
        setLocaleCookie(locale);
        router.refresh();
      },
      [router],
    );
  }

  /**
   * Drop this around any Client Component subtree that needs `t()`.
   *
   * The server determines the locale (cookie → Accept-Language → default) and
   * passes it down here so the client matches without a hydration mismatch.
   * Reads at mount time only — language changes after that flow through
   * `setLocaleCookie()`, which calls `i18n.changeLanguage()` and re-renders
   * subscribers.
   */
  function I18nProvider({ locale, children }: { locale: L; children: ReactNode }) {
    initClientI18n(locale);
    return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
  }

  return { i18n, initClientI18n, setLocaleCookie, useSetLocale, I18nProvider };
}
