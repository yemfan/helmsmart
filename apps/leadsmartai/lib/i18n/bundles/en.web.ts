/**
 * The English bundles a public route needs, and only those.
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
import enCommon from "@leadsmart/i18n/locale/en/common";
import enDashboardWeb from "@leadsmart/i18n/locale/en/dashboard_web";
import enDashboardNav from "@leadsmart/i18n/locale/en/dashboard_nav";
import enWebAbout from "@leadsmart/i18n/locale/en/web_about";
import enWebAgent from "@leadsmart/i18n/locale/en/web_agent";
import enWebAgentCoaching from "@leadsmart/i18n/locale/en/web_agent_coaching";
import enWebAgentCompare from "@leadsmart/i18n/locale/en/web_agent_compare";
import enWebContact from "@leadsmart/i18n/locale/en/web_contact";
import enWebFeatures from "@leadsmart/i18n/locale/en/web_features";
import enWebForBrokerages from "@leadsmart/i18n/locale/en/web_for_brokerages";
import enWebFreeTools from "@leadsmart/i18n/locale/en/web_free_tools";
import enWebHelp from "@leadsmart/i18n/locale/en/web_help";
import enWebHomeValueEstimator from "@leadsmart/i18n/locale/en/web_home_value_estimator";
import enWebIntegrations from "@leadsmart/i18n/locale/en/web_integrations";
import enWebLanding from "@leadsmart/i18n/locale/en/web_landing";
import enWebMarketing from "@leadsmart/i18n/locale/en/web_marketing";
import enWebPages from "@leadsmart/i18n/locale/en/web_pages";
import enWebPlans from "@leadsmart/i18n/locale/en/web_plans";

const bundle: Record<string, Record<string, unknown>> = {
  common: enCommon,
  // The public slice of `dashboard`, under the same name. Public pages read
  // a little of it — the logo tagline, the signup and lead-capture modals,
  // the cookie banner, the editorial landing — about 80 KB of 364 KB. Naming
  // it `dashboard` means no component has to know which group it is in;
  // react-i18next will not fall through a namespace list, so it could not
  // name both anyway. `routeGroups.test.ts` proves the slice is sufficient.
  dashboard: enDashboardWeb,
  dashboard_nav: enDashboardNav,
  web_about: enWebAbout,
  web_agent: enWebAgent,
  web_agent_coaching: enWebAgentCoaching,
  web_agent_compare: enWebAgentCompare,
  web_contact: enWebContact,
  web_features: enWebFeatures,
  web_for_brokerages: enWebForBrokerages,
  web_free_tools: enWebFreeTools,
  web_help: enWebHelp,
  web_home_value_estimator: enWebHomeValueEstimator,
  web_integrations: enWebIntegrations,
  web_landing: enWebLanding,
  web_marketing: enWebMarketing,
  web_pages: enWebPages,
  web_plans: enWebPlans,
};

export default bundle;
