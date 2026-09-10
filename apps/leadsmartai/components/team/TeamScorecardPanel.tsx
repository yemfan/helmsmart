"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { downloadCsv, toCsv } from "@/lib/teams/csv";
import type { MemberDirectory } from "@/lib/teams/directory.server";
import { delta } from "@/lib/teams/performance";
import type { Health, HealthItem, MonthPoint, Scorecard } from "@/lib/teams/scorecard";

/**
 * The brokerage scorecard on /dashboard/team: the office's closings,
 * volume and commission by month for twelve months, the trailing year
 * against the year before, the market measures (days on market,
 * sale-to-list), the pipeline, and how healthy each open deal is.
 *
 * Three small charts rather than one with two axes: closings, dollars of
 * volume and dollars of commission are different scales, and a shared
 * month axis is what makes them comparable. Each bar has a tooltip; a
 * table view carries every number.
 */

const HEALTH_TONE: Record<Health, string> = {
  on_track: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  due_soon: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  at_risk: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
};

function Change({ current, previous, locale }: { current: number; previous: number; locale: string }) {
  const { t } = useTranslation("dashboard");
  const d = delta(current, previous);
  if (d == null) return current > 0 ? <span className="text-xs text-emerald-700 dark:text-emerald-400">{t("pages.teamPerformance.new")}</span> : <span className="text-xs text-slate-400">—</span>;
  if (d === 0) return <span className="text-xs text-slate-500">{t("pages.teamPerformance.same")}</span>;
  const pct = (Math.abs(d) * 100).toLocaleString(locale, { maximumFractionDigits: 0 });
  return <span className={`text-xs ${d > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>{d > 0 ? "↑" : "↓"} {pct}%</span>;
}

/**
 * Twelve bars on one baseline, at most 24px thick with a 2px surface gap,
 * a 4px rounded data-end, hairline gridlines, the peak labelled, and a
 * tooltip on hover. Coordinates live in a 360×150 viewBox so the SVG
 * scales with its column.
 */
function MonthBars({ months, pick, format, label, locale }: { months: MonthPoint[]; pick: (m: MonthPoint) => number; format: (n: number) => string; label: string; locale: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 360;
  const H = 150;
  const top = 18;
  const bottom = 24;
  const plotH = H - top - bottom;
  const values = months.map(pick);
  const max = Math.max(...values, 0);
  const slot = W / months.length;
  const barW = Math.min(24, slot - 6);
  const y = (v: number) => top + plotH - (max > 0 ? (v / max) * plotH : 0);
  const peak = max > 0 ? values.indexOf(max) : -1;
  const monthLabel = (m: string, i: number) => {
    const d = new Date(`${m}-01T00:00:00Z`);
    const short = d.toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
    return i === 0 || m.endsWith("-01") ? `${short} ${String(d.getUTCFullYear()).slice(2)}` : short;
  };
  return (
    <figure className="relative m-0">
      <figcaption className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-auto w-full" role="img" aria-label={label}>
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={top + plotH * (1 - f)} y2={top + plotH * (1 - f)} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth={1} />
        ))}
        {months.map((m, i) => {
          const v = values[i];
          const x = i * slot + (slot - barW) / 2;
          const h = Math.max(0, top + plotH - y(v));
          const r = Math.min(4, h);
          const path = h <= 0 ? "" : `M${x},${top + plotH} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`;
          return (
            <g key={m.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${monthLabel(m.month, i)}: ${format(v)}`}>
              <rect x={i * slot} y={top} width={slot} height={plotH + bottom} fill="transparent" />
              {path ? <path d={path} className={hover === i ? "fill-blue-700 dark:fill-blue-400" : "fill-blue-600 dark:fill-blue-500"} /> : null}
              {i === peak ? (
                <text x={x + barW / 2} y={y(v) - 5} textAnchor="middle" className="fill-slate-700 dark:fill-slate-300" fontSize={10} fontVariant="tabular-nums">
                  {format(v)}
                </text>
              ) : null}
              <text x={i * slot + slot / 2} y={H - 8} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize={9}>
                {monthLabel(m.month, i).split(" ")[0]}
              </text>
            </g>
          );
        })}
      </svg>
      {hover != null ? (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow dark:bg-slate-100 dark:text-slate-900" role="status">
          {monthLabel(months[hover].month, hover)} · {format(values[hover])}
        </div>
      ) : null}
    </figure>
  );
}

export function TeamScorecardPanel({ teamId, directory }: { teamId: string; directory: MemberDirectory }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const k = (s: string, vars?: Record<string, unknown>) => t(`pages.teamScorecard.${s}`, vars);
  const [data, setData] = useState<Scorecard | null>(null);
  const [failed, setFailed] = useState(false);
  const [table, setTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/team/${teamId}/scorecard`)
      .then((r) => r.json())
      .then((j: { ok: boolean; scorecard?: Scorecard }) => {
        if (cancelled) return;
        if (j.ok && j.scorecard) setData(j.scorecard);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const money = (n: number) => n.toLocaleString(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const compact = (n: number) => n.toLocaleString(locale, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
  const num = (n: number) => n.toLocaleString(locale);
  const pct = (r: number) => `${(r * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
  const who = (id: string) => directory[id]?.name ?? directory[id]?.email ?? id;
  const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale, { month: "short", year: "numeric", timeZone: "UTC" });
  const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" }) : "");
  const tile = "rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700";
  const dt = "text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400";
  const dd = "text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100";
  const sub = "text-xs text-slate-500 dark:text-slate-400";
  const th = "px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-slate-500";
  const td = "px-3 py-2 text-right text-sm tabular-nums text-slate-800 dark:text-slate-200";

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      "brokerage-scorecard-12m.csv",
      toCsv(
        [k("col.month"), k("col.closed"), k("col.volume"), k("col.gci"), k("col.contracts"), k("col.listingsTaken")],
        data.months.map((m) => [m.month, m.closed, m.volume, m.gci, m.contracts, m.listingsTaken]),
      ),
    );
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{k("title")}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{k("subtitle")}</p>
        </div>
        {data ? (
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setTable((v) => !v)} aria-pressed={table} className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-medium transition ${table ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
              {k("tableView")}
            </button>
            <button type="button" onClick={exportCsv} className="inline-flex min-h-8 items-center rounded-full bg-slate-100 px-3 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
              {t("pages.teamPerformance.exportCsv")}
            </button>
          </div>
        ) : null}
      </div>

      {failed ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t("pages.teamPerformance.loadFailed")}</p>
      ) : !data ? (
        <div className="mt-4 h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-busy />
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { key: "closed", value: num(data.trailing.closed), cur: data.trailing.closed, prev: data.prior.closed },
              { key: "volume", value: money(data.trailing.volume), cur: data.trailing.volume, prev: data.prior.volume },
              { key: "gci", value: money(data.trailing.gci), cur: data.trailing.gci, prev: data.prior.gci },
              { key: "avgPrice", value: data.trailing.avgPrice != null ? money(data.trailing.avgPrice) : "—", cur: data.trailing.avgPrice ?? 0, prev: data.prior.avgPrice ?? 0 },
            ].map((x) => (
              <div key={x.key} className={tile}>
                <dt className={dt}>{k(`stat.${x.key}`)}</dt>
                <dd className={dd}>{x.value}</dd>
                <dd>
                  <Change current={x.cur} previous={x.prev} locale={locale} />
                  <span className="ml-1 text-xs text-slate-400">{k("vsPriorYear")}</span>
                </dd>
              </div>
            ))}
          </dl>

          {table ? (
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[40rem]">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className={`${th} text-left`}>{k("col.month")}</th>
                    <th className={th}>{k("col.closed")}</th>
                    <th className={th}>{k("col.volume")}</th>
                    <th className={th}>{k("col.gci")}</th>
                    <th className={th}>{k("col.contracts")}</th>
                    <th className={th}>{k("col.listingsTaken")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.months.map((m) => (
                    <tr key={m.month}>
                      <td className={`${td} text-left`}>{monthName(m.month)}</td>
                      <td className={td}>{num(m.closed)}</td>
                      <td className={td}>{money(m.volume)}</td>
                      <td className={td}>{money(m.gci)}</td>
                      <td className={td}>{num(m.contracts)}</td>
                      <td className={td}>{num(m.listingsTaken)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <MonthBars months={data.months} pick={(m) => m.closed} format={num} label={k("chart.closed")} locale={locale} />
              <MonthBars months={data.months} pick={(m) => m.volume} format={compact} label={k("chart.volume")} locale={locale} />
              <MonthBars months={data.months} pick={(m) => m.gci} format={compact} label={k("chart.gci")} locale={locale} />
            </div>
          )}

          <h3 className="mt-6 text-sm font-semibold text-slate-900 dark:text-slate-100">{k("marketTitle")}</h3>
          <dl className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className={tile}>
              <dt className={dt}>{k("stat.dom")}</dt>
              <dd className={dd}>{data.market.medianDom != null ? k("days", { count: data.market.medianDom }) : "—"}</dd>
              <dd className={sub}>{data.market.domSample > 0 ? k("domNote", { avg: data.market.avgDom ?? 0, n: data.market.domSample }) : k("noSample")}</dd>
            </div>
            <div className={tile}>
              <dt className={dt}>{k("stat.saleToList")}</dt>
              <dd className={dd}>{data.market.saleToList != null ? pct(data.market.saleToList) : "—"}</dd>
              <dd className={sub}>{data.market.saleToListSample > 0 ? k("sample", { n: data.market.saleToListSample }) : k("noSample")}</dd>
            </div>
            <div className={tile}>
              <dt className={dt}>{k("stat.inventory")}</dt>
              <dd className={dd}>{num(data.market.activeListings)}</dd>
              <dd className={sub}>{money(data.market.activeListVolume)}</dd>
            </div>
            <div className={tile}>
              <dt className={dt}>{k("stat.underContract")}</dt>
              <dd className={dd}>{num(data.market.pending.count)}</dd>
              <dd className={sub}>{money(data.market.pending.volume)}</dd>
            </div>
            <div className={tile}>
              <dt className={dt}>{k("stat.closing30")}</dt>
              <dd className={dd}>{num(data.market.closingNext30.count)}</dd>
              <dd className={sub}>{money(data.market.closingNext30.volume)}</dd>
            </div>
            <div className={tile}>
              <dt className={dt}>{k("stat.fallThrough")}</dt>
              <dd className={dd}>{data.trailing.fallThroughRate != null ? pct(data.trailing.fallThroughRate) : "—"}</dd>
              <dd className={sub}>{k("fallThroughNote", { count: data.trailing.terminated })}</dd>
            </div>
            <div className={tile}>
              <dt className={dt}>{k("stat.producing")}</dt>
              <dd className={dd}>
                {num(data.trailing.producingAgents)} <span className="text-sm font-normal text-slate-500">/ {num(data.members)}</span>
              </dd>
              <dd className={sub}>{data.trailing.closingsPerProducer != null ? k("perProducer", { n: data.trailing.closingsPerProducer.toLocaleString(locale, { maximumFractionDigits: 1 }) }) : "—"}</dd>
            </div>
            <div className={tile}>
              <dt className={dt}>{k("stat.sides")}</dt>
              <dd className={dd}>
                {num(data.trailing.listingSide)} <span className="text-sm font-normal text-slate-500">/ {num(data.trailing.buyerSide)}</span>
              </dd>
              <dd className={sub}>{k("sidesNote")}</dd>
              {data.trailing.listingSide + data.trailing.buyerSide > 0 ? (
                <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
                  <div className="bg-blue-600" style={{ width: `${(data.trailing.listingSide / (data.trailing.listingSide + data.trailing.buyerSide)) * 100}%` }} />
                </div>
              ) : null}
            </div>
          </dl>

          <h3 className="mt-6 text-sm font-semibold text-slate-900 dark:text-slate-100">{k("healthTitle")}</h3>
          <p className={`mt-0.5 ${sub}`}>{k("healthSub")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["on_track", "due_soon", "at_risk"] as Health[]).map((h) => (
              <span key={h} className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 ${HEALTH_TONE[h]}`}>
                <span className="font-semibold tabular-nums">{num(data.market.health[h === "on_track" ? "onTrack" : h === "due_soon" ? "dueSoon" : "atRisk"])}</span>
                {k(`health.${h}`)}
                {h === "at_risk" && data.market.health.atRiskVolume > 0 ? <span className="opacity-80">· {compact(data.market.health.atRiskVolume)}</span> : null}
              </span>
            ))}
          </div>
          {data.market.health.items.length > 0 ? (
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[44rem]">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className={`${th} text-left`}>{k("col.deal")}</th>
                    <th className={`${th} text-left`}>{t("pages.teamPerformance.agent")}</th>
                    <th className={`${th} text-left`}>{k("col.status")}</th>
                    <th className={`${th} text-left`}>{k("col.due")}</th>
                    <th className={th}>{k("col.price")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.market.health.items.map((i: HealthItem) => (
                    <tr key={i.id}>
                      <td className={`${td} text-left font-medium`}>{i.address ?? k("noAddress")}</td>
                      <td className={`${td} text-left`}>{who(i.agentId)}</td>
                      <td className={`${td} text-left`}>
                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ring-1 ${HEALTH_TONE[i.health]}`}>
                          {i.issue ? k(`issue.${i.issue}`) : k(`health.${i.health}`)}
                          {i.daysLate != null && i.daysLate > 0 ? ` · ${k("daysLate", { count: i.daysLate })}` : i.daysLate != null ? ` · ${k("daysLeft", { count: -i.daysLate })}` : ""}
                        </span>
                      </td>
                      <td className={`${td} text-left whitespace-nowrap`}>{day(i.dueOn)}</td>
                      <td className={td}>{i.price != null ? money(i.price) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={`mt-2 ${sub}`}>{data.market.pending.count > 0 ? k("allOnTrack") : k("nothingOpen")}</p>
          )}
          <p className={`mt-3 ${sub}`}>{k("note")}</p>
        </>
      )}
    </section>
  );
}
