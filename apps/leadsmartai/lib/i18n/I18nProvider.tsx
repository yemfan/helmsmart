"use client";

import { use } from "react";
import { usePathname } from "next/navigation";
import { I18nextProvider } from "react-i18next";

import type { SupportedLocale } from "@leadsmart/i18n";

import { i18n, initClientI18n } from "./client";
import { loadLocaleBundle } from "./localeBundle";
import { routeGroupFor } from "./routeGroups";

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
  children,
}: {
  locale: SupportedLocale;
  children: React.ReactNode;
}) {
  // The locale's bundles come from a code-split chunk, not a prop — see
  // ./localeBundle.ts for why. WHICH chunk depends on where we are: a
  // marketing page has no use for the dashboard's copy, and a dashboard page
  // none for the SEO articles. On the server this is settled before the first
  // request; in the browser it suspends hydration until the chunk (cached
  // after the first visit) arrives, and the server's HTML stays on screen.
  const resources = use(loadLocaleBundle(locale, routeGroupFor(usePathname())));
  initClientI18n(locale, resources);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
