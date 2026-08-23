"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

export type SellerUpdateRow = {
  transactionId: string;
  agentId: string;
  agentEmail: string | null;
  agentFirstName: string | null;
  sellerEmail: string | null;
  sellerName: string | null;
  propertyAddress: string;
  transactionType: string;
  status: string;
  enabled: boolean;
  lastSentAt: string | null;
  listingStartDate: string | null;
};

type FilterMode = "all" | "never_sent" | "recent" | "stale";

export function SellerUpdateLogClient({
  rows,
  error,
}: {
  rows: SellerUpdateRow[];
  error: string | null;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const now = Date.now();
    return rows.filter((r) => {
      if (filter === "never_sent" && r.lastSentAt) return false;
      if (filter === "recent") {
        if (!r.lastSentAt) return false;
        const days = (now - new Date(r.lastSentAt).getTime()) / 86_400_000;
        if (days > 8) return false;
      }
      if (filter === "stale") {
        if (!r.lastSentAt) return false;
        const days = (now - new Date(r.lastSentAt).getTime()) / 86_400_000;
        if (days <= 14) return false;
      }
      if (!needle) return true;
      return (
        r.agentEmail?.toLowerCase().includes(needle) ||
        r.sellerEmail?.toLowerCase().includes(needle) ||
        r.propertyAddress.toLowerCase().includes(needle) ||
        r.agentFirstName?.toLowerCase().includes(needle) ||
        r.sellerName?.toLowerCase().includes(needle)
      );
    });
  }, [rows, filter, q]);

  const stats = useMemo(() => {
    const now = Date.now();
    let neverSent = 0;
    let recent = 0;
    let stale = 0;
    for (const r of rows) {
      if (!r.lastSentAt) {
        neverSent += 1;
        continue;
      }
      const days = (now - new Date(r.lastSentAt).getTime()) / 86_400_000;
      if (days <= 8) recent += 1;
      else if (days > 14) stale += 1;
    }
    return { total: rows.length, neverSent, recent, stale };
  }, [rows]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{t("pages.adminPages.sellerUpdates")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Active listing_rep / dual transactions with the weekly seller-update toggle on.
          Send state lives on the transactions row
          (<code className="rounded bg-slate-100 px-1 text-[11px]">seller_update_last_sent_at</code>
          ). Support tool — not linked in the sidebar.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t("pages.dashFragments.errorLoadingRowsShort")} {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("pages.adminPages.enabledListings")} value={stats.total} />
        <Stat label={t("pages.adminPages.neverSent")} value={stats.neverSent} tone={stats.neverSent > 0 ? "amber" : "neutral"} />
        <Stat label="Recent (≤8d)" value={stats.recent} tone="green" />
        <Stat label="Stale (>14d)" value={stats.stale} tone={stats.stale > 0 ? "red" : "neutral"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("pages.adminCommon.searchAgentSellerAddress")}
          className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterMode)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">{t("pages.adminPages.allEnabled")}</option>
          <option value="never_sent">{t("pages.adminPages.neverSent")}</option>
          <option value="recent">{t("pages.adminPages.sentLast8")}</option>
          <option value="stale">{t("pages.adminPages.stale14")}</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminCommon.property")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminCommon.agent")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminPages.seller")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminPages.txState")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.adminPages.lastSent")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr key={r.transactionId} className="align-top">
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/transactions/${r.transactionId}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {r.propertyAddress}
                    </Link>
                    <div className="text-[10px] text-slate-400">{r.transactionId}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-slate-900">
                      {r.agentEmail ?? <span className="text-slate-400">—</span>}
                    </div>
                    <div className="font-mono text-[10px] text-slate-400">{r.agentId}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-slate-900">
                      {r.sellerName ?? r.sellerEmail ?? <span className="text-slate-400">—</span>}
                    </div>
                    {r.sellerEmail && r.sellerName ? (
                      <div className="text-[10px] text-slate-400">{r.sellerEmail}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-600 capitalize">
                    {r.transactionType.replace("_", " ")} · {r.status}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[11px] text-slate-500">
                    {r.lastSentAt ? (
                      <>
                        {new Date(r.lastSentAt).toLocaleDateString(locale)}
                        <div className="text-[10px] text-slate-400">
                          {ageDescription(r.lastSentAt)}
                        </div>
                      </>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">{t("pages.adminPages.neverSent")}</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">{t("pages.adminCommon.noMatchingRows")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ageDescription(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "red" | "green" | "amber" | "neutral";
}) {
  const textColor =
    tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-green-600"
        : tone === "amber"
          ? "text-amber-700"
          : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-semibold ${textColor}`}>{value}</div>
    </div>
  );
}
