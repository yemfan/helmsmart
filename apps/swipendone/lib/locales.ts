// Supported buyer-guide languages. Add a locale here + its UI strings + font
// mapping and it flows through generation, editor, and the buyer guide.

export const LOCALES = ["en", "zh", "es", "fr", "de", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(x: string): x is Locale {
  return (LOCALES as readonly string[]).includes(x);
}

/** Short code shown on toggle chips. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  zh: "中文",
  es: "ES",
  fr: "FR",
  de: "DE",
  ja: "日本語",
};

/** Endonym — the language's own name, for pickers. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  zh: "简体中文",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  ja: "日本語",
};

/** English name — used in the generation prompt so the model is unambiguous. */
export const LOCALE_ENGLISH_NAMES: Record<Locale, string> = {
  en: "English",
  zh: "Simplified Chinese",
  es: "Spanish",
  fr: "French",
  de: "German",
  ja: "Japanese",
};

/** Which font family a locale should render in (buyer guide / editor previews). */
export type ScriptFamily = "latin" | "sc" | "jp";
export const LOCALE_SCRIPT: Record<Locale, ScriptFamily> = {
  en: "latin",
  es: "latin",
  fr: "latin",
  de: "latin",
  zh: "sc",
  ja: "jp",
};

/** CSS body-font variable for a locale's script (for previews/inputs). */
export function scriptFontVar(locale: Locale): string {
  const s = LOCALE_SCRIPT[locale];
  if (s === "sc") return "var(--font-zh-body)";
  if (s === "jp") return "var(--font-jp-body)";
  return "var(--font-body)";
}

/** A localized string is a partial map of locale → text. */
export type LocalizedText = Partial<Record<Locale, string>>;

/** Read a localized value with fallback to English, then any present value. */
export function pick(map: LocalizedText | undefined, locale: Locale): string {
  if (!map) return "";
  return map[locale] ?? map[DEFAULT_LOCALE] ?? Object.values(map)[0] ?? "";
}
