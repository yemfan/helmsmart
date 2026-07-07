import Link from "next/link";
import type { MatchedGeo } from "@/lib/programmaticSeo/marketMatch";
import { getLatestMetrics } from "@/lib/research/warehouse/read";
import {
  METRIC_META,
  findMetric,
  formatPeriod,
  formatValue,
  isNum,
} from "@/lib/research/warehouse/format";

/**
 * Compact, REAL local-market snapshot shared by the programmatic
 * `/tool/[toolSlug]/[locationSlug]` and `/guides/[topicSlug]/[locationSlug]`
 * pages. Reads the latest warehouse metrics for the matched geography and
 * renders up to four headline stats + a prominent Data Center cross-link.
 *
 * Server component. Reads go through the service-role warehouse client (no
 * cookies/headers) so this is ISR-safe. Renders `null` when there are no metrics
 * so a matched-but-empty geography never produces a broken card.
 */

/** Headline metrics, in preference order — first four present are shown. */
const SNAPSHOT_METRICS: { key: string; label: string }[] = [
  { key: "zhvi", label: "Typical home value" },
  { key: "median_sale_price", label: "Median sale price" },
  { key: "median_dom", label: "Median days on market" },
  { key: "inventory", label: "Homes for sale" },
  { key: "months_supply", label: "Months of supply" },
  { key: "homes_sold", label: "Homes sold" },
  { key: "sale_to_list", label: "Sale-to-list ratio" },
];

export default async function LocalMarketSnapshot({
  geo,
  city,
}: {
  geo: MatchedGeo;
  city: string;
}) {
  const metrics = await getLatestMetrics(geo.geoLevel, geo.geoCode);
  if (metrics.length === 0) return null;

  const tiles = SNAPSHOT_METRICS.map(({ key, label }) => {
    const m = findMetric(metrics, key);
    if (!m || !isNum(m.value)) return null;
    const compact = m.unit === "usd" || m.unit === "index" || m.unit === "count";
    return {
      key,
      label,
      value: formatValue(m.value, m.unit, { compact }),
      period: m.period,
      isZhvi: key === "zhvi",
    };
  })
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .slice(0, 4);

  if (tiles.length === 0) return null;

  const latestPeriod = tiles.reduce<string>(
    (acc, t) => (t.period > acc ? t.period : acc),
    tiles[0].period,
  );
  const showZhviFootnote = tiles.some((t) => t.isZhvi);

  return (
    <section
      aria-label="Local market snapshot"
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">
          Local market snapshot: {geo.geoName}
        </h2>
        <span className="text-xs font-medium uppercase tracking-wide text-blue-700">
          Live Data Center
        </span>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.key}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {METRIC_META[t.key]?.short ?? t.label}
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{t.value}</p>
            <p className="mt-1 text-xs text-slate-400">{t.label}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Data as of {formatPeriod(latestPeriod)} · Source: Zillow Research,
        Redfin, FRED.
        {showZhviFootnote && (
          <>
            {" "}
            The Zillow Home Value Index is a smoothed measure of the typical home
            value, not a raw sale price.
          </>
        )}
      </p>

      <Link
        href={geo.dataHref}
        className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:underline"
      >
        See the full {city} market data →
      </Link>
    </section>
  );
}
