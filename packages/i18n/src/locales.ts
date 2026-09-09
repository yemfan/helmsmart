/**
 * Canonical locale codes used across the LeadSmart / CloseBoss web + mobile
 * apps and HelmSmart.
 *
 * We normalize on BCP-47 with the script subtag for Chinese so the
 * user's intent is unambiguous ("zh-Hans" vs "zh-Hant"). Spanish
 * lands as "es" (without a country code) for now — a region split
 * (es-MX / es-ES) can come later if the translations diverge.
 *
 * TWO LISTS. `ALL_LOCALES` is every locale the shared code KNOWS — the
 * type-level superset that `resolveLocale`, `LANGUAGE_NAMES` and
 * `intlLocale` understand. `SUPPORTED_LOCALES` is what CloseBoss and the
 * mobile app actually SHIP, and is what their pickers show. An app whose
 * bundles cover a different subset (HelmSmart) passes its own list to the
 * factories rather than reading this one; a picker that offers a language
 * with no bundle behind it renders English under a Spanish label, which is
 * worse than not offering it.
 *
 * Adding a new locale: append the code to `ALL_LOCALES`, teach
 * `localeDisplayName` / `LANGUAGE_NAMES` / `intlLocale` its name, and then
 * add it to each app's supported list as that app's bundles land.
 */
export const ALL_LOCALES = ["en", "zh-Hans", "es"] as const;
export type Locale = (typeof ALL_LOCALES)[number];

export const SUPPORTED_LOCALES = ["en", "zh-Hans"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en";

/**
 * BCP-47 tags we treat as aliases of a locale.
 *
 * Mobile's `expo-localization` returns the OS-level tag verbatim
 * (e.g. "zh-CN", "zh-TW", "zh-Hans-CN"). Web sees the same range
 * through `Accept-Language`. This map collapses the family down to
 * one of the codes in `supported`.
 *
 * Returns null when nothing matches — caller falls back to its default.
 */
export function resolveLocale(input: string | null | undefined): SupportedLocale | null;
export function resolveLocale<T extends Locale>(
  input: string | null | undefined,
  supported: readonly T[],
): T | null;
export function resolveLocale(
  input: string | null | undefined,
  supported: readonly Locale[] = SUPPORTED_LOCALES,
): Locale | null {
  if (!input) return null;
  const lower = input.toLowerCase();

  // Direct match (already canonical).
  for (const loc of supported) {
    if (lower === loc.toLowerCase()) return loc;
  }

  // Chinese family — collapse Hans / CN / SG to zh-Hans. Hant /
  // TW / HK aren't supported yet, but when they are we'll add a
  // separate "zh-Hant" entry; for now they fall through to null
  // and the caller defaults to English.
  if (lower.startsWith("zh")) {
    if (lower.includes("hant") || lower.includes("tw") || lower.includes("hk") || lower.includes("mo")) {
      return null;
    }
    return supported.includes("zh-Hans") ? "zh-Hans" : null;
  }

  // Spanish variants (es-MX, es-ES, es-US …).
  if (lower.startsWith("es")) return supported.includes("es") ? "es" : null;

  // English variants.
  if (lower.startsWith("en")) return supported.includes("en") ? "en" : null;

  return null;
}

/**
 * Display-friendly label for a locale code. Used by the language
 * picker in Settings. Always renders in the target language (so
 * "中文" reads as "中文" even when the current locale is English),
 * which is the standard convention for language pickers.
 */
export function localeDisplayName(locale: Locale): string {
  switch (locale) {
    case "en":
      return "English";
    case "zh-Hans":
      return "简体中文";
    case "es":
      return "Español";
  }
}

/** The two-letter button label for a compact header toggle. */
export function localeShortLabel(locale: Locale): string {
  switch (locale) {
    case "en":
      return "EN";
    case "zh-Hans":
      return "中文";
    case "es":
      return "ES";
  }
}
