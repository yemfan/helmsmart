"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { moneyFormatter } from "@/lib/books-format";
import type { Report1099 } from "@/lib/actions/vendors";

export function Report1099Client({
  report,
  years,
  currency,
}: {
  report: Report1099;
  years: number[];
  currency: string;
}) {
  const { t, i18n } = useTranslation("books");
  const fmt = moneyFormatter(i18n.language, currency);
  const router = useRouter();

  function exportCsv() {
    const rows: string[] = [
      [
        t("vendors.report1099.csv.contractor"),
        t("vendors.report1099.csv.email"),
        t("vendors.report1099.csv.paid", { year: report.year }),
        t("vendors.report1099.csv.reportable"),
      ].join(","),
      ...report.rows.map(
        (r) =>
          `"${r.name}","${r.email ?? ""}",${r.paidThisYear.toFixed(2)},${
            r.meetsThreshold ? t("vendors.report1099.csv.yes") : t("vendors.report1099.csv.no")
          }`
      ),
      `${t("vendors.report1099.total")},,${report.totalPaid.toFixed(2)},`,
    ];
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `1099_${report.year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Two whole phrases; the separator is punctuation, not grammar.
  const summary = [
    t("vendors.report1099.reportableCount", { count: report.reportableCount }),
    t("vendors.report1099.paidInYear", { amount: fmt(report.totalPaid), year: report.year }),
  ].join(" · ");

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-800">{t("vendors.report1099.title")}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{summary}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/books/vendors"
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("vendors.report1099.backToVendors")}
          </Link>
          <select
            value={report.year}
            onChange={(e) => router.push(`/books/vendors/1099?year=${e.target.value}`)}
            aria-label={t("vendors.report1099.taxYear")}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {report.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl">
          <FileText className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500 mb-1">{t("vendors.report1099.empty.title")}</p>
          <p className="text-xs text-slate-400 mb-4 max-w-sm">{t("vendors.report1099.empty.body")}</p>
          <Link href="/books/vendors" className="text-xs font-medium text-indigo-600 hover:text-indigo-800">
            {t("vendors.report1099.empty.cta")}
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">
              {t("vendors.report1099.paidHeading", { year: report.year })}
            </h3>
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {t("vendors.report1099.exportCsv")}
            </button>
          </div>
          <div className="grid grid-cols-[1.8fr_1fr_120px] gap-3 px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
            <span>{t("vendors.report1099.columns.contractor")}</span>
            <span className="text-right">{t("vendors.report1099.columns.paid")}</span>
            <span className="text-right">{t("vendors.report1099.columns.status")}</span>
          </div>
          <div className="divide-y divide-slate-50">
            {report.rows.map((r) => (
              <div key={r.id} className="grid grid-cols-[1.8fr_1fr_120px] gap-3 px-5 py-3 items-center">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{r.name}</p>
                  {r.email && <p className="text-xs text-slate-400 truncate">{r.email}</p>}
                </div>
                <span className="text-sm font-medium text-slate-800 text-right tabular-nums">{fmt(r.paidThisYear)}</span>
                <span className="text-right">
                  {r.meetsThreshold ? (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                      {t("vendors.report1099.badge.reportable")}
                    </span>
                  ) : (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
                      {t("vendors.report1099.badge.underThreshold")}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1.8fr_1fr_120px] gap-3 px-5 py-3 bg-slate-50 border-t border-slate-100 items-center">
            <span className="text-sm font-semibold text-slate-700">{t("vendors.report1099.total")}</span>
            <span className="text-sm font-bold text-slate-800 text-right tabular-nums">{fmt(report.totalPaid)}</span>
            <span />
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4">
        {t("vendors.report1099.footnote", { year: report.year })}
      </p>
    </div>
  );
}
