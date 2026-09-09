/**
 * The Simplified Chinese bundles a signed-in route needs, and only those.
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
import zhDashboard from "@leadsmart/i18n/locale/zh-Hans/dashboard";
import zhDashboardNav from "@leadsmart/i18n/locale/zh-Hans/dashboard_nav";
import zhSettings from "@leadsmart/i18n/locale/zh-Hans/settings";
import zhWebContacts from "@leadsmart/i18n/locale/zh-Hans/web_contacts";
import zhWebContactsClient from "@leadsmart/i18n/locale/zh-Hans/web_contacts_client";
import zhWebGenerateLeads from "@leadsmart/i18n/locale/zh-Hans/web_generate_leads";
import zhWebGenerateLeadsClients from "@leadsmart/i18n/locale/zh-Hans/web_generate_leads_clients";
import zhWebMarketing from "@leadsmart/i18n/locale/zh-Hans/web_marketing";
import zhWebPlans from "@leadsmart/i18n/locale/zh-Hans/web_plans";
import zhWebPosts from "@leadsmart/i18n/locale/zh-Hans/web_posts";
import zhWebQuickPost from "@leadsmart/i18n/locale/zh-Hans/web_quick_post";

const bundle: Record<string, Record<string, unknown>> = {
  common: zhCommon,
  dashboard: zhDashboard,
  dashboard_nav: zhDashboardNav,
  settings: zhSettings,
  web_contacts: zhWebContacts,
  web_contacts_client: zhWebContactsClient,
  web_generate_leads: zhWebGenerateLeads,
  web_generate_leads_clients: zhWebGenerateLeadsClients,
  web_marketing: zhWebMarketing,
  web_plans: zhWebPlans,
  web_posts: zhWebPosts,
  web_quick_post: zhWebQuickPost,
};

export default bundle;
