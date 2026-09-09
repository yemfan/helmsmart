/**
 * The English bundles a signed-in route needs, and only those.
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
import enDashboard from "@leadsmart/i18n/locale/en/dashboard";
import enDashboardNav from "@leadsmart/i18n/locale/en/dashboard_nav";
import enSettings from "@leadsmart/i18n/locale/en/settings";
import enWebContacts from "@leadsmart/i18n/locale/en/web_contacts";
import enWebContactsClient from "@leadsmart/i18n/locale/en/web_contacts_client";
import enWebGenerateLeads from "@leadsmart/i18n/locale/en/web_generate_leads";
import enWebGenerateLeadsClients from "@leadsmart/i18n/locale/en/web_generate_leads_clients";
import enWebMarketing from "@leadsmart/i18n/locale/en/web_marketing";
import enWebPlans from "@leadsmart/i18n/locale/en/web_plans";
import enWebPosts from "@leadsmart/i18n/locale/en/web_posts";
import enWebQuickPost from "@leadsmart/i18n/locale/en/web_quick_post";

const bundle: Record<string, Record<string, unknown>> = {
  common: enCommon,
  dashboard: enDashboard,
  dashboard_nav: enDashboardNav,
  settings: enSettings,
  web_contacts: enWebContacts,
  web_contacts_client: enWebContactsClient,
  web_generate_leads: enWebGenerateLeads,
  web_generate_leads_clients: enWebGenerateLeadsClients,
  web_marketing: enWebMarketing,
  web_plans: enWebPlans,
  web_posts: enWebPosts,
  web_quick_post: enWebQuickPost,
};

export default bundle;
