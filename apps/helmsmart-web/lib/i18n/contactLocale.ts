import { resolveLocale } from "@leadsmart/i18n";

import { SUPPORTED_LOCALES, type SupportedLocale } from "./config";

/**
 * The language a CONTACT reads, from the value stored against them.
 *
 * `getServerLocale()` answers for whoever is holding the request, which is
 * right on a page the reader opened themselves (`/pay/[id]`, the client
 * portal). It is wrong for a document the owner GENERATES and hands over: the
 * printable invoice renders inside the owner's session, so the request locale
 * is the owner's, and a Chinese-reading contractor would print a Chinese
 * invoice for an English-speaking client. `docs/i18n-design.md` is explicit
 * that invoices, reminders and campaign copy follow
 * `clients.preferred_language` instead.
 *
 * TWO VOCABULARIES MEET HERE, which is why this is a function and not a
 * property read. That column is written by `lib/language.ts`, whose `Lang` is
 * `"en" | "es" | "zh"` — a bare `zh`, because that module classifies inbound
 * messages and never needed a script subtag. The app's locales carry one:
 * `"zh-Hans"`. Passing the stored string straight to a translator resolves
 * nothing, falls back to English, and renders an English invoice at a Chinese
 * reader — with no error, because "no bundle for this locale" and "this locale
 * is English" produce identical output. `resolveLocale` collapses the family,
 * so it does the mapping rather than a switch that drifts the next time a
 * locale is added.
 *
 * Returns null when the column is empty or holds something unsupported, so a
 * caller can tell "we do not know" from "they chose English". Both render
 * English today; only one is a fact about the person.
 *
 * PURE ON PURPOSE — no Supabase, no `next/headers`, no `server-only`, the same
 * rule as `lib/books-format.ts`. Every caller so far is holding the client row
 * already (the print page selects it beside the invoice, the reminder cron
 * joins it), so a lookup helper here would be a second query for a string they
 * have. Add one when something actually needs it.
 */
export function contactLocale(value: string | null | undefined): SupportedLocale | null {
  return resolveLocale(value, SUPPORTED_LOCALES);
}

/**
 * The codes `clients.preferred_language` holds. The messaging code reads them —
 * SMS drafts, auto-replies, invoice reminders, the printed invoice — so a
 * contact's language is one of these three, never an app locale like "zh-Hans".
 */
export const CONTACT_LANGUAGES = ["en", "es", "zh"] as const;
export type ContactLanguage = (typeof CONTACT_LANGUAGES)[number];

/** Each language in its own words: a picker lists them so every reader finds theirs. */
export const CONTACT_LANGUAGE_NAMES: Record<ContactLanguage, string> = {
  en: "English",
  es: "Español",
  zh: "简体中文",
};

/** The contact code for an app locale — "zh-Hans" is stored as "zh"; anything unknown is English. */
export function contactLanguageFor(locale: string | null | undefined): ContactLanguage {
  const resolved = contactLocale(locale);
  return resolved === "zh-Hans" ? "zh" : resolved === "es" ? "es" : "en";
}

/** A submitted value as a storable code, or null for "detect from their messages". */
export function parseContactLanguage(value: unknown): ContactLanguage | null {
  return typeof value === "string" && (CONTACT_LANGUAGES as readonly string[]).includes(value)
    ? (value as ContactLanguage)
    : null;
}
