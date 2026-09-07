"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type MonthlyBucket = {
  month: string;
  label: string;
  count: number;
  grossCommission: number;
  netCommission: number;
  weightedGross: number;
  weightedNet: number;
};

type TypeBucket = {
  count: number;
  gross: number;
  net: number;
  weightedGross: number;
  weightedNet: number;
};

type ForecastData = {
  totalCount: number;
  grossCommission: number;
  netCommission: number;
  weightedGross: number;
  weightedNet: number;
  pastDueCount: number;
  byMonth: MonthlyBucket[];
  byType: {
    buyer_rep: TypeBucket;
    listing_rep: TypeBucket;
    dual: TypeBucket;
  };
};

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Pipeline-forecast panel — the forward-looking complement to RevenuePanel.
 *
 *   * RevenuePanel = "what I've already earned" (closed deals)
 *   * PipelineForecastPanel = "what's about to land" (active + pending)
 *
 * Each in-flight deal gets a close-date-proximity weight (see
 * lib/performance/commissionForecast.ts) so the agent sees BOTH the
 * raw "if everything closes" gross AND a more honest "expected to land"
 * weighted total. The gap between the two is itself useful — a big gap
 * means the pipeline is loaded with deals far out, which is normal for
 * a listing-heavy agent and unusual for a buyer-rep agent.
 */
export function PipelineForecastPanel() {
  const { t } = useTranslation("dashboard");
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/performance/commission-forecast", {
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as ForecastData & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || body.ok === false) {
        setError(body.error ?? "Failed to load forecast data.");
        return;
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <div className="h-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{t("pages.dashFragments.couldntLoadForecast")} {error}
      </div>
    );
  }

  if (!data) return null;

  const hasAny = data.totalCount > 0;

  return (
    <div className="space-y-4">
      <KpiStrip data={data} />

      {!hasAny ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 px-4 py-6 text-center text-sm text-slate-600 dark:text-slate-400">{t("pages.pipelineForecast.empty")}</div>
      ) : (
        <>
          <ForecastByMonthChart buckets={data.byMonth} />
          <TypeBreakdownTable byType={data.byType} />
        </>
      )}
    </div>
  );
}

function KpiStrip({ data }: { data: ForecastData }) {
  const cells = [
    {
      label: "In-flight deals",
      value: String(data.totalCount),
      hint: data.pastDueCount > 0 ? `${data.pastDueCount} past their close date` : "active + pending",
      tone: data.pastDueCount > 0 ? "text-amber-700" : "text-slate-900",
    },
    {
      label: "If everything closes",
      value: formatMoney(data.grossCommission),
      hint: `${formatMoney(data.netCommission)} net`,
      tone: "text-slate-900",
    },
    {
      label: "Expected to land",
      value: formatMoney(data.weightedGross),
      hint: `${formatMoney(data.weightedNet)} net (weighted)`,
      tone: "text-emerald-700",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-200 sm:grid-cols-3">
      {cells.map((c) => (
        <div key={c.label} className="bg-white dark:bg-slate-900 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {c.label}
          </p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${c.tone}`}>{c.value}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{c.hint}</p>
        </div>
      ))}
    </div>
  );
}

function ForecastByMonthChart({ buckets }: { buckets: MonthlyBucket[] }) {
  const { t } = useTranslation("dashboard");
  const visible = buckets.filter((b) => b.month !== "no-date");
  const noDate = buckets.find((b) => b.month === "no-date");

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.pipelineForecast.byMonth")}</h3>
          <p className="text-[11px] text-slate-500">
            Bars show gross commission scheduled by close-date month. Darker overlay = weighted by close-date proximity.
          </p>
        </div>
      </header>

      {visible.length > 0 ? (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={visible} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(n: number) => formatCompactMoney(n)}
                width={70}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={((v: number, name: string) => [formatMoney(v), name]) as never}
                labelClassName="font-semibold"
              />
              <Bar dataKey="grossCommission" name="Gross (unweighted)" fill="#cbd5e1" />
              <Bar dataKey="weightedGross" name="Gross (weighted)" fill="#0f766e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-6 text-center text-xs text-slate-500">{t("pages.pipelineForecast.noScheduled")}</p>
      )}

      {noDate ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t("pages.pipelineForecast.dealsNoCloseDate", { count: noDate.count })}{" "}
          {t("pages.pipelineForecast.grossWeighted", { gross: formatMoney(noDate.grossCommission), weighted: formatMoney(noDate.weightedGross) })}</p>
      ) : null}
    </div>
  );
}

function TypeBreakdownTable({
  byType,
}: {
  byType: ForecastData["byType"];
}) {
  const { t } = useTranslation("dashboard");
  const rows = [
    { key: "buyer_rep" as const, label: "Buyer-rep", data: byType.buyer_rep },
    { key: "listing_rep" as const, label: "Listing-rep", data: byType.listing_rep },
    { key: "dual" as const, label: "Dual", data: byType.dual },
  ];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
      <header className="border-b border-slate-100 dark:border-slate-700 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.pipelineForecast.bySide")}</h3>
        <p className="text-[11px] text-slate-500">{t("pages.pipelineForecast.bySideSub")}</p>
      </header>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">{t("pages.pipelineForecast.type")}</th>
            <th className="px-4 py-2 text-right font-semibold">{t("pages.pipelineForecast.deals")}</th>
            <th className="px-4 py-2 text-right font-semibold">{t("pages.pipelineForecast.ifAllClose")}</th>
            <th className="px-4 py-2 text-right font-semibold">{t("pages.pipelineForecast.expected")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-100 dark:border-slate-700">
              <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{r.label}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-900 dark:text-slate-100">{r.data.count}</td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                {formatMoney(r.data.gross)}
                <span className="ml-1 text-[10px] text-slate-500">{t("pages.pipelineForecast.slashNet", { net: formatMoney(r.data.net) })}</span>
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-700">
                {formatMoney(r.data.weightedGross)}
                <span className="ml-1 text-[10px] font-normal text-slate-500">
                  {t("pages.pipelineForecast.slashNet", { net: formatMoney(r.data.weightedNet) })}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCompactMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}
