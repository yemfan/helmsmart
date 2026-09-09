"use client";

import { createClientI18n } from "@leadsmart/i18n/next/client";

import {
  DEFAULT_LOCALE,
  I18N_COOKIE_MAX_AGE_SECONDS,
  I18N_COOKIE_NAME,
  SUPPORTED_LOCALES,
  namespaces,
  resources,
} from "./config";

/**
 * The client half of HelmSmart i18n, bound to its cookie and bundles.
 *
 * - `<I18nProvider locale>` — wraps the root layout's children with the
 *   server-resolved locale so hydration matches SSR.
 * - `useSetLocale()` — writes `helmsmart_locale`, flips the live i18next
 *   instance, POSTs the durable copy to `/api/me/ui-locale`, and
 *   `router.refresh()`es so Server Components (and `<html lang>`) catch up.
 *
 * Components read copy with `useTranslation("<namespace>")` from
 * react-i18next, exactly as CloseBoss does.
 */
export const { i18n, initClientI18n, setLocaleCookie, useSetLocale, I18nProvider } =
  createClientI18n({
    cookieName: I18N_COOKIE_NAME,
    cookieMaxAgeSeconds: I18N_COOKIE_MAX_AGE_SECONDS,
    resources,
    namespaces,
    defaultLocale: DEFAULT_LOCALE,
    supported: SUPPORTED_LOCALES,
    persistUrl: "/api/me/ui-locale",
  });
