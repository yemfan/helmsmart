"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import type { OpenHouseListItem, OpenHouseStatus } from "@/lib/open-houses/types";

const STATUS_LABEL_KEY: Record<OpenHouseStatus, string> = {
  scheduled: "pages.openHousesList.upcoming",
  in_progress: "pages.openHousesList.liveNow",
  completed: "pages.openHousesList.completed",
  cancelled: "pages.openHousesList.cancelled",
};

const STATUS_BADGE: Record<OpenHouseStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-green-100 text-green-800 animate-pulse",
  completed: "bg-slate-100 text-slate-700",
  cancelled: "bg-red-100 text-red-700",
};

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimeRange(startIso: string, endIso: string, locale: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleTimeString(locale, opts)} – ${end.toLocaleTimeString(locale, opts)}`;
}

/**
 * Derive the effective status — "in_progress" is a virtual state
 * computed from start_at <= now < end_at. Stored status stays
 * "scheduled" until the agent either manually completes it or the
 * follow-up cron does so automatically.
 */
function effectiveStatus(oh: OpenHouseListItem): OpenHouseStatus {
  if (oh.status === "cancelled" || oh.status === "completed") return oh.status;
  const now = Date.now();
  const start = new Date(oh.start_at).getTime();
  const end = new Date(oh.end_at).getTime();
  if (start <= now && now < end) return "in_progress";
  return oh.status;
}

export function OpenHousesListClient({
  initialOpenHouses,
}: {
  initialOpenHouses: OpenHouseListItem[];
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");

  const filtered = useMemo(() => {
    const now = Date.now();
    return initialOpenHouses
      .filter((oh) => {
        if (filter === "upcoming") {
          return new Date(oh.end_at).getTime() >= now && oh.status !== "cancelled";
        }
        if (filter === "past") {
          return new Date(oh.end_at).getTime() < now || oh.status === "completed";
        }
        return true;
      })
      .map((oh) => ({ ...oh, displayStatus: effectiveStatus(oh) }));
  }, [initialOpenHouses, filter]);

  const stats = useMemo(() => {
    let upcoming = 0;
    let totalVisitors = 0;
    let totalHot = 0;
    let totalConsent = 0;
    const now = Date.now();
    for (const oh of initialOpenHouses) {
      if (new Date(oh.end_at).getTime() >= now && oh.status !== "cancelled") upcoming += 1;
      totalVisitors += oh.visitor_total;
      totalHot += oh.visitor_hot;
      totalConsent += oh.visitor_with_consent;
    }
    return {
      total: initialOpenHouses.length,
      upcoming,
      totalVisitors,
      totalHot,
      totalConsent,
    };
  }, [initialOpenHouses]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("pages.openHouses.heading")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("pages.openHouses.intro")}</p>
        </div>
        <Link
          href="/dashboard/open-houses/new"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >{t("pages.openHouses.schedule")}</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("pages.openHouses.upcoming")} value={String(stats.upcoming)} tone="blue" />
        <Stat label={t("pages.openHouses.totalVisitors")} value={String(stats.totalVisitors)} />
        <Stat label={t("pages.openHouses.hotLeads")} value={String(stats.totalHot)} tone="red" />
        <Stat label={t("pages.openHouses.optedIn")} value={String(stats.totalConsent)} tone="green" />
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-0.5 text-xs">
        {(["upcoming", "past", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
              filter === f ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {f === "upcoming" ? t("pages.openHousesList.upcoming") : f === "past" ? t("pages.openHouses.tabPast") : t("pages.openHouses.tabAll")}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("pages.openHouses.colWhen")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.openHouses.colProperty")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("pages.openHouses.colVisitors")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("pages.openHouses.colHot")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("pages.openHouses.colOptedIn")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.openHouses.colStatus")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((oh) => (
                <tr key={oh.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/dashboard/open-houses/${oh.id}`} className="block">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{formatDate(oh.start_at, locale)}</div>
                      <div className="text-[11px] text-slate-500">
                        {formatTimeRange(oh.start_at, oh.end_at, locale)}
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/dashboard/open-houses/${oh.id}`}
                        className="font-medium text-slate-900 dark:text-slate-100 hover:underline"
                      >
                        {oh.property_address}
                      </Link>
                      {oh.recurrence_group_id ? (
                        <span
                          title={t("pages.openHouses.recurring")}
                          className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-800"
                        >
                          ↻ Series
                        </span>
                      ) : null}
                    </div>
                    {oh.city || oh.state ? (
                      <div className="text-[11px] text-slate-500">
                        {[oh.city, oh.state].filter(Boolean).join(", ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {oh.visitor_total}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {oh.visitor_hot > 0 ? (
                      <span className="font-semibold text-red-600">{oh.visitor_hot}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {oh.visitor_with_consent}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[oh.displayStatus]}`}
                    >
                      {t(STATUS_LABEL_KEY[oh.displayStatus])}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">
                    {initialOpenHouses.length === 0 ? (
                      <>
                        <div className="font-medium">{t("pages.openHouses.empty")}</div>
                        <div className="mt-1 text-[12px]">
                          {t("pages.openHouses.emptyBefore")} <strong>{t("pages.openHouses.schedule")}</strong>{t("pages.openHouses.emptyAfter")}
                        </div>
                      </>
                    ) : (
                      t("pages.openHousesList.noOpenHousesMatch")
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "blue" | "green" | "red";
}) {
  const color =
    tone === "blue"
      ? "text-blue-700"
      : tone === "green"
        ? "text-green-700"
        : tone === "red"
          ? "text-red-600"
          : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
