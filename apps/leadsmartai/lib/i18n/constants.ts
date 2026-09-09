/**
 * The parts of the i18n config that carry no translations.
 *
 * `config.ts` imports every namespace for every locale — 1.9 MB of JSON —
 * and anything on the client that imported it for a cookie name or the
 * namespace list dragged all of that into the browser bundle: a 1.36 MB
 * script (472 KB gzipped) on every dashboard page, both languages, for a
 * reader who uses one. Client modules import from here; `config.ts` stays
 * server-side and re-exports these so its own callers are unchanged.
 */
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "@leadsmart/i18n";

export { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale };

export const I18N_COOKIE_NAME = "leadsmart_locale";

/** How long the locale cookie sticks around — one year, refreshed on each change. */
export const I18N_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const namespaces = [
  "common",
  "settings",
  "dashboard_nav",
  "dashboard",
  "web_posts",
  "web_generate_leads",
  "web_contacts",
  "web_marketing",
  "web_contacts_client",
  "web_generate_leads_clients",
  "web_landing",
  "web_about",
  "web_contact",
  "web_features",
  "web_for_brokerages",
  "web_help",
  "web_integrations",
  "web_pricing",
  "web_plans",
  "web_quick_post",
  "web_agent",
  "web_agent_pricing",
  "web_agent_compare",
  "web_agent_coaching",
  "web_home_value_estimator",
  "web_free_tools",
  // Copy for the public marketing, SEO and calculator pages. Split out of
  // `dashboard` (#1679): it was 607 KB of the 796 KB every page downloaded,
  // and 232 KB of that was article and calculator copy no signed-in screen
  // ever reads.
  "web_pages",
] as const;
export type WebNamespace = (typeof namespaces)[number];
