/**
 * Every English bundle the web app ships, keyed by namespace.
 *
 * Its own module on purpose: `lib/i18n/localeBundle.ts` imports it with
 * `import()`, so the bundler emits it as one hashed, cacheable chunk per
 * locale. Passed as a prop from the root layout it was serialised into every
 * page's React payload instead — 733 KB of the 830 KB document, sent again
 * on every full load (2026-09-08).
 */
import enCommon from "@leadsmart/i18n/locale/en/common";
import enSettings from "@leadsmart/i18n/locale/en/settings";
import enDashboardNav from "@leadsmart/i18n/locale/en/dashboard_nav";
import enDashboard from "@leadsmart/i18n/locale/en/dashboard";
import enWebContacts from "@leadsmart/i18n/locale/en/web_contacts";
import enWebContactsClient from "@leadsmart/i18n/locale/en/web_contacts_client";
import enWebGenerateLeads from "@leadsmart/i18n/locale/en/web_generate_leads";
import enWebAbout from "@leadsmart/i18n/locale/en/web_about";
import enWebContact from "@leadsmart/i18n/locale/en/web_contact";
import enWebFeatures from "@leadsmart/i18n/locale/en/web_features";
import enWebForBrokerages from "@leadsmart/i18n/locale/en/web_for_brokerages";
import enWebHelp from "@leadsmart/i18n/locale/en/web_help";
import enWebIntegrations from "@leadsmart/i18n/locale/en/web_integrations";
import enWebGenerateLeadsClients from "@leadsmart/i18n/locale/en/web_generate_leads_clients";
import enWebLanding from "@leadsmart/i18n/locale/en/web_landing";
import enWebMarketing from "@leadsmart/i18n/locale/en/web_marketing";
import enWebPosts from "@leadsmart/i18n/locale/en/web_posts";
import enWebPricing from "@leadsmart/i18n/locale/en/web_pricing";
import enWebPlans from "@leadsmart/i18n/locale/en/web_plans";
import enWebQuickPost from "@leadsmart/i18n/locale/en/web_quick_post";
import enWebAgent from "@leadsmart/i18n/locale/en/web_agent";
import enWebAgentPricing from "@leadsmart/i18n/locale/en/web_agent_pricing";
import enWebAgentCompare from "@leadsmart/i18n/locale/en/web_agent_compare";
import enWebAgentCoaching from "@leadsmart/i18n/locale/en/web_agent_coaching";
import enWebHomeValueEstimator from "@leadsmart/i18n/locale/en/web_home_value_estimator";
import enWebFreeTools from "@leadsmart/i18n/locale/en/web_free_tools";
import enWebPages from "@leadsmart/i18n/locale/en/web_pages";

import type { WebNamespace } from "../constants";

const bundle: Record<WebNamespace, Record<string, unknown>> = {
  common: enCommon,
  settings: enSettings,
  dashboard_nav: enDashboardNav,
  dashboard: enDashboard,
  web_posts: enWebPosts,
  web_generate_leads: enWebGenerateLeads,
  web_contacts: enWebContacts,
  web_marketing: enWebMarketing,
  web_contacts_client: enWebContactsClient,
  web_generate_leads_clients: enWebGenerateLeadsClients,
  web_landing: enWebLanding,
  web_about: enWebAbout,
  web_contact: enWebContact,
  web_features: enWebFeatures,
  web_for_brokerages: enWebForBrokerages,
  web_help: enWebHelp,
  web_integrations: enWebIntegrations,
  web_pricing: enWebPricing,
  web_plans: enWebPlans,
  web_quick_post: enWebQuickPost,
  web_agent: enWebAgent,
  web_agent_pricing: enWebAgentPricing,
  web_agent_compare: enWebAgentCompare,
  web_agent_coaching: enWebAgentCoaching,
  web_home_value_estimator: enWebHomeValueEstimator,
  web_free_tools: enWebFreeTools,
  web_pages: enWebPages,
};

export default bundle;
