import { requireRolePage } from "@/lib/auth/requireRolePage";
import { getSeoReport } from "@/lib/gsc/report";

export const dynamic = "force-dynamic";
export const metadata = { title: "SEO / Search Console | Admin" };

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtPos(p: number | null): string {
  return p == null ? "—" : p.toFixed(1);
}

export default async function AdminSeoPage() {
  await requireRolePage(["admin"]);

  const report = await getSeoReport();
  const { windowDays, hasData, siteSummaries, topPages, topQueries, clusterCoverage } = report;

  const coveragePct =
    clusterCoverage.generatedClusterPages > 0
      ? (clusterCoverage.clusterPagesWithImpressions / clusterCoverage.generatedClusterPages) * 100
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">SEO / Search Console</h1>
      <p className="mt-2 text-sm text-slate-600">
        Google Search Console performance for the last <strong>{windowDays} days</strong>. Data is
        imported daily by the <code>/api/cron/gsc-import</code> cron and lags GSC by ~2-3 days.
      </p>

      {!hasData ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">No Search Console data yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-600">
            The <code>gsc_page_metrics</code> / <code>gsc_query_metrics</code> tables are empty. This
            is expected if the <code>/api/cron/gsc-import</code> cron hasn&apos;t run yet, GSC was
            just connected, or the <code>GSC_OAUTH_*</code> / <code>GSC_SITE_URLS</code> env vars are
            not set. Data will appear here after the first successful import.
          </p>
        </div>
      ) : (
        <>
          {/* Per-site summary cards */}
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              By site
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {siteSummaries.map((s) => (
                <div
                  key={s.site}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="truncate text-sm font-semibold text-slate-900" title={s.site}>
                    {s.site}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <Metric label="Indexed pages" value={fmt(s.indexedPages)} />
                    <Metric label="Avg position" value={fmtPos(s.avgPosition)} />
                    <Metric label="Clicks" value={fmt(s.clicks)} />
                    <Metric label="Impressions" value={fmt(s.impressions)} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              <strong>Indexed pages</strong> = distinct pages with at least one impression in the
              window (a proxy for &quot;indexed &amp; served in search&quot;).
            </p>
          </section>

          {/* Cluster coverage */}
          <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Programmatic cluster coverage (/guides/)
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Metric
                label="Generated cluster pages"
                value={fmt(clusterCoverage.generatedClusterPages)}
              />
              <Metric
                label="Cluster pages with impressions"
                value={fmt(clusterCoverage.clusterPagesWithImpressions)}
              />
              <Metric
                label="Coverage"
                value={coveragePct == null ? "—" : `${coveragePct.toFixed(1)}%`}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Of {fmt(clusterCoverage.generatedClusterPages)} generated{" "}
              <code>seo_cluster_pages</code>, {fmt(clusterCoverage.clusterPagesWithImpressions)} have
              had at least one impression (matched on the <code>/guides/</code> path prefix in GSC
              page URLs) in the last {windowDays} days.
            </p>
          </section>

          {/* Top pages */}
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Top 25 pages by impressions
            </h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Page</th>
                    <th className="px-3 py-2 text-right font-medium">Clicks</th>
                    <th className="px-3 py-2 text-right font-medium">Impr.</th>
                    <th className="px-3 py-2 text-right font-medium">Avg pos.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topPages.map((p) => (
                    <tr key={p.page} className="hover:bg-slate-50">
                      <td className="max-w-md truncate px-3 py-2 text-slate-900" title={p.page}>
                        {p.page}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {fmt(p.clicks)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                        {fmt(p.impressions)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {fmtPos(p.avgPosition)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Top queries */}
          <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Top 25 queries by impressions
            </h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Query</th>
                    <th className="px-3 py-2 text-right font-medium">Clicks</th>
                    <th className="px-3 py-2 text-right font-medium">Impr.</th>
                    <th className="px-3 py-2 text-right font-medium">Avg pos.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topQueries.map((q) => (
                    <tr key={q.query} className="hover:bg-slate-50">
                      <td className="max-w-md truncate px-3 py-2 text-slate-900" title={q.query}>
                        {q.query}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {fmt(q.clicks)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                        {fmt(q.impressions)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {fmtPos(q.avgPosition)}
                      </td>
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
    <div>
      <div className="text-lg font-bold tabular-nums text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}
