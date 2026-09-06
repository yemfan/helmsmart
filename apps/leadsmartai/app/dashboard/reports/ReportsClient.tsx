"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import ShareReport from "@/components/share/ShareReport";

type ReportRow = {
  id: string;
  property_address: string | null;
  lead_name: string | null;
  lead_email: string | null;
  created_at: string;
};

export default function ReportsClient({ reports }: { reports: ReportRow[] }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const filtered = reports
    .filter((r) => {
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (r.property_address ?? "").toLowerCase().includes(s) || (r.lead_name ?? "").toLowerCase().includes(s);
    })
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      return new Date(a.created_at).getTime() < new Date(b.created_at).getTime() ? dir : -dir;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{t("pages.reports.heading")}</h1>
          <p className="text-sm text-slate-500">{t("pages.reports.count", { count: reports.length })}</p>
        </div>
        <Link href="/smart-cma-builder?save=1" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          {t("pages.reports.create")}
        </Link>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("pages.reports.searchPlaceholder")}
        className="w-full max-w-md rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm" />

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">{t("pages.reports.colProperty")}</th>
                <th className="text-left px-4 py-2.5 font-medium">{t("pages.reports.colLead")}</th>
                <th className="text-left px-4 py-2.5 font-medium cursor-pointer hover:text-slate-900" onClick={() => setSortAsc((v) => !v)}>
                  {t("pages.reports.colDate")} {sortAsc ? "\u25B2" : "\u25BC"}
                </th>
                <th className="text-left px-4 py-2.5 font-medium">{t("pages.reports.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filtered.map((r) => {
                const reportLink = `/report/${encodeURIComponent(r.id)}`;
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800">
                    <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100 max-w-[250px] truncate">{r.property_address ?? "\u2014"}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                      {r.lead_name ?? "\u2014"}
                      {r.lead_email && <span className="block text-xs text-slate-400">{r.lead_email}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Link href={reportLink} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">{t("pages.reports.open")}</Link>
                        <ShareReport
                          shareUrl={origin ? `${origin}${reportLink}` : null}
                          subject={t("pages.reports.shareSubject", {
                            address: r.property_address ?? t("pages.reports.yourProperty"),
                          })}
                          resourceLabel={t("pages.reports.shareLabel", {
                            address: r.property_address ?? t("pages.reports.yourProperty"),
                          })}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">{t("pages.reports.empty")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
