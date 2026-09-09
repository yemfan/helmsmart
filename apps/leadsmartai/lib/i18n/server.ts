import "server-only";

import { createServerI18n } from "@leadsmart/i18n/next/server";

import {
  DEFAULT_LOCALE,
  I18N_COOKIE_NAME,
  SUPPORTED_LOCALES,
  resources,
} from "./config";

/**
 * Server-side locale resolution for Server Components + Route Handlers.
 *
 * Cookie wins over the Accept-Language header so an agent who manually picked
 * Chinese stays in Chinese even when their browser default is English. The
 * cookie is set client-side after the language picker fires — see
 * `setLocaleCookie()` in `./client.ts`.
 *
 * `getServerT(defaultNs)` is a synchronous `t()` for Server Components: no
 * i18next instance on the server, just a keyed lookup into the bundled
 * resources with the order locale → `defaultValue` → English → key. The
 * order, plurals and interpolation live in the shared package
 * (`resolveKey`), where they are unit-tested; this module only binds the
 * CloseBoss cookie and bundles.
 */
export const { getServerLocale, getServerT } = createServerI18n({
  cookieName: I18N_COOKIE_NAME,
  resources,
  defaultLocale: DEFAULT_LOCALE,
  supported: SUPPORTED_LOCALES,
});
