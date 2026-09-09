import "server-only";

import { createServerI18n } from "@leadsmart/i18n/next/server";

import {
  DEFAULT_LOCALE,
  I18N_COOKIE_NAME,
  SUPPORTED_LOCALES,
  resources,
} from "./config";

/**
 * Server-side locale + `t()` for Server Components and Route Handlers.
 *
 *   const t = await getServerT("settings");
 *   <h1>{t("title")}</h1>
 *
 * Resolution: cookie → Accept-Language → English. A key resolves locale →
 * `defaultValue` → English → the key itself (loud, on purpose — a key in NO
 * bundle is a bug, a key missing from one bundle is not). Plurals work the
 * same way they do in `useTranslation`: `t("items", { count })` picks
 * `items_one` / `items_other`.
 *
 * `translatorFor(locale, ns)` is the request-free variant for crons and
 * email renderers; pair it with `userUiLocale()` from `./userLocale`.
 */
export const { getServerLocale, getServerT, translatorFor } = createServerI18n({
  cookieName: I18N_COOKIE_NAME,
  resources,
  defaultLocale: DEFAULT_LOCALE,
  supported: SUPPORTED_LOCALES,
});
