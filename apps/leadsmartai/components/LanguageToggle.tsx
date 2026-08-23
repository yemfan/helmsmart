"use client";

import { useTranslation } from "react-i18next";

import { SUPPORTED_LOCALES, type SupportedLocale } from "@leadsmart/i18n";

import { useSetLocale } from "@/lib/i18n/client";

/**
 * Compact EN / 中文 language toggle for the header chrome (marketing top-nav
 * + dashboard top bar). One tap flips the live i18next instance and writes the
 * `leadsmart_locale` cookie (via {@link useSetLocale}), so translated pages
 * re-render immediately and later SSR navigations stay in sync — same mechanism
 * as the fuller LanguagePanel on the Settings page.
 *
 * Lives inside the root-layout `I18nProvider`, so it works on both public and
 * authenticated routes. On pages whose copy isn't translated yet it simply has
 * no visible effect (the cookie is still set for when the user reaches a
 * translated page).
 */
const SHORT_LABEL: Record<SupportedLocale, string> = {
  en: "EN",
  "zh-Hans": "中文",
};

const FULL_LABEL: Record<SupportedLocale, string> = {
  en: "English",
  "zh-Hans": "中文",
};

export default function LanguageToggle({ className = "" }: { className?: string }) {
  const { t, i18n } = useTranslation("dashboard");
  const setLocale = useSetLocale();
  const current = (i18n.language as SupportedLocale) ?? "en";

  return (
    <div
      role="radiogroup"
      aria-label={t("pages.labels.language")}
      className={`inline-flex shrink-0 items-center rounded-2xl border border-slate-200/90 bg-white p-0.5 shadow-sm ring-1 ring-slate-900/[0.03] dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      {SUPPORTED_LOCALES.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={FULL_LABEL[loc]}
            onClick={() => setLocale(loc)}
            className={`rounded-[14px] px-2.5 py-1.5 text-xs font-semibold transition ${
              active
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            }`}
          >
            {SHORT_LABEL[loc]}
          </button>
        );
      })}
    </div>
  );
}
