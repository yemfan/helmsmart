/**
 * Every Simplified Chinese bundle the web app ships, keyed by namespace.
 *
 * Its own module on purpose: `lib/i18n/localeBundle.ts` imports it with
 * `import()`, so the bundler emits it as one hashed, cacheable chunk per
 * locale. Passed as a prop from the root layout it was serialised into every
 * page's React payload instead — 733 KB of the 830 KB document, sent again
 * on every full load (2026-09-08).
 */
import zhCommon from "@leadsmart/i18n/locale/zh-Hans/common";
import zhSettings from "@leadsmart/i18n/locale/zh-Hans/settings";
import zhDashboardNav from "@leadsmart/i18n/locale/zh-Hans/dashboard_nav";
import zhDashboard from "@leadsmart/i18n/locale/zh-Hans/dashboard";
import zhWebAbout from "@leadsmart/i18n/locale/zh-Hans/web_about";
import zhWebContact from "@leadsmart/i18n/locale/zh-Hans/web_contact";
import zhWebFeatures from "@leadsmart/i18n/locale/zh-Hans/web_features";
import zhWebForBrokerages from "@leadsmart/i18n/locale/zh-Hans/web_for_brokerages";
import zhWebHelp from "@leadsmart/i18n/locale/zh-Hans/web_help";
import zhWebIntegrations from "@leadsmart/i18n/locale/zh-Hans/web_integrations";
import zhWebContacts from "@leadsmart/i18n/locale/zh-Hans/web_contacts";
import zhWebContactsClient from "@leadsmart/i18n/locale/zh-Hans/web_contacts_client";
import zhWebGenerateLeads from "@leadsmart/i18n/locale/zh-Hans/web_generate_leads";
import zhWebGenerateLeadsClients from "@leadsmart/i18n/locale/zh-Hans/web_generate_leads_clients";
import zhWebLanding from "@leadsmart/i18n/locale/zh-Hans/web_landing";
import zhWebMarketing from "@leadsmart/i18n/locale/zh-Hans/web_marketing";
import zhWebPosts from "@leadsmart/i18n/locale/zh-Hans/web_posts";
import zhWebPricing from "@leadsmart/i18n/locale/zh-Hans/web_pricing";
import zhWebPlans from "@leadsmart/i18n/locale/zh-Hans/web_plans";
import zhWebQuickPost from "@leadsmart/i18n/locale/zh-Hans/web_quick_post";
import zhWebAgent from "@leadsmart/i18n/locale/zh-Hans/web_agent";
import zhWebAgentPricing from "@leadsmart/i18n/locale/zh-Hans/web_agent_pricing";
import zhWebAgentCompare from "@leadsmart/i18n/locale/zh-Hans/web_agent_compare";
import zhWebAgentCoaching from "@leadsmart/i18n/locale/zh-Hans/web_agent_coaching";
import zhWebHomeValueEstimator from "@leadsmart/i18n/locale/zh-Hans/web_home_value_estimator";
import zhWebFreeTools from "@leadsmart/i18n/locale/zh-Hans/web_free_tools";

import type { WebNamespace } from "../constants";

const bundle: Record<WebNamespace, Record<string, unknown>> = {
  common: zhCommon,
  settings: zhSettings,
  dashboard_nav: zhDashboardNav,
  dashboard: zhDashboard,
  web_posts: zhWebPosts,
  web_generate_leads: zhWebGenerateLeads,
  web_contacts: zhWebContacts,
  web_marketing: zhWebMarketing,
  web_contacts_client: zhWebContactsClient,
  web_generate_leads_clients: zhWebGenerateLeadsClients,
  web_landing: zhWebLanding,
  web_about: zhWebAbout,
  web_contact: zhWebContact,
  web_features: zhWebFeatures,
  web_for_brokerages: zhWebForBrokerages,
  web_help: zhWebHelp,
  web_integrations: zhWebIntegrations,
  web_pricing: zhWebPricing,
  web_plans: zhWebPlans,
  web_quick_post: zhWebQuickPost,
  web_agent: zhWebAgent,
  web_agent_pricing: zhWebAgentPricing,
  web_agent_compare: zhWebAgentCompare,
  web_agent_coaching: zhWebAgentCoaching,
  web_home_value_estimator: zhWebHomeValueEstimator,
  web_free_tools: zhWebFreeTools,
};

export default bundle;
