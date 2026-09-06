"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Database, MessageSquare, Plug, Sparkles, User } from "lucide-react";
import { SETTINGS_GROUPS, legacyTabToGroup, type SettingsGroupId } from "@/lib/settings/groups";

const ICON: Record<SettingsGroupId, typeof User> = {
  account: User,
  "ai-team": Sparkles,
  channels: Plug,
  messaging: MessageSquare,
  data: Database,
};

/**
 * The settings index: five group cards and a filter box. Typing matches
 * each group's label, description and a keyword list, so "quiet hours" finds
 * Messaging and "logo" finds Account without the agent knowing the grouping.
 */
export function SettingsIndex() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Old deep links: /dashboard/settings?tab=channels and #voice. Forward them
  // to the group page so nothing inside the app (or in a sent email) breaks.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    const hash = window.location.hash.replace("#", "");
    const group = legacyTabToGroup(tab) ?? legacyTabToGroup(hash);
    if (group) router.replace(`/dashboard/settings/${group}`);
  }, [router]);

  const groups = useMemo(
    () =>
      SETTINGS_GROUPS.map((g) => ({
        ...g,
        label: t(`settings.groups.${g.i18nKey}.label`),
        description: t(`settings.groups.${g.i18nKey}.description`),
        keywords: t(`settings.groups.${g.i18nKey}.keywords`),
      })),
    [t],
  );

  const q = query.trim().toLowerCase();
  const visible = q
    ? groups.filter((g) => `${g.label} ${g.description} ${g.keywords}`.toLowerCase().includes(q))
    : groups;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">{t("settings.index.title")}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{t("settings.index.subtitle")}</p>
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("settings.index.searchPlaceholder")}
        aria-label={t("settings.index.searchPlaceholder")}
        className="mb-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#0072ce] focus:outline-none focus:ring-2 focus:ring-[#0072ce]/20"
      />
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          {t("settings.index.noMatch")}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((g) => {
            const Icon = ICON[g.id];
            return (
              <li key={g.id}>
                <Link
                  href={g.href}
                  className="group flex h-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce]/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0072ce]">
                    <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 group-hover:text-[#0072ce]">{g.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{g.description}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
