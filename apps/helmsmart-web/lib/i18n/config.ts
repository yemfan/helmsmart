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
 *   public     the pages a visitor reaches from a link without signing in
 *              — join an invitation, pay an invoice, the client portal,
 *              reschedule an appointment. Not `auth`: the reader is a
 *              customer or a colleague who may have no HelmSmart account,
 *              and `auth` is about authenticating one.
 *
 * There is deliberately no `errors` namespace. An error string belongs to the
 * screen that shows it, so each surface keeps its own `errors.*` group and a
 * server action reaches it with the same `getServerT(ns)` its page uses. A
 * single shared error bundle sounded tidy and had no reader: every action
 * already knows which surface it serves.
 */
import {
  DEFAULT_LOCALE,
  type Locale,
} from "@leadsmart/i18n";

import pkgEnCommon from "@leadsmart/i18n/locale/en/common";
import pkgZhCommon from "@leadsmart/i18n/locale/zh-Hans/common";
import pkgEsCommon from "@leadsmart/i18n/locale/es/common";

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
import enPublic from "@/messages/en/public.json";

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
import zhPublic from "@/messages/zh-Hans/public.json";

import esCommon from "@/messages/es/common.json";
import esNav from "@/messages/es/nav.json";
import esSettings from "@/messages/es/settings.json";
import esAuth from "@/messages/es/auth.json";
import esHome from "@/messages/es/home.json";
import esInbox from "@/messages/es/inbox.json";
import esClients from "@/messages/es/clients.json";
import esTasks from "@/messages/es/tasks.json";
import esPipeline from "@/messages/es/pipeline.json";
import esProjects from "@/messages/es/projects.json";
import esWorkflows from "@/messages/es/workflows.json";
import esVoice from "@/messages/es/voice.json";
import esMarketing from "@/messages/es/marketing.json";
import esBooks from "@/messages/es/books.json";
import esSite from "@/messages/es/site.json";
import esEmails from "@/messages/es/emails.json";
import esPublic from "@/messages/es/public.json";

export const I18N_COOKIE_NAME = "helmsmart_locale";

/** How long the locale cookie sticks around — one year, refreshed on each change. */
export const I18N_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const SUPPORTED_LOCALES = ["en", "zh-Hans", "es"] as const satisfies readonly Locale[];
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export { DEFAULT_LOCALE };

/**
 * `og:locale` for each locale we ship.
 *
 * Open Graph wants a POSIX-style `language_TERRITORY` tag, not the BCP-47 the
 * rest of the app carries — `zh_CN`, not `zh-Hans`. Nothing validates it, so a
 * wrong tag is simply ignored by the scrapers that read it, which is why the
 * page had none at all and nobody noticed.
 *
 * Typed against `SupportedLocale`, so adding a locale to the list above fails
 * to compile until it has a tag here.
 */
export const OG_LOCALES: Record<SupportedLocale, string> = {
  en: "en_US",
  "zh-Hans": "zh_CN",
  es: "es_ES",
};

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
  "public",
] as const;
export type AppNamespace = (typeof namespaces)[number];

type Bundle = Record<string, unknown>;

/**
 * Overlay one bundle on another, key by key, all the way down.
 *
 * A spread would not do. `common` is the shared package's bundle with this
 * app's additions on top, and both are nested — so `{ ...pkg, ...app }`
 * replaces a whole GROUP whenever the app declares one. Adding a single
 * `actions.saved_bang` here deleted the package's entire `actions` set
 * (`save`, `cancel`, `dismiss`, …) from the app, and every call site reading
 * one rendered its raw key. Nothing about that is visible at the merge: the
 * bundle is still a valid object, just missing forty strings.
 *
 * Objects merge, everything else is replaced by the overlay — which is what
 * "an app key wins on a clash" has to mean for a leaf.
 */
function overlay(base: Bundle, top: Bundle): Bundle {
  const out: Bundle = { ...base };
  for (const [key, value] of Object.entries(top)) {
    const existing = out[key];
    out[key] =
      isPlainObject(existing) && isPlainObject(value)
        ? overlay(existing, value)
        : value;
  }
  return out;
}

function isPlainObject(v: unknown): v is Bundle {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export const resources: Record<SupportedLocale, Record<AppNamespace, Bundle>> = {
  en: {
    // The package's generic verbs first, then this app's own — an app key
    // wins on a clash, and `app_name` always has to.
    common: { ...overlay(pkgEnCommon, enCommon), app_name: "HelmSmart" },
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
    public: enPublic,
  },
  "zh-Hans": {
    common: { ...overlay(pkgZhCommon, zhCommon), app_name: "HelmSmart" },
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
    public: zhPublic,
  },
  es: {
    common: { ...overlay(pkgEsCommon, esCommon), app_name: "HelmSmart" },
    nav: esNav,
    settings: esSettings,
    auth: esAuth,
    home: esHome,
    inbox: esInbox,
    clients: esClients,
    tasks: esTasks,
    pipeline: esPipeline,
    projects: esProjects,
    workflows: esWorkflows,
    voice: esVoice,
    marketing: esMarketing,
    books: esBooks,
    site: esSite,
    emails: esEmails,
    public: esPublic,
  },
};
