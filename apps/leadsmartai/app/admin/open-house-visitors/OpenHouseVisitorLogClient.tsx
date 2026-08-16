"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

export type OpenHouseVisitorLogRow = {
  id: string;
  openHouseId: string;
  propertyAddress: string | null;
  agentId: string;
  agentEmail: string | null;
  agentFirstName: string | null;
  contactId: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
  isBuyerAgented: boolean;
  timeline: string | null;
  marketingConsent: boolean;
  thankYouSentAt: string | null;
  checkInSentAt: string | null;
  createdAt: string;
};

type FilterMode =
  | "all"
  | "opted_in"
  | "thank_you_pending"
  | "check_in_pending"
  | "agented";

export function OpenHouseVisitorLogClient({
  rows,
  error,
  cutoffIso,
}: {
  rows: OpenHouseVisitorLogRow[];
  error: string | null;
  cutoffIso: string;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const nowMs = Date.now();
    return rows.filter((r) => {
      if (filter === "opted_in" && !r.marketingConsent) return false;
      if (filter === "agented" && !r.isBuyerAgented) return false;
      if (filter === "thank_you_pending") {
        if (!r.marketingConsent || r.isBuyerAgented || r.thankYouSentAt) return false;
        const ageHours = (nowMs - new Date(r.createdAt).getTime()) / 3600_000;
        if (ageHours < 2) return false; // too soon for the cron to have fired
      }
      if (filter === "check_in_pending") {
        if (!r.marketingConsent || r.isBuyerAgented || r.checkInSentAt) return false;
        const ageHours = (nowMs - new Date(r.createdAt).getTime()) / 3600_000;
        if (ageHours < 72) return false;
      }
      if (!needle) return true;
      return (
        r.agentEmail?.toLowerCase().includes(needle) ||
        r.visitorEmail?.toLowerCase().includes(needle) ||
        r.visitorName?.toLowerCase().includes(needle) ||
        r.propertyAddress?.toLowerCase().includes(needle) ||
        false
      );
    });
  }, [rows, filter, q]);

  const summary = useMemo(() => {
    let optedIn = 0;
    let agented = 0;
    let thankYouSent = 0;
    let checkInSent = 0;
    for (const r of rows) {
      if (r.marketingConsent) optedIn += 1;
      if (r.isBuyerAgented) agented += 1;
      if (r.thankYouSentAt) thankYouSent += 1;
      if (r.checkInSentAt) checkInSent += 1;
    }
    return { total: rows.length, optedIn, agented, thankYouSent, checkInSent };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t("pages.adminPages.openHouseVisitors")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Recent sign-ins since{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">{cutoffIso}</code>{" "}
          (last 30 days). Follow-up delivery state shows whether the hourly cron caught them.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Error loading rows: {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={t("pages.adminPages.totalSignIns")} value={summary.total} />
        <Stat label={t("pages.adminPages.optedIn")} value={summary.optedIn} tone="green" />
        <Stat label={t("pages.adminPages.alreadyAgented")} value={summary.agented} />
        <Stat label={t("pages.adminPages.thankYousSent")} value={summary.thankYouSent} tone="blue" />
        <Stat label={t("pages.adminPages.checkInsSent")} value={summary.checkInSent} tone="blue" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search agent, visitor, or property…"
          className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterMode)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">{t("pages.adminPages.allVisitors")}</option>
          <option value="opted_in">{t("pages.adminPages.optedInOnly")}</option>
          <option value="agented">{t("pages.adminPages.alreadyAgented")}</option>
          <option value="thank_you_pending">Thank-you overdue (opted-in, not sent, ≥2h)</option>
          <option value="check_in_pending">Check-in overdue (opted-in, not sent, ≥72h)</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminPages.signedIn")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminPages.visitor")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminCommon.property")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminCommon.agent")}</th>
                <th className="px-3 py-2 text-center font-medium">{t("pages.adminPages.optedIn")}</th>
                <th className="px-3 py-2 text-center font-medium">{t("pages.adminPages.thankYou")}</th>
                <th className="px-3 py-2 text-center font-medium">{t("pages.adminPages.checkIn")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-[12px] text-slate-700">
                    {new Date(r.createdAt).toLocaleString(locale)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-slate-900">
                      {r.visitorName ?? <span className="text-slate-400">—</span>}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {[r.visitorEmail, r.visitorPhone].filter(Boolean).join(" · ") || "—"}
                    </div>
                    {r.isBuyerAgented ? (
                      <div className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{t("pages.adminPages.alreadyAgented")}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/open-houses/${r.openHouseId}`}
                      className="text-slate-900 hover:underline"
                    >
                      {r.propertyAddress ?? "(deleted open house)"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-slate-900">
                      {r.agentEmail ?? <span className="text-slate-400">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.marketingConsent ? (
                      <span title={t("pages.adminPages.willReceive")}>✅</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-[11px] text-slate-600">
                    {r.thankYouSentAt ? (
                      new Date(r.thankYouSentAt).toLocaleDateString(locale)
                    ) : !r.marketingConsent || r.isBuyerAgented ? (
                      <span className="text-slate-300">n/a</span>
                    ) : (
                      <span className="text-amber-600">pending</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-[11px] text-slate-600">
                    {r.checkInSentAt ? (
                      new Date(r.checkInSentAt).toLocaleDateString(locale)
                    ) : !r.marketingConsent || r.isBuyerAgented || !r.visitorPhone ? (
                      <span className="text-slate-300">n/a</span>
                    ) : (
                      <span className="text-amber-600">pending</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">{t("pages.adminCommon.noMatchingRows")}</td>
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
  value: number;
  tone?: "red" | "green" | "blue" | "neutral";
}) {
  const textColor =
    tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-green-600"
        : tone === "blue"
          ? "text-blue-700"
          : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-semibold ${textColor}`}>{value}</div>
    </div>
  );
}
