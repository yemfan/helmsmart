"use client";

import { I18nextProvider } from "react-i18next";

import type { SupportedLocale } from "@leadsmart/i18n";

import { i18n, initClientI18n, type LocaleResources } from "./client";

/**
 * Drop this around any Client Component subtree that needs `t()`.
 *
 * The server determines the locale (cookie → Accept-Language →
 * default) and passes it down here so the client matches without
 * a hydration mismatch. Reads at mount time only — language
 * changes after that flow through `setLocaleCookie()` which calls
 * `i18n.changeLanguage()` and re-renders subscribers.
 */
export function I18nProvider({
  locale,
  resources,
  children,
}: {
  locale: SupportedLocale;
  /** That locale's bundles only, from `resourcesForLocale` on the server. */
  resources: LocaleResources;
  children: React.ReactNode;
}) {
  initClientI18n(locale, resources);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
