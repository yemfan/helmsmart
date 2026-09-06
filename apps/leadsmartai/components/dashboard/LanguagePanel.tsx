"use client";

import { useTranslation } from "react-i18next";

import { SUPPORTED_LOCALES, type SupportedLocale } from "@leadsmart/i18n";

import { useSetLocale } from "@/lib/i18n/client";

const LANGUAGE_LABEL_KEY: Record<SupportedLocale, string> = {
  en: "language.english",
  "zh-Hans": "language.chinese_simplified",
};

/**
 * Language picker on the dashboard Settings page. Writes the
 * `leadsmart_locale` cookie + flips the live i18next instance so
 * the current page re-renders without a full navigation.
 *
 * Subsequent SSR navigations pick the cookie up via
 * `getServerLocale()` in the root layout, keeping the Server
 * Component world in sync.
 */
export default function LanguagePanel() {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const setLocale = useSetLocale();
  const current = (i18n.language as SupportedLocale) ?? "en";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">
        {t("language.title")}
      </h2>
      <p className="mt-0.5 text-xs text-slate-500 mb-3">
        {t("language.description")}
      </p>
      <div role="radiogroup" aria-label={t("language.title")}>
        {SUPPORTED_LOCALES.map((loc) => {
          const active = loc === current;
          return (
            <button
              key={loc}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLocale(loc)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition mb-2 last:mb-0 ${
                active
                  ? "border-blue-500 bg-blue-50 text-blue-900 font-semibold"
                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{t(LANGUAGE_LABEL_KEY[loc], { ns: "common" })}</span>
              {active && (
                <span aria-hidden="true" className="text-blue-600">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
