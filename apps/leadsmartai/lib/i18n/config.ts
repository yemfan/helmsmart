/**
 * Server-side i18n configuration for the web app: the full resource map
 * `./server.ts` translates from. The browser does not import this — it
 * loads one locale's bundle on demand through `./localeBundle.ts`.
 */
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@leadsmart/i18n";

import enBundle from "./bundles/en";
import zhBundle from "./bundles/zh-Hans";

export {
  I18N_COOKIE_NAME,
  I18N_COOKIE_MAX_AGE_SECONDS,
  namespaces,
  type WebNamespace,
} from "./constants";
import { namespaces, type WebNamespace } from "./constants";

export const resources: Record<
  SupportedLocale,
  Record<WebNamespace, Record<string, unknown>>
> = {
  en: enBundle,
  "zh-Hans": zhBundle,
};

export { DEFAULT_LOCALE, SUPPORTED_LOCALES };
export type { SupportedLocale };
