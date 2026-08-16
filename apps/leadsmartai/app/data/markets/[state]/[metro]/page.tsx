import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { getSiteUrl } from "@/lib/siteUrl";
import {
  getGeographyBySlug,
  getLatestMetrics,
  getMetricSeries,
  listMetrosForState,
  type ActiveGeography,
  type LatestMetric,
  type SeriesPoint,
} from "@/lib/research/warehouse/read";
import { geoSlug, stateName } from "@/lib/research/warehouse/slug";
import {
  METRIC_META,
  findMetric,
  formatValue,
  formatPeriod,
  formatPct,
  momChange,
  yoyChange,
  relativePct,
  compareParts,
  metricLabel,
  type Translate,
  isNum,
} from "@/lib/research/warehouse/format";
import Sparkline from "../../../_components/Sparkline";
import StatGrid from "../../../_components/StatGrid";
import DataSources from "../../../_components/DataSources";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ state: string; metro: string }> };

const CHART_METRICS = ["zhvi", "median_sale_price", "median_dom", "inventory"];

async function resolveMetro(
  stateSlugParam: string,
  metroSlugParam: string,
): Promise<{ state: ActiveGeography; metro: ActiveGeography } | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return null;
  try {
    const state = await getGeographyBySlug("state", stateSlugParam);
    if (!state) return null;
    const metro = await getGeographyBySlug("metro", metroSlugParam);
    // Metro must exist AND actually belong to the state in the URL.
    if (!metro || (metro.state ?? "").toUpperCase() !== state.geo_code.toUpperCase()) {
      return null;
    }
    return { state, metro };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state, metro } = await params;
  const resolved = await resolveMetro(state, metro);
  const base = getSiteUrl();
  if (!resolved) return { title: "Metro housing market for agents | CloseBoss Data Center" };

  const { metro: m } = resolved;
  const title = `${m.geo_name} Housing Market Data for Agents — Prices, Inventory & Talking Points | CloseBoss`;
  const description = `The ${m.geo_name} numbers to quote in your CMA and listing appointment: typical home value, median sale price, inventory, and days on market — with month-over-month and year-over-year trends and how ${m.geo_name} compares to its state and the U.S.`;
  return {
    title,
    description,
    alternates: {
      canonical: `${base}/data/markets/${geoSlug(resolved.state)}/${geoSlug(m)}`,
    },
    openGraph: {
      title,
      description,
      url: `${base}/data/markets/${geoSlug(resolved.state)}/${geoSlug(m)}`,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** `higher` -> `Higher`, so a compareParts kind reads as a key suffix. */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function changeLine(
  metrics: LatestMetric[],
  seriesMap: Map<string, SeriesPoint[]>,
  metric: string,
  t: Translate,
): string | null {
  const m = findMetric(metrics, metric);
  if (!m || !isNum(m.value)) return null;
  const series = seriesMap.get(metric) ?? [];
  const mom = momChange(series);
  const yoy = yoyChange(series);
  const T = (k: string, v: Record<string, unknown> = {}) =>
    t(`pages.dataCenterPages.${k}`, { ns: "dashboard", ...v });
  const head = T("changeLine", {
    label: metricLabel(metric, t),
    value: formatValue(m.value, m.unit, { compact: false, t }),
  });
  const parts: string[] = [];
  if (isNum(mom.pct)) parts.push(T("changeMom", { pct: formatPct(mom.pct) }));
  if (isNum(yoy.pct)) parts.push(T("changeYoy", { pct: formatPct(yoy.pct) }));
  return parts.length
    ? T("changeJoin", { head, rest: parts.join("、") })
    : T("changeOnly", { head });
}

export default async function MetroPage({ params }: Props) {
  const t = await getServerT();
  const locale = intlLocale(await getServerLocale());
  const { state, metro } = await params;
  const resolved = await resolveMetro(state, metro);
  if (!resolved) notFound();

  const { state: stateGeo, metro: metroGeo } = resolved;
  const stateCode = stateGeo.geo_code;

  const [metrics, stateMetrics, national, otherMetros] = await Promise.all([
    getLatestMetrics("metro", metroGeo.geo_code),
    getLatestMetrics("state", stateCode),
    getLatestMetrics("national", "US"),
    listMetrosForState(stateCode),
  ]);

  const seriesEntries = await Promise.all(
    CHART_METRICS.map(async (m) => {
      const s = await getMetricSeries("metro", metroGeo.geo_code, m, 13);
      return [m, s] as const;
    }),
  );
  const seriesMap = new Map<string, SeriesPoint[]>(seriesEntries);

  const base = getSiteUrl();
  const zhvi = findMetric(metrics, "zhvi");
  const stZhvi = findMetric(stateMetrics, "zhvi");
  const natZhvi = findMetric(national, "zhvi");
  const periodLabel = zhvi ? formatPeriod(zhvi.period, locale) : "";

  const vsState = relativePct(zhvi?.value ?? null, stZhvi?.value ?? null);
  const vsNational = relativePct(zhvi?.value ?? null, natZhvi?.value ?? null);
  const stName = stateName(stateCode);

  const insightLines = CHART_METRICS.map((m) =>
    changeLine(metrics, seriesMap, m, t),
  ).filter((l): l is string => !!l);

  const otherInState = otherMetros.filter((m) => m.geo_code !== metroGeo.geo_code);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Data Center", item: `${base}/data` },
      { "@type": "ListItem", position: 2, name: "Markets", item: `${base}/data/markets` },
      {
        "@type": "ListItem",
        position: 3,
        name: stName,
        item: `${base}/data/markets/${geoSlug(stateGeo)}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: metroGeo.geo_name,
        item: `${base}/data/markets/${geoSlug(stateGeo)}/${geoSlug(metroGeo)}`,
      },
    ],
  };

  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${metroGeo.geo_name} housing market data`,
    description: `Monthly housing-market metrics for the ${metroGeo.geo_name} metro area: typical home value, median sale price, inventory, and days on market.`,
    url: `${base}/data/markets/${geoSlug(stateGeo)}/${geoSlug(metroGeo)}`,
    creator: { "@type": "Organization", name: "CloseBoss" },
    publisher: { "@type": "Organization", name: "CloseBoss" },
    spatialCoverage: metroGeo.geo_name,
    temporalCoverage: zhvi?.period ?? undefined,
    variableMeasured: metrics
      .filter((m) => isNum(m.value))
      .map((m) => METRIC_META[m.metric]?.label ?? m.metric),
    isBasedOn: [
      "https://www.zillow.com/research/data/",
      "https://www.redfin.com/news/data-center/",
      "https://fred.stlouisfed.org/",
    ],
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={datasetJsonLd} />

      <div className="mx-auto max-w-4xl px-4 py-12 space-y-12">
        <nav className="text-sm">
          <Link href="/" className="font-medium text-[#0072ce] hover:text-[#005ca8]">
            CloseBoss
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <Link href="/data" className="font-medium text-[#0072ce] hover:text-[#005ca8]">{t("pages.articleChrome.dataCenter", { ns: "dashboard" })}</Link>
          <span className="text-slate-400 mx-2">/</span>
          <Link href="/data/markets" className="font-medium text-[#0072ce] hover:text-[#005ca8]">{t("pages.dataCenterPages.markets")}</Link>
          <span className="text-slate-400 mx-2">/</span>
          <Link
            href={`/data/markets/${geoSlug(stateGeo)}`}
            className="font-medium text-[#0072ce] hover:text-[#005ca8]"
          >
            {stName}
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <span className="text-slate-600">{metroGeo.geo_name}</span>
        </nav>

        <header className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#0072ce]">{t("pages.dataCenterPages.metroTitle")}</p>
          <h1 className="text-4xl font-bold leading-tight text-slate-900">
            {t("pages.dataCenterPages.stateHeroTitle", { ns: "dashboard", geo: metroGeo.geo_name })}
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-slate-600">
            {t("pages.dataCenterPages.metroHeroBody", { ns: "dashboard", geo: metroGeo.geo_name })}
            {isNum(vsState)
              ? ` ${t("pages.dataCenterPages.metroAnchor", {
                  ns: "dashboard",
                  cmp:
                    t(
                      `pages.dataCenterPages.vsState${capitalize(compareParts(vsState).kind)}`,
                      { ns: "dashboard", abs: compareParts(vsState).abs ?? "", state: stName },
                    ) +
                    (isNum(vsNational)
                      ? t(
                          `pages.dataCenterPages.andNat${capitalize(compareParts(vsNational).kind)}`,
                          { ns: "dashboard", abs: compareParts(vsNational).abs ?? "" },
                        )
                      : ""),
                })}`
              : ""}
          </p>
          {periodLabel && (
            <p className="text-xs text-slate-500">{t("pages.dataCenterPages.dataAsOf", { ns: "dashboard", period: periodLabel })}</p>
          )}
        </header>

        <section aria-label={t("pages.dataCenterPages.latestAria")} className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">{t("pages.dataCenterPages.latestTitle")}</h2>
          <StatGrid metrics={metrics} />
        </section>

        {insightLines.length > 0 && (
          <section aria-label={t("pages.dataCenterPages.trendsAria")} className="space-y-3">
            <h2 className="text-2xl font-bold text-slate-900">{t("pages.dataCenterPages.trendsTitle")}</h2>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
              {t("pages.dataCenterPages.metroTrendsBody", { ns: "dashboard", geo: metroGeo.geo_name })}
            </p>
            <ul className="space-y-2 text-slate-700">
              {insightLines.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 text-[#0072ce]">·</span>
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label={t("pages.dataCenterPages.chartsAria")} className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">
            13-month trends — the story behind your pricing
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {CHART_METRICS.map((metric) => {
              const series = seriesMap.get(metric) ?? [];
              const unit = findMetric(metrics, metric)?.unit ?? null;
              const label = METRIC_META[metric]?.label ?? metric;
              return (
                <Sparkline
                  key={metric}
                  series={series}
                  unit={unit}
                  label={label}
                  title={`${metroGeo.geo_name} ${label} — trailing 13 months`}
                />
              );
            })}
          </div>
        </section>

        {otherInState.length > 0 && (
          <section aria-label={t("pages.dataCenterPages.otherMetrosAria")} className="space-y-4">
            <h2 className="text-2xl font-bold text-slate-900">
              {t("pages.dataCenterPages.otherMetrosIn", { ns: "dashboard", geo: stName })}
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {otherInState.map((m) => (
                <li key={m.geo_code}>
                  <Link
                    href={`/data/markets/${geoSlug(stateGeo)}/${geoSlug(m)}`}
                    className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#0072ce]/40 hover:text-[#0072ce]"
                  >
                    {m.geo_name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <DataSources />
      </div>
    </main>
  );
}
