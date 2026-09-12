"use client";

import { localeDisplayName, localeShortLabel } from "@leadsmart/i18n";
import { useTranslation } from "react-i18next";

import { useLocaleSwitch } from "@/lib/i18n/useLocaleSwitch";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config";

/**
 * Compact EN / 中文 language toggle for header chrome — the marketing top-nav
 * and the dashboard sidebar footer. One tap writes the `helmsmart_locale`
 * cookie, flips the live i18next instance and refreshes the RSC payload (via
 * `useSetLocale`), so translated pages re-render immediately and later
 * navigations stay in sync — the same mechanism as the fuller LanguagePanel
 * on the Settings page.
 *
 * Lives inside the root-layout `I18nProvider`, so it works on both public and
 * authenticated routes. Reuses the CloseBoss control's shape; `tone="dark"`
 * is for the sidebar's dark shell.
 */
export function LanguageToggle({
  className = "",
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const { t, i18n } = useTranslation("common");
  const setLocale = useLocaleSwitch();
  const current = (i18n.language as SupportedLocale) ?? "en";
  const dark = tone === "dark";

  return (
    <div
      role="radiogroup"
      aria-label={t("language.label")}
      className={`inline-flex shrink-0 items-center rounded-lg p-0.5 ${
        dark ? "bg-white/10" : "border border-slate-200 bg-white"
      } ${className}`}
    >
      {SUPPORTED_LOCALES.map((loc) => {
        const active = loc === current;
        return (
          <button
            key={loc}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={localeDisplayName(loc)}
            onClick={() => setLocale(loc)}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
              active
                ? dark
                  ? "bg-white text-slate-900"
                  : "bg-indigo-600 text-white"
                : // Unselected labels are 11px, so they need the full 4.5:1.
                  // White at 60% over the sidebar's white/10 wash failed axe on
                  // every signed-in page; slate-200 there and slate-700 on
                  // white clear it with room to spare.
                  dark
                  ? "text-slate-200 hover:text-white"
                  : "text-slate-700 hover:text-slate-900"
            }`}
          >
            {localeShortLabel(loc)}
          </button>
        );
      })}
    </div>
  );
}
