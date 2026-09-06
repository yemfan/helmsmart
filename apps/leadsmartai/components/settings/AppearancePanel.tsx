"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  THEME_COOKIE,
  THEME_STORAGE_KEY,
  THEME_VALUES,
  isThemePreference,
  type ThemePreference,
} from "@/lib/theme/theme";

const ICON: Record<ThemePreference, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    /* ignore */
  }
  return "light";
}

function apply(pref: ThemePreference) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* ignore */
  }
  document.cookie = `${THEME_COOKIE}=${pref}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Appearance — Light / Dark / System, on Settings › Account. Same shape as
 * the language picker beside it. Saving is immediate (the class flips as you
 * click) so the control needs no Save button; the selected radio is the
 * confirmation.
 */
export default function AppearancePanel() {
  const { t } = useTranslation("settings");
  const [pref, setPref] = useState<ThemePreference>("light");
  useEffect(() => setPref(readPreference()), []);

  // "System" follows the OS live while the page is open.
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("appearance.title")}</h2>
      <p className="mb-3 mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t("appearance.description")}</p>
      <div role="radiogroup" aria-label={t("appearance.title")} className="grid gap-2 sm:grid-cols-3">
        {THEME_VALUES.map((v) => {
          const Icon = ICON[v];
          const active = v === pref;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setPref(v);
                apply(v);
              }}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce]/40 ${
                active
                  ? "border-[#0072ce] bg-blue-50 text-slate-900 dark:bg-blue-950/40 dark:text-slate-100"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" strokeWidth={2} aria-hidden />
              <span className="font-medium">{t(`appearance.${v}`)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
