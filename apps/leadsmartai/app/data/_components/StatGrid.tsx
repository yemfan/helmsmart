import type { LatestMetric } from "@/lib/research/warehouse/read";
import {
  METRIC_ORDER,
  metricShort,
  formatValue,
  formatPeriod,
  isNum,
} from "@/lib/research/warehouse/format";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";

/**
 * Latest-metrics stat grid, ordered by METRIC_ORDER (headline metrics first).
 * Renders only metrics that have a finite value; each tile shows the formatted
 * value, its metric label, and the observation period.
 */
export default async function StatGrid({ metrics }: { metrics: LatestMetric[] }) {
  const t = await getServerT();
  const locale = intlLocale(await getServerLocale());
  const byMetric = new Map(metrics.map((m) => [m.metric, m]));
  const ordered = METRIC_ORDER.map((k) => byMetric.get(k)).filter(
    (m): m is LatestMetric => !!m && isNum(m.value),
  );

  if (ordered.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">{t("pages.dataCenterPages.areaRefreshing", { ns: "dashboard" })}</div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((m) => {
        const compact = m.unit === "usd" || m.unit === "index" || m.unit === "count";
        return (
          <div
            key={m.metric}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.03]"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {metricShort(m.metric, t)}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {formatValue(m.value, m.unit, { compact, t })}
            </p>
            <p className="mt-1 text-xs text-slate-400">{formatPeriod(m.period, locale)}</p>
          </div>
        );
      })}
    </div>
  );
}
