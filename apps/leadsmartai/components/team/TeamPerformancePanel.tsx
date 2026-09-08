"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { delta, type PerformanceMetrics, type PerformanceRow, type TeamPerformance } from "@/lib/teams/performance";

/**
 * Team performance on /dashboard/team: a window picker, four headline
 * figures with their change from the window before, and a sortable table
 * with one row per agent, a rank for closers, and a team total.
 *
 * A change from zero is shown as "new", never as a percentage; a dash is a
 * dash. Sorting is by clicking a column header; the default is the money.
 */

const WINDOWS = [7, 30, 90, 365] as const;
type SortKey = keyof PerformanceMetrics;

const COLUMNS: { key: SortKey; money?: boolean; hide?: string }[] = [
  { key: "newLeads" },
  { key: "conversations", hide: "hidden lg:table-cell" },
  { key: "callsAnswered", hide: "hidden lg:table-cell" },
  { key: "appointments" },
  { key: "dealsOpened", hide: "hidden md:table-cell" },
  { key: "dealsClosed" },
  { key: "closedVolume", money: true },
  { key: "commission", money: true, hide: "hidden md:table-cell" },
  { key: "hubViews", hide: "hidden xl:table-cell" },
  { key: "hubLeads", hide: "hidden xl:table-cell" },
  { key: "postsPublished", hide: "hidden xl:table-cell" },
];

function Change({ current, previous, locale }: { current: number; previous: number; locale: string }) {
  const { t } = useTranslation("dashboard");
  const d = delta(current, previous);
  if (d == null) {
    return current > 0 ? <span className="text-xs text-emerald-700 dark:text-emerald-400">{t("pages.teamPerformance.new")}</span> : <span className="text-xs text-slate-400">—</span>;
  }
  const pct = (Math.abs(d) * 100).toLocaleString(locale, { maximumFractionDigits: 0 });
  if (d === 0) return <span className="text-xs text-slate-500">{t("pages.teamPerformance.same")}</span>;
  return <span className={`text-xs ${d > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{d > 0 ? "↑" : "↓"} {pct}%</span>;
}

export function TeamPerformancePanel({ teamId }: { teamId: string }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamPerformance.${s}`, vars);
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [data, setData] = useState<TeamPerformance | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<SortKey>("closedVolume");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    fetch(`/api/team/${teamId}/performance?days=${days}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; performance?: TeamPerformance }) => {
        if (cancelled) return;
        if (j.ok && j.performance) setData(j.performance);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [teamId, days]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (sort === "closedVolume") return data.rows;
    return [...data.rows].sort((a, b) => b[sort] - a[sort] || b.closedVolume - a.closedVolume);
  }, [data, sort]);

  const money = (n: number) => n.toLocaleString(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const num = (n: number) => n.toLocaleString(locale);
  const cell = (key: SortKey, m: PerformanceMetrics) => (COLUMNS.find((c) => c.key === key)?.money ? money(m[key]) : num(m[key]));
  const th = "px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500";
  const td = "px-3 py-2 text-right text-sm tabular-nums text-slate-800 dark:text-slate-200";
  const chip = (active: boolean) =>
    `inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium transition ${active ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`;

  const headline: { key: SortKey; money?: boolean }[] = [{ key: "newLeads" }, { key: "appointments" }, { key: "dealsClosed" }, { key: "closedVolume", money: true }];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{k("title")}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{k("subtitle")}</p>
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label={k("window")}>
          {WINDOWS.map((w) => (
            <button key={w} type="button" role="tab" aria-selected={days === w} className={chip(days === w)} onClick={() => setDays(w)}>
              {k(`days.${w}`)}
            </button>
          ))}
        </div>
      </div>

      {failed ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{k("loadFailed")}</p>
      ) : !data ? (
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-busy />
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {headline.map(({ key, money: isMoney }) => (
              <div key={key} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k(`col.${key}`)}</dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{isMoney ? money(data.totals[key]) : num(data.totals[key])}</dd>
                <dd>
                  <Change current={data.totals[key]} previous={data.previousTotals[key]} locale={locale} />
                  <span className="ml-1 text-xs text-slate-400">{k("vsPrevious")}</span>
                </dd>
              </div>
            ))}
          </dl>

          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{k("empty")}</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[56rem]">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500">{k("agent")}</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className={`${th} ${c.hide ?? ""}`}>
                        <button type="button" onClick={() => setSort(c.key)} className={`hover:underline ${sort === c.key ? "text-slate-900 dark:text-slate-100" : ""}`} aria-sort={sort === c.key ? "descending" : undefined}>
                          {k(`col.${c.key}`)}
                          {sort === c.key ? " ↓" : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((r: PerformanceRow) => (
                    <tr key={r.agentId}>
                      <td className="px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
                        <span className="inline-flex items-center gap-2">
                          {r.rank > 0 && r.rank <= 3 ? (
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${r.rank === 1 ? "bg-amber-400 text-amber-950" : r.rank === 2 ? "bg-slate-300 text-slate-800" : "bg-orange-300 text-orange-950"}`} aria-label={k("rank", { rank: r.rank })}>
                              {r.rank}
                            </span>
                          ) : null}
                          <span className="font-medium">{r.name ?? r.email ?? r.agentId}</span>
                          {r.role === "owner" ? <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-blue-700 ring-1 ring-blue-200">{t("pages.team.owner")}</span> : null}
                        </span>
                      </td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className={`${td} ${c.hide ?? ""}`}>
                          {cell(c.key, r)}
                          {c.key === sort ? (
                            <span className="block">
                              <Change current={r[c.key]} previous={r.previous[c.key]} locale={locale} />
                            </span>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-medium dark:bg-slate-800/60">
                  <tr>
                    <td className="px-3 py-2 text-xs uppercase tracking-wider text-slate-500">{k("teamTotal")}</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className={`${td} ${c.hide ?? ""}`}>
                        {cell(c.key, data.totals)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{k("note")}</p>
        </>
      )}
    </section>
  );
}
