/**
 * BCP-47 tag for `Intl` / `toLocaleDateString` / `toLocaleTimeString`.
 *
 * Our locale ids are i18next namespaces ("zh-Hans"), not the region tags the
 * Intl APIs expect, so date and number formatting needs this translation step.
 * Without it a page renders "3:30 PM" and "Aug 14" to a reader who picked
 * Chinese — the copy switches but the data doesn't.
 *
 * Spanish maps to `es-US` on purpose: every app here serves US small
 * businesses and US agents, so the currency is USD and the date order is the
 * one their bank statements use.
 *
 * Pass `i18n.language` from `useTranslation()` so the value re-renders when
 * the reader flips the toggle.
 */
export function intlLocale(language: string | undefined | null): string {
  switch (language) {
    case "zh-Hans":
      return "zh-CN";
    case "es":
      return "es-US";
    default:
      return "en-US";
  }
}
