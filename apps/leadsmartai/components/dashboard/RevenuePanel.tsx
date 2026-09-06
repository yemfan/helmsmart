"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Period = "ytd" | "12m" | "all";

type MonthlyBucket = {
  month: string;
  label: string;
  closedCount: number;
  grossCommission: number;
  netCommission: number;
};

type ClosedDeal = {
  id: string;
  property_address: string;
  contact_name: string | null;
  transaction_type: "buyer_rep" | "listing_rep" | "dual";
  purchase_price: number | null;
  commission_pct: number | null;
  gross_commission: number | null;
  agent_net_commission: number | null;
  mutual_acceptance_date: string | null;
  closing_date_actual: string | null;
  days_to_close: number | null;
};

type RevenueData = {
  period: Period;
  closedCount: number;
  grossCommission: number;
  netCommission: number;
  activePipelineCount: number;
  expectedGrossFromActive: number;
  offersSubmitted: number;
  offersAccepted: number;
  offersLost: number;
  closeRatePct: number | null;
  avgDaysToClose: number | null;
  byMonth: MonthlyBucket[];
  closedDeals: ClosedDeal[];
};

const PERIOD_LABEL: Record<Period, string> = {
  ytd: "Year to date",
  "12m": "Last 12 months",
  all: "All time",
};

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function RevenuePanel() {
  const { t } = useTranslation("dashboard");
  const [period, setPeriod] = useState<Period>("ytd");
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/performance/revenue?period=${p}`);
      const body = (await res.json().catch(() => ({}))) as RevenueData & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || body.ok === false) {
        setError(body.error ?? "Failed to load revenue data.");
        return;
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  const csvHref = useMemo(() => `/api/performance/revenue/export?period=${period}`, [period]);

  if (loading && !data) {
    return <div className="py-8 text-center text-sm text-slate-400">{t("pages.revenuePanel.loading")}</div>;
  }
  if (error) {
    return <div className="py-4 text-sm text-red-600">{error}</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-0.5 text-xs">
          {(["ytd", "12m", "all"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                period === p ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
        <a
          href={csvHref}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          ↓ {t("pages.revenuePanel.downloadCsv")}
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label={t("pages.revenuePanel.closed")} value={String(data.closedCount)} hint="deals" />
        <Stat label={t("pages.revenuePanel.grossCommission")} value={formatMoney(data.grossCommission)} tone="green" />
        <Stat label={t("pages.revenuePanel.net")} value={formatMoney(data.netCommission)} tone="green" />
        <Stat
          label={t("pages.revenuePanel.avgDaysToClose")}
          value={data.avgDaysToClose != null ? String(data.avgDaysToClose) : "—"}
          hint={data.avgDaysToClose != null ? "days from mutual accept" : undefined}
        />
        <Stat
          label={t("pages.revenuePanel.closeRate")}
          value={data.closeRatePct != null ? `${data.closeRatePct}%` : "—"}
          hint={
            data.closeRatePct != null
              ? `${data.offersAccepted}/${data.offersAccepted + data.offersLost} offers`
              : "no offers in period"
          }
          tone={data.closeRatePct != null && data.closeRatePct >= 50 ? "green" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.revenuePanel.pipeline")}</h3>
            <span className="text-[11px] text-slate-500">{t("pages.revenuePanel.activeDeals")}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.activePipelineCount}</div>
              <div className="text-[11px] text-slate-500">{t("pages.revenuePanel.activeTransactions")}</div>
            </div>
            <div className="text-slate-300">|</div>
            <div>
              <div className="text-2xl font-bold text-blue-700">
                {formatMoney(data.expectedGrossFromActive)}
              </div>
              <div className="text-[11px] text-slate-500">{t("pages.revenuePanel.expectedGross")}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.revenuePanel.offerFunnel")}</h3>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{data.offersSubmitted}</div>
              <div className="text-[11px] text-slate-500">{t("pages.revenuePanel.submitted")}</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-700">{data.offersAccepted}</div>
              <div className="text-[11px] text-slate-500">{t("pages.revenuePanel.accepted")}</div>
            </div>
            <div>
              <div className="text-xl font-bold text-red-600">{data.offersLost}</div>
              <div className="text-[11px] text-slate-500">{t("pages.revenuePanel.lost")}</div>
            </div>
          </div>
        </div>
      </div>

      {data.byMonth.length > 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.revenuePanel.monthlyGross")}</h3>
          <div className="mt-3 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byMonth} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="#94a3b8"
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                {/* Cast formatter — recharts v3's Formatter generic is too
                    strict to accept a plain (v: number) => string. All
                    consumers in this codebase use the same cast. */}
                <Tooltip
                  formatter={((v: number) => formatMoney(v)) as unknown as never}
                  labelClassName="text-xs"
                />
                <Bar dataKey="grossCommission" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.revenuePanel.closedDeals")}</h3>
          <span className="text-[11px] text-slate-500">
            {data.closedDeals.length} {data.closedDeals.length === 1 ? "deal" : "deals"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("detail.offerDetail.closed")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.revenuePanel.colProperty")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("pages.revenuePanel.colClient")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("pages.revenuePanel.colPrice")}</th>
                <th className="px-3 py-2 text-right font-medium">%</th>
                <th className="px-3 py-2 text-right font-medium">{t("pages.revenuePanel.colGross")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("pages.revenuePanel.colNet")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("pages.revenuePanel.colDays")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.closedDeals.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    {d.closing_date_actual ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/dashboard/transactions/${d.id}`}
                      className="font-medium text-slate-900 dark:text-slate-100 hover:underline"
                    >
                      {d.property_address}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{d.contact_name ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {formatMoney(d.purchase_price)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                    {d.commission_pct != null ? `${d.commission_pct}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-900 dark:text-slate-100">
                    {formatMoney(d.gross_commission)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-green-700">
                    {formatMoney(d.agent_net_commission)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {d.days_to_close ?? "—"}
                  </td>
                </tr>
              ))}
              {data.closedDeals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">{t("pages.revenue.noClosed")}</td>
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
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "green";
}) {
  const color = tone === "green" ? "text-green-700" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-sm">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${color}`}>{value}</div>
      {hint ? <div className="text-[10px] text-slate-400">{hint}</div> : null}
    </div>
  );
}
