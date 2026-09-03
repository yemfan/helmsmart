"use client";

import i18n, { type Resource } from "i18next";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { initReactI18next } from "react-i18next";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "@leadsmart/i18n";

import {
  I18N_COOKIE_MAX_AGE_SECONDS,
  I18N_COOKIE_NAME,
  namespaces,
  resources,
} from "./config";

let initialized = false;

/**
 * Initialize the client-side i18next instance. Called by the
 * top-level `<I18nProvider>` with the server-resolved locale so
 * the client matches what SSR rendered, avoiding hydration flicker.
 *
 * Safe to call multiple times — subsequent calls just sync the
 * language if it changed.
 */
export function initClientI18n(initialLocale: SupportedLocale): typeof i18n {
  if (!initialized) {
    void i18n.use(initReactI18next).init({
      resources: resources as unknown as Resource,
      lng: initialLocale,
      fallbackLng: DEFAULT_LOCALE,
      supportedLngs: [...SUPPORTED_LOCALES],
      defaultNS: "common",
      ns: [...namespaces],
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
 * Persist the agent's language pick. Writes the cookie so SSR
 * picks up the choice on the next navigation, then flips the
 * client instance so the current page re-renders.
 */
/**
 * Mirror the pick into `user_profiles.ui_language`.
 *
 * The cookie only exists inside this browser, so anything running without a
 * request — the overnight Boss run, the instruction cron, every scheduled
 * generator — had no way to know the agent reads Chinese, and wrote English
 * into a Chinese dashboard. See `app/api/dashboard/ui-language/route.ts`.
 *
 * Fire-and-forget: signed-out visitors get a 401 and that is fine, the cookie
 * has already done the visible work.
 */
function persistLocale(locale: SupportedLocale): void {
  void fetch("/api/dashboard/ui-language", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
    keepalive: true,
  }).catch(() => {});
}

export function setLocaleCookie(locale: SupportedLocale): void {
  if (typeof document === "undefined") return;
  const maxAge = I18N_COOKIE_MAX_AGE_SECONDS;
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = [
    `${I18N_COOKIE_NAME}=${locale}`,
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
 * {@link setLocaleCookie} only reaches client components: it swaps the live
 * i18next instance, so anything calling `useTranslation` re-renders, and
 * anything rendered on the server keeps the locale it was built with. On a page
 * that is mostly server-rendered — the demo workspace, most marketing routes —
 * that reads as a toggle that does nothing at all. Where the page mixes the
 * two, it reads worse: a Chinese header over an English body, or one sentence
 * split down the middle ("This week · 5 upcoming events · 4 笔进行中的交易").
 *
 * `router.refresh()` re-requests the RSC payload, which carries the cookie that
 * was just written, so the server half catches up in the same interaction. It
 * also re-runs the root layout, which is where `<html lang>` is set.
 */
export function useSetLocale(): (locale: SupportedLocale) => void {
  const router = useRouter();
  return useCallback(
    (locale: SupportedLocale) => {
      setLocaleCookie(locale);
      router.refresh();
    },
    [router],
  );
}

export { i18n };
