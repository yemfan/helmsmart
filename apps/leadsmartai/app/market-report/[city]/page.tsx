import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import { formatCurrency, getPageKeywords } from "@/lib/trafficSeo";
import {
  getMetroBySlug,
  getMetroSnapshot,
  getNearbyMetros,
  getRelatedMetroLinks,
} from "@/lib/trafficMetros";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";

// Render on demand — NOT static/ISR, matching the [keyword] child route.
// The root layout reads cookies() -> this tree is dynamic regardless, so the old
// generateStaticParams prerendered 60 metros whose output production never
// served, at the cost of a warehouse round-trip each. Those prerenders blew
// Next's 60s-per-page export budget when the shared database slowed on
// 2026-08-15 and blocked every deploy of both apps. See the home-value route.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city) return {};
  const keywords = getPageKeywords("market-report", city.slug);
  return pageMetadata({
    title: `${city.city}, ${city.state} Market Report | CloseBoss`,
    description: `Current housing trends, days on market, and price movement in ${city.city}, ${city.state}, including ${keywords[0]} analysis.`,
    path: `/market-report/${p.city}`,
  });
}

function fmtDate(period: string | null, locale: string): string | null {
  if (!period) return null;
  const d = new Date(period);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

export default async function MarketReportCityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const t = await getServerT();
  const locale = intlLocale(await getServerLocale());
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city) return notFound();
  const market = await getMetroSnapshot(city.geoLevel, city.geoCode);
  const nearbyCities = await getNearbyMetros(city.slug, 4);
  const relatedPages = getRelatedMetroLinks(city.slug).filter(
    (page) => !page.href.endsWith(`/market-report/${city.slug}`),
  );
  const keywords = getPageKeywords("market-report", city.slug);
  const asOf = fmtDate(market.period, locale);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath={`/market-report/${city.slug}`} city={city.city} source="seo_market_report_city" />
      <h1 className="text-3xl font-bold text-slate-900">
        {city.city}, {city.state} {t("pages.marketReportCity.h1", { ns: "dashboard" })}</h1>
      <p className="mt-2 text-slate-700">{t("pages.marketReportCity.review", { ns: "dashboard" })} {keywords[0]} {t("pages.marketReportCity.dataFor", { ns: "dashboard" })} {city.city} {t("pages.marketReportCity.intoStrategy", { ns: "dashboard" })}</p>
      {asOf ? <p className="mt-1 text-xs text-slate-500">{t("pages.marketReportCity.dataAsOf", { ns: "dashboard" })} {asOf}.</p> : null}

      {(market.typicalValue !== null ||
        market.yoyChangePct !== null ||
        market.medianDaysOnMarket !== null ||
        market.inventory !== null) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {market.typicalValue !== null && (
            <Metric label={t("pages.marketReportCity.typicalValue", { ns: "dashboard" })} value={formatCurrency(market.typicalValue)} />
          )}
          {market.yoyChangePct !== null && (
            <Metric
              label={t("pages.marketReportCity.annualTrend", { ns: "dashboard" })}
              value={`${market.yoyChangePct > 0 ? "+" : ""}${market.yoyChangePct}%`}
            />
          )}
          {market.medianDaysOnMarket !== null && (
            <Metric label={t("pages.marketReportCity.medianDom", { ns: "dashboard" })} value={`${Math.round(market.medianDaysOnMarket)} days`} />
          )}
          {market.inventory !== null && (
            <Metric label={t("pages.marketReportCity.homesForSale", { ns: "dashboard" })} value={Math.round(market.inventory).toLocaleString(locale)} />
          )}
        </div>
      )}

      <section className="mt-8 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">{t("pages.marketReportCity.monthlySummary", { ns: "dashboard" })} {city.city}</h2>
          <p className="mt-2 text-sm text-slate-700">{t("pages.marketReportCity.inventoryDemand", { ns: "dashboard" })} {city.city}. Homeowners evaluating a move can use
            localized pricing data to time the market and improve net proceeds.
          </p>
          <p className="mt-2 text-sm text-slate-700">{t("pages.marketReportCity.trendCurrently", { ns: "dashboard" })} <span className="font-semibold">{market.trend}</span>
            {market.yoyChangePct !== null
              ? `, with typical home values ${market.yoyChangePct >= 0 ? "up" : "down"} ${Math.abs(
                  market.yoyChangePct,
                )}% year over year`
              : ""}
            . When trend is {market.trend}, pricing precision and launch timing become even more important.
          </p>
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-800">{t("pages.marketReportCity.keywordCoverage", { ns: "dashboard" })}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <span key={keyword} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                {keyword}
              </span>
            ))}
          </div>
          <h3 className="mt-5 text-base font-semibold text-slate-900">{t("pages.articleChrome.faq", { ns: "dashboard" })}</h3>
          <dl className="mt-2 space-y-4 text-sm text-slate-700">
            <div>
              <dt className="font-semibold text-slate-900">{t("pages.marketReportCity.howOften", { ns: "dashboard" })} {city.city} {t("pages.marketReportCity.marketReportQ", { ns: "dashboard" })}</dt>
              <dd className="mt-1 ml-0 text-slate-700">{t("pages.marketReportCity.howOftenA", { ns: "dashboard" })}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">{t("pages.marketReportCity.whichMetric", { ns: "dashboard" })}</dt>
              <dd className="mt-1 ml-0 text-slate-700">{t("pages.marketReportCity.whichMetricA", { ns: "dashboard" })}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">{t("pages.marketReportCity.stableTrend", { ns: "dashboard" })}</dt>
              <dd className="mt-1 ml-0 text-slate-700">{t("pages.marketReportCity.stableTrendA", { ns: "dashboard" })}</dd>
            </div>
          </dl>
          <h3 className="mt-5 text-base font-semibold text-slate-900">{t("pages.marketReportCity.internalLinks", { ns: "dashboard" })}</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {nearbyCities.map((near) => (
              <a key={near.slug} className="text-blue-700 hover:underline" href={`/market-report/${near.slug}`}>
                {near.city} {t("pages.marketReportCity.marketReport", { ns: "dashboard" })}</a>
            ))}
            {relatedPages.map((page) => (
              <a key={page.href} className="text-blue-700 hover:underline" href={page.href}>
                {page.label}
              </a>
            ))}
          </div>
          <p className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">{t("pages.marketReportCity.cta", { ns: "dashboard" })}</p>
        </article>
        <LocalSeoLeadForm title={t("pages.seoCityPages.mrFormTitle", { ns: "dashboard", city: city.city })} source="seo_market_report_city" city={city.city} />
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
