/**
 * The Simplified Chinese bundles a public route needs, and only those.
 *
 * `localeBundle.ts` imports this with `import()`, so the bundler emits one
 * hashed, immutable chunk per locale per route group. Every page used to load
 * all 26 namespaces — 904 KB of translations, three quarters of it the
 * `dashboard` namespace that no public page reads (2026-09-09).
 *
 * Generated shape, hand-maintained list: add a namespace here when a client
 * component under this group starts using one. `routeGroups.test.ts` walks the
 * import graph from every route entry point and fails if a client component
 * can reach a namespace its group does not carry.
 */
import zhCommon from "@leadsmart/i18n/locale/zh-Hans/common";
import zhDashboardWeb from "@leadsmart/i18n/locale/zh-Hans/dashboard_web";
import zhDashboardNav from "@leadsmart/i18n/locale/zh-Hans/dashboard_nav";
import zhWebAbout from "@leadsmart/i18n/locale/zh-Hans/web_about";
import zhWebAgent from "@leadsmart/i18n/locale/zh-Hans/web_agent";
import zhWebAgentCoaching from "@leadsmart/i18n/locale/zh-Hans/web_agent_coaching";
import zhWebAgentCompare from "@leadsmart/i18n/locale/zh-Hans/web_agent_compare";
import zhWebContact from "@leadsmart/i18n/locale/zh-Hans/web_contact";
import zhWebFeatures from "@leadsmart/i18n/locale/zh-Hans/web_features";
import zhWebForBrokerages from "@leadsmart/i18n/locale/zh-Hans/web_for_brokerages";
import zhWebFreeTools from "@leadsmart/i18n/locale/zh-Hans/web_free_tools";
import zhWebHelp from "@leadsmart/i18n/locale/zh-Hans/web_help";
import zhWebHomeValueEstimator from "@leadsmart/i18n/locale/zh-Hans/web_home_value_estimator";
import zhWebIntegrations from "@leadsmart/i18n/locale/zh-Hans/web_integrations";
import zhWebLanding from "@leadsmart/i18n/locale/zh-Hans/web_landing";
import zhWebMarketing from "@leadsmart/i18n/locale/zh-Hans/web_marketing";
import zhWebPages from "@leadsmart/i18n/locale/zh-Hans/web_pages";
import zhWebPlans from "@leadsmart/i18n/locale/zh-Hans/web_plans";

const bundle: Record<string, Record<string, unknown>> = {
  common: zhCommon,
  // The public slice of `dashboard`, under the same name. Public pages read
  // a little of it — the logo tagline, the signup and lead-capture modals,
  // the cookie banner, the editorial landing — about 80 KB of 364 KB. Naming
  // it `dashboard` means no component has to know which group it is in;
  // react-i18next will not fall through a namespace list, so it could not
  // name both anyway. `routeGroups.test.ts` proves the slice is sufficient.
  dashboard: zhDashboardWeb,
  dashboard_nav: zhDashboardNav,
  web_about: zhWebAbout,
  web_agent: zhWebAgent,
  web_agent_coaching: zhWebAgentCoaching,
  web_agent_compare: zhWebAgentCompare,
  web_contact: zhWebContact,
  web_features: zhWebFeatures,
  web_for_brokerages: zhWebForBrokerages,
  web_free_tools: zhWebFreeTools,
  web_help: zhWebHelp,
  web_home_value_estimator: zhWebHomeValueEstimator,
  web_integrations: zhWebIntegrations,
  web_landing: zhWebLanding,
  web_marketing: zhWebMarketing,
  web_pages: zhWebPages,
  web_plans: zhWebPlans,
};

export default bundle;
