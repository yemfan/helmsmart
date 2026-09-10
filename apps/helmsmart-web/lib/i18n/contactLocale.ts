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
