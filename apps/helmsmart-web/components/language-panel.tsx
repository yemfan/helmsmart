"use client";

import { localeDisplayName } from "@leadsmart/i18n";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useSetLocale } from "@/lib/i18n/client";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/i18n/config";

/**
 * Language picker on Settings → General. Per PERSON, not per organization:
 * two owners of one business can read it in different languages.
 *
 * Selecting a language is the save — there is no separate button. The cookie
 * is written, the page re-renders in the new language in the same
 * interaction, and the durable copy is POSTed in the background; the
 * highlighted row is the confirmation, in the language just chosen.
 */
export function LanguagePanel() {
  const { t, i18n } = useTranslation("settings");
  const setLocale = useSetLocale();
  const current = (i18n.language as SupportedLocale) ?? "en";

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700 mb-1">{t("language.title")}</h2>
      <p className="text-xs text-slate-500 mb-4">{t("language.description")}</p>
      <div role="radiogroup" aria-label={t("language.title")} className="flex flex-col gap-2">
        {SUPPORTED_LOCALES.map((loc) => {
          const active = loc === current;
          return (
            <button
              key={loc}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLocale(loc)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                active
                  ? "border-indigo-500 bg-indigo-50 text-indigo-900 font-semibold"
                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{localeDisplayName(loc)}</span>
              {active && <Check aria-hidden="true" className="w-4 h-4 text-indigo-600" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
