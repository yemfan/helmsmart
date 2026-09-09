/**
 * Shared i18n contract — locale codes, resolution helpers and the pure
 * translation core used by `apps/leadsmartai` (web), `apps/leadsmart-mobile`
 * (Expo) and `apps/helmsmart-web`.
 *
 * WHAT LIVES HERE. Everything about translating that does not depend on a
 * framework: the locale list, key resolution (with plurals), the explicit-
 * locale translator factory, the AI language directives, the `Intl` tag map
 * and the nav-tree translator. The Next-bound halves — cookies, headers, the
 * i18next client instance, the provider — are factories under
 * `@leadsmart/i18n/next/server` and `@leadsmart/i18n/next/client`, so each
 * app configures them once with its own cookie name and resources.
 *
 * Translation strings themselves live as JSON files. CloseBoss and mobile
 * keep theirs under `packages/i18n/locales/<code>/<namespace>.json` (they are
 * shared between web and mobile); HelmSmart keeps its own under
 * `apps/helmsmart-web/messages/`. Each app's config module imports its JSONs
 * directly:
 *
 *   import enCommon from "@leadsmart/i18n/locale/en/common";
 *   import zhCommon from "@leadsmart/i18n/locale/zh-Hans/common";
 *
 * Namespaces (CloseBoss + mobile set):
 *   - common        Shared verbs / status / errors used everywhere
 *   - settings      Settings screens (mobile + web)
 *   - nav           Tab bar + navigation labels (mobile)
 *   - home          Mobile Home screen
 *   - quick_post    Mobile Quick Post wizard
 *   - leads             Mobile Leads list tab
 *   - lead_detail       Mobile Lead detail screen (/lead/[id])
 *   - lead_components   Embedded lead detail components
 *   - task_calendar_components
 *                       Task + Calendar + BookingLink cards and composer modals
 *   - reply_composer    SMS ReplyComposer, EmailReplyModal, AI draft button
 *   - inbox             Mobile Inbox tab (thread list)
 *   - calendar_screen   Mobile Calendar tab parent
 *   - showings_screen   Mobile Showings list + detail
 *   - sphere_screen     Mobile Sphere screen
 *   - mobile_misc_screens
 *                       Small standalone mobile screens
 *   - web_*             Web-only namespaces, one per public page or dashboard
 *                       surface; see `apps/leadsmartai/lib/i18n/config.ts`
 *
 * Future namespaces follow the same pattern — add a JSON file pair
 * (en + zh-Hans) and reference it from the app's resources map.
 */
export {
  ALL_LOCALES,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  resolveLocale,
  localeDisplayName,
  localeShortLabel,
  type Locale,
  type SupportedLocale,
} from "./locales";

export {
  resolveKey,
  lookupString,
  interpolate,
  pluralCandidates,
  type Bundle,
  type ResolveInput,
} from "./resolveKey";

export {
  createTranslator,
  type Resources,
  type Translate,
  type TranslateOptions,
  type TranslatorConfig,
} from "./translator";

export {
  LANGUAGE_NAMES,
  makeLanguageDirectives,
  type DirectiveWording,
  type LanguageDirectives,
} from "./languageDirective";

export { intlLocale } from "./intl";
export { translateNavSections } from "./nav";

/**
 * Canonical namespace identifiers for the CloseBoss + mobile bundles. Keep in
 * sync with the JSON files under locales/<code>/. Adding a new namespace: add
 * the literal here + the JSON file pair, and i18next will pick it up when the
 * app reinitializes.
 */
export const NAMESPACES = [
  "common",
  "settings",
  "nav",
  "home",
  "quick_post",
  "leads",
  "lead_detail",
  "lead_components",
  "task_calendar_components",
  "reply_composer",
  "inbox",
  "calendar_screen",
  "showings_screen",
  "sphere_screen",
  "mobile_misc_screens",
  "web_posts",
  "web_generate_leads",
  "web_contacts",
  "web_marketing",
  "web_contacts_client",
  "web_generate_leads_clients",
  "web_landing",
  "web_about",
  "web_pricing",
  "web_quick_post",
] as const;
export type Namespace = (typeof NAMESPACES)[number];
