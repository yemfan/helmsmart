/**
 * Shared i18n configuration for the web app — used by both the
 * client-side init (`./client.ts`) and the server-side helper
 * (`./server.ts`) so the resource map and namespace list stay in
 * one place.
 */
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@leadsmart/i18n";

import enCommon from "@leadsmart/i18n/locale/en/common";
import enSettings from "@leadsmart/i18n/locale/en/settings";
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
import enWebQuickPost from "@leadsmart/i18n/locale/en/web_quick_post";
import enWebAgent from "@leadsmart/i18n/locale/en/web_agent";
import enWebAgentPricing from "@leadsmart/i18n/locale/en/web_agent_pricing";
import enWebAgentCompare from "@leadsmart/i18n/locale/en/web_agent_compare";
import enWebAgentCoaching from "@leadsmart/i18n/locale/en/web_agent_coaching";
import enWebHomeValueEstimator from "@leadsmart/i18n/locale/en/web_home_value_estimator";
import enWebFreeTools from "@leadsmart/i18n/locale/en/web_free_tools";
import zhCommon from "@leadsmart/i18n/locale/zh-Hans/common";
import zhSettings from "@leadsmart/i18n/locale/zh-Hans/settings";
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
import zhWebQuickPost from "@leadsmart/i18n/locale/zh-Hans/web_quick_post";
import zhWebAgent from "@leadsmart/i18n/locale/zh-Hans/web_agent";
import zhWebAgentPricing from "@leadsmart/i18n/locale/zh-Hans/web_agent_pricing";
import zhWebAgentCompare from "@leadsmart/i18n/locale/zh-Hans/web_agent_compare";
import zhWebAgentCoaching from "@leadsmart/i18n/locale/zh-Hans/web_agent_coaching";
import zhWebHomeValueEstimator from "@leadsmart/i18n/locale/zh-Hans/web_home_value_estimator";
import zhWebFreeTools from "@leadsmart/i18n/locale/zh-Hans/web_free_tools";

export const I18N_COOKIE_NAME = "leadsmart_locale";

/** How long the locale cookie sticks around — one year, refreshed on each change. */
export const I18N_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const namespaces = [
  "common",
  "settings",
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
  "web_quick_post",
  "web_agent",
  "web_agent_pricing",
  "web_agent_compare",
  "web_agent_coaching",
  "web_home_value_estimator",
  "web_free_tools",
] as const;
export type WebNamespace = (typeof namespaces)[number];

export const resources: Record<
  SupportedLocale,
  Record<WebNamespace, Record<string, unknown>>
> = {
  en: {
    common: enCommon,
    settings: enSettings,
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
    web_quick_post: enWebQuickPost,
    web_agent: enWebAgent,
    web_agent_pricing: enWebAgentPricing,
    web_agent_compare: enWebAgentCompare,
    web_agent_coaching: enWebAgentCoaching,
    web_home_value_estimator: enWebHomeValueEstimator,
    web_free_tools: enWebFreeTools,
  },
  "zh-Hans": {
    common: zhCommon,
    settings: zhSettings,
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
    web_quick_post: zhWebQuickPost,
    web_agent: zhWebAgent,
    web_agent_pricing: zhWebAgentPricing,
    web_agent_compare: zhWebAgentCompare,
    web_agent_coaching: zhWebAgentCoaching,
    web_home_value_estimator: zhWebHomeValueEstimator,
    web_free_tools: zhWebFreeTools,
  },
};

export { DEFAULT_LOCALE, SUPPORTED_LOCALES };
export type { SupportedLocale };
