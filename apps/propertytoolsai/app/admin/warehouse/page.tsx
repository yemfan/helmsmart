import { requireRolePage } from "@/lib/auth/requireRolePage";
import { supabaseServer } from "@/lib/supabaseServer";
import { getLatestMetrics } from "@/lib/research/warehouse/read";

export const dynamic = "force-dynamic";
export const metadata = { title: "Market Warehouse | Admin" };

type MetricCount = { metric: string; source: string | null; count: number };

/**
 * Internal debug view for the Data Center market warehouse (Phase B).
 * Shows row counts per (source, metric) and the latest national snapshot so we
 * can eyeball that ingestion worked after triggering /api/cron/warehouse-ingest.
 */
async function getCounts(): Promise<{
  totalMetrics: number;
  totalGeos: number;
  byLevel: { geo_level: string; count: number }[];
  perMetric: MetricCount[];
}> {
  // Pull the compact fields and aggregate in-process (row counts are modest:
  // ~top-300 metros × ~5 metrics × 13 months).
  const [{ count: totalMetrics }, { count: totalGeos }, { data: rows }, { data: geoRows }] =
    await Promise.all([
      supabaseServer.from("market_metrics").select("*", { count: "exact", head: true }),
      supabaseServer.from("market_geographies").select("*", { count: "exact", head: true }),
      supabaseServer.from("market_metrics").select("metric, source, geo_level"),
      supabaseServer.from("market_geographies").select("geo_level"),
    ]);

  const perMetricMap = new Map<string, MetricCount>();
  for (const r of (rows ?? []) as { metric: string; source: string | null }[]) {
    const key = `${r.source ?? "?"}::${r.metric}`;
    const existing = perMetricMap.get(key);
    if (existing) existing.count += 1;
    else perMetricMap.set(key, { metric: r.metric, source: r.source, count: 1 });
  }
  const perMetric = Array.from(perMetricMap.values()).sort(
    (a, b) => (a.source ?? "").localeCompare(b.source ?? "") || a.metric.localeCompare(b.metric),
  );

  const levelMap = new Map<string, number>();
  for (const g of (geoRows ?? []) as { geo_level: string }[]) {
    levelMap.set(g.geo_level, (levelMap.get(g.geo_level) ?? 0) + 1);
  }
  const byLevel = Array.from(levelMap.entries()).map(([geo_level, count]) => ({ geo_level, count }));

  return {
    totalMetrics: totalMetrics ?? 0,
    totalGeos: totalGeos ?? 0,
    byLevel,
    perMetric,
  };
}

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtVal(v: number | null, unit: string | null): string {
  if (v == null) return "—";
  if (unit === "usd") return `$${Math.round(v).toLocaleString()}`;
  if (unit === "percent") return `${v.toFixed(2)}%`;
  if (unit === "days") return `${v.toFixed(0)} days`;
  if (unit === "count") return Math.round(v).toLocaleString();
  return v.toLocaleString();
}

export default async function AdminWarehousePage() {
  await requireRolePage(["admin"]);

  const counts = await getCounts();
  const national = await getLatestMetrics("national", "US");
  const hasData = counts.totalMetrics > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Market Warehouse</h1>
      <p className="mt-2 text-sm text-slate-600">
        Structured housing + rate time-series ingested from FRED, Zillow Research and Redfin by the{" "}
        <code>/api/cron/warehouse-ingest</code> cron (monthly, 3rd of month). Phase B foundation for
        the Data Center metro/state pages.
      </p>

      {!hasData ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">No warehouse data yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            The <code>market_metrics</code> table is empty. This is expected until the migration is
            applied and <code>/api/cron/warehouse-ingest</code> has run at least once.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Metric rows" value={fmt(counts.totalMetrics)} />
            <Metric label="Geographies" value={fmt(counts.totalGeos)} />
            {counts.byLevel.map((l) => (
              <Metric key={l.geo_level} label={`${l.geo_level} geos`} value={fmt(l.count)} />
            ))}
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Rows by source &amp; metric
            </h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-left font-medium">Metric</th>
                    <th className="px-3 py-2 text-right font-medium">Rows</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {counts.perMetric.map((m) => (
                    <tr key={`${m.source}-${m.metric}`} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700">{m.source ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-slate-900">{m.metric}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                        {fmt(m.count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Latest national snapshot (US)
            </h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Metric</th>
                    <th className="px-3 py-2 text-right font-medium">Value</th>
                    <th className="px-3 py-2 text-left font-medium">Period</th>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {national.map((m) => (
                    <tr key={m.metric} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-slate-900">{m.metric}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                        {fmtVal(m.value, m.unit)}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{m.period}</td>
                      <td className="px-3 py-2 text-slate-500">{m.source ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-lg font-bold tabular-nums text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
