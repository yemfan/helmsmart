"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  LeadSourceRoiReport,
  LeadSourceRoiRow,
} from "@/lib/leadSourceRoi/types";

type SortKey = "totalVolume" | "leads" | "conversionPct" | "won" | "avgDealValue";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "totalVolume", label: "Revenue" },
  { key: "leads", label: "Leads" },
  { key: "won", label: "Closes" },
  { key: "conversionPct", label: "Conversion" },
  { key: "avgDealValue", label: "Avg deal" },
];

const WINDOW_OPTIONS: { label: string; days: number }[] = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 180 days", days: 180 },
  { label: "Last 365 days", days: 365 },
];

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/**
 * Lead-source ROI panel. Answers the agent's #1 question: "which lead
 * source actually produces revenue?" The default view ranks sources by
 * total revenue (the bottom-line answer); column-headers re-sort.
 *
 * KPI strip up top: total leads / closes / volume / conversion. Then a
 * dense table of every source. Window selector (30/90/180/365d) refetches.
 */
export default function LeadSourceRoiPanel(props: { defaultWindowDays?: number } = {}) {
  const { t } = useTranslation("dashboard");
  const initialDays = props.defaultWindowDays ?? 90;

  const [windowDays, setWindowDays] = useState<number>(initialDays);
  const [report, setReport] = useState<LeadSourceRoiReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("totalVolume");
  const [sortDesc, setSortDesc] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const end = new Date();
        const start = new Date(end.getTime() - windowDays * 86_400_000);
        const qs = new URLSearchParams({
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        });
        const res = await fetch(`/api/dashboard/lead-source-roi?${qs.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          report?: LeadSourceRoiReport;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || data.ok === false || !data.report) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setReport(data.report);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  const sortedRows = useMemo(() => {
    if (!report) return [];
    const rows = [...report.rows];
    rows.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      if (av === bv) return a.sourceLabel.localeCompare(b.sourceLabel);
      return sortDesc ? bv - av : av - bv;
    });
    return rows;
  }, [report, sortKey, sortDesc]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDesc((v) => !v);
    else {
      setSortKey(k);
      setSortDesc(true);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{t("pages.leadSourceRoi.title")}</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Cohort: contacts captured in the window. &quot;Closes&quot; = lifecycle reached past_client.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WINDOW_OPTIONS.map((w) => (
            <button
              key={w.days}
              type="button"
              onClick={() => setWindowDays(w.days)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${
                windowDays === w.days
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      <div className="p-3 sm:p-5">
        {loading ? (
          <div className="space-y-3" aria-hidden>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
            <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("pages.dashFragments.couldntLoadReport")} {error}
          </div>
        ) : !report || report.rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">{t("pages.leadSourceRoi.empty")}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label={t("pages.leadSourceRoi.leads")} value={formatNumber(report.totals.leads)} />
              <Kpi label={t("pages.leadSourceRoi.closes")} value={formatNumber(report.totals.won)} />
              <Kpi label={t("pages.leadSourceRoi.conversion")} value={formatPct(report.totals.conversionPct)} />
              <Kpi
                label={t("pages.leadSourceRoi.revenue")}
                value={formatMoney(report.totals.totalVolume)}
                subtext={
                  report.totals.avgDealValue > 0
                    ? `Avg deal ${formatMoney(report.totals.avgDealValue)}`
                    : undefined
                }
              />
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-700"
                    >{t("pages.leadSourceRoi.source")}</th>
                    {SORTS.map((s) => (
                      <th
                        key={s.key}
                        scope="col"
                        className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-700"
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(s.key)}
                          className={`inline-flex items-center gap-1 ${
                            sortKey === s.key ? "text-slate-900" : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          {s.label}
                          {sortKey === s.key ? (
                            <span aria-hidden className="text-[10px]">{sortDesc ? "▼" : "▲"}</span>
                          ) : null}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedRows.map((r) => (
                    <SourceRow key={r.sourceKey} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Kpi(props: { label: string; value: string; subtext?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {props.label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
        {props.value}
      </div>
      {props.subtext ? (
        <div className="mt-0.5 text-[11px] text-slate-500">{props.subtext}</div>
      ) : null}
    </div>
  );
}

function SourceRow({ row }: { row: LeadSourceRoiRow }) {
  const { t } = useTranslation("dashboard");
  const isUnknown = row.sourceKey === "__unknown__";
  return (
    <tr className={isUnknown ? "bg-slate-50/60" : undefined}>
      <td className="px-4 py-2.5">
        <div className="text-sm font-semibold text-slate-900">{row.sourceLabel}</div>
        {row.avgDaysToClose != null ? (
          <div className="mt-0.5 text-[11px] text-slate-500">{t("pages.dashFragments.avg")} {row.avgDaysToClose.toFixed(0)}{t("pages.dashFragments.dToClose")}</div>
        ) : null}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.totalVolume)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.leads)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.won)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{formatPct(row.conversionPct)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {row.avgDealValue > 0 ? formatMoney(row.avgDealValue) : "—"}
      </td>
    </tr>
  );
}
