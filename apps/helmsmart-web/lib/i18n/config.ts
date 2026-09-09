/**
 * HelmSmart i18n configuration — the one place that names the cookie, the
 * locales this app ships, its namespaces and its bundles. Both the server
 * half (`./server.ts`) and the client half (`./client.tsx`) are built from
 * this by the shared factories in `@leadsmart/i18n`, so the two never
 * disagree about what a key resolves to.
 *
 * LOCALES. `SUPPORTED_LOCALES` is what the picker offers and what the cookie
 * may hold. `es` is known to the shared contract (directives, Intl tags,
 * `resolveLocale`) and joins this list only when `messages/es/*` exists and
 * passes the parity guard — a picker offering Spanish that renders English
 * is worse than one that does not offer it.
 *
 * NAMESPACES. One per product surface, small enough to translate in one
 * sitting each, so a page can opt in without waiting for the whole app:
 *
 *   common     shared verbs and statuses — the package's `common` (already
 *              in zh-Hans) overlaid with this app's own additions
 *   nav        sidebar, settings tabs, books sub-nav, account menu
 *   settings   the Settings page and every settings form
 *   auth       login, signup, forgot/reset password, accept invite, onboarding
 *   home       Home, Command Center, Insights
 *   inbox      Inbox + compose
 *   clients    Clients list, detail, statement, import
 *   tasks      Tasks + Calendar
 *   pipeline   Pipeline
 *   projects   Projects + Timesheets
 *   workflows  Workflows + Automations
 *   voice      AI Receptionist, AI Client Assistant, Reception
 *   marketing  Marketing, Social, Forms, Google Business
 *   books      Invoices, Quotes, Bills, Expenses, Reports, Journal, Aging, Vendors, 1099
 *   site       public marketing pages, metadata, footer
 *   emails     owner-facing email subjects and bodies
 *   errors     server-action error strings, returned as keys
 */
import {
  DEFAULT_LOCALE,
  type Locale,
} from "@leadsmart/i18n";

import pkgEnCommon from "@leadsmart/i18n/locale/en/common";
import pkgZhCommon from "@leadsmart/i18n/locale/zh-Hans/common";

import enCommon from "@/messages/en/common.json";
import enNav from "@/messages/en/nav.json";
import enSettings from "@/messages/en/settings.json";
import enAuth from "@/messages/en/auth.json";
import enHome from "@/messages/en/home.json";
import enInbox from "@/messages/en/inbox.json";
import enClients from "@/messages/en/clients.json";
import enTasks from "@/messages/en/tasks.json";
import enPipeline from "@/messages/en/pipeline.json";
import enProjects from "@/messages/en/projects.json";
import enWorkflows from "@/messages/en/workflows.json";
import enVoice from "@/messages/en/voice.json";
import enMarketing from "@/messages/en/marketing.json";
import enBooks from "@/messages/en/books.json";
import enSite from "@/messages/en/site.json";
import enEmails from "@/messages/en/emails.json";
import enErrors from "@/messages/en/errors.json";

import zhCommon from "@/messages/zh-Hans/common.json";
import zhNav from "@/messages/zh-Hans/nav.json";
import zhSettings from "@/messages/zh-Hans/settings.json";
import zhAuth from "@/messages/zh-Hans/auth.json";
import zhHome from "@/messages/zh-Hans/home.json";
import zhInbox from "@/messages/zh-Hans/inbox.json";
import zhClients from "@/messages/zh-Hans/clients.json";
import zhTasks from "@/messages/zh-Hans/tasks.json";
import zhPipeline from "@/messages/zh-Hans/pipeline.json";
import zhProjects from "@/messages/zh-Hans/projects.json";
import zhWorkflows from "@/messages/zh-Hans/workflows.json";
import zhVoice from "@/messages/zh-Hans/voice.json";
import zhMarketing from "@/messages/zh-Hans/marketing.json";
import zhBooks from "@/messages/zh-Hans/books.json";
import zhSite from "@/messages/zh-Hans/site.json";
import zhEmails from "@/messages/zh-Hans/emails.json";
import zhErrors from "@/messages/zh-Hans/errors.json";

export const I18N_COOKIE_NAME = "helmsmart_locale";

/** How long the locale cookie sticks around — one year, refreshed on each change. */
export const I18N_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const SUPPORTED_LOCALES = ["en", "zh-Hans"] as const satisfies readonly Locale[];
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export { DEFAULT_LOCALE };

export const namespaces = [
  "common",
  "nav",
  "settings",
  "auth",
  "home",
  "inbox",
  "clients",
  "tasks",
  "pipeline",
  "projects",
  "workflows",
  "voice",
  "marketing",
  "books",
  "site",
  "emails",
  "errors",
] as const;
export type AppNamespace = (typeof namespaces)[number];

type Bundle = Record<string, unknown>;

export const resources: Record<SupportedLocale, Record<AppNamespace, Bundle>> = {
  en: {
    // The package's generic verbs first, then this app's own — an app key
    // wins on a clash, and `app_name` always has to.
    common: { ...pkgEnCommon, ...enCommon, app_name: "HelmSmart" },
    nav: enNav,
    settings: enSettings,
    auth: enAuth,
    home: enHome,
    inbox: enInbox,
    clients: enClients,
    tasks: enTasks,
    pipeline: enPipeline,
    projects: enProjects,
    workflows: enWorkflows,
    voice: enVoice,
    marketing: enMarketing,
    books: enBooks,
    site: enSite,
    emails: enEmails,
    errors: enErrors,
  },
  "zh-Hans": {
    common: { ...pkgZhCommon, ...zhCommon, app_name: "HelmSmart" },
    nav: zhNav,
    settings: zhSettings,
    auth: zhAuth,
    home: zhHome,
    inbox: zhInbox,
    clients: zhClients,
    tasks: zhTasks,
    pipeline: zhPipeline,
    projects: zhProjects,
    workflows: zhWorkflows,
    voice: zhVoice,
    marketing: zhMarketing,
    books: zhBooks,
    site: zhSite,
    emails: zhEmails,
    errors: zhErrors,
  },
};
