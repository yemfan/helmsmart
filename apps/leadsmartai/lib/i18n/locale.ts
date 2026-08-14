import type { SupportedLocale } from "@leadsmart/i18n";

/**
 * BCP-47 tag for `Intl` / `toLocaleDateString` / `toLocaleTimeString`.
 *
 * Our locale ids are i18next namespaces ("zh-Hans"), not the region tags the
 * Intl APIs expect, so date and number formatting needs this translation step.
 * Without it a page renders "3:30 PM" and "Aug 14" to an agent who picked
 * Chinese — the copy switches but the data doesn't.
 *
 * Pass `i18n.language` from `useTranslation()` so the value re-renders when
 * the agent flips the toggle.
 */
export function intlLocale(language: string | SupportedLocale | undefined): string {
  return language === "zh-Hans" ? "zh-CN" : "en-US";
}
