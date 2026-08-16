import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { getSiteUrl } from "@/lib/siteUrl";
import { formatCurrency, getPageKeywords, getRelatedPageLinks } from "@/lib/trafficSeo";
import {
  getMetroBySlug,
  getMetroSnapshot,
  getNearbyMetros,
  listTrafficMetros,
} from "@/lib/trafficMetros";

// ISR: warehouse figures refresh daily; long tail renders on demand + cached.
export const revalidate = 86400;

// Prebuild only the largest metros — every prebuilt page is a warehouse
// round-trip inside Next's 60s-per-page export budget against a database shared
// with leadsmartai, and blowing that budget blocked all deploys on 2026-08-15.
// The long tail already rendered on demand + cached by ISR. See home-value.
const PRERENDERED_METROS = 12;

export async function generateStaticParams() {
  const metros = await listTrafficMetros();
  return metros.slice(0, PRERENDERED_METROS).map((m) => ({ city: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city) return {};
  const keywords = getPageKeywords("market-report", city.slug);
  return {
    title: `${city.city}, ${city.state} Market Report | PropertyTools AI`,
    description: `Current housing trends, days on market, and price movement in ${city.city}, ${city.state}, including ${keywords[0]} analysis.`,
    alternates: { canonical: `/market-report/${p.city}` },
  };
}

function fmtDate(period: string | null): string | null {
  if (!period) return null;
  const d = new Date(period);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function MarketReportCityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city) return notFound();
  const market = await getMetroSnapshot(city.geoLevel, city.geoCode);
  const nearbyCities = await getNearbyMetros(city.slug, 4);
  const relatedPages = getRelatedPageLinks(city.slug).filter(
    (page) => !page.href.endsWith(`/market-report/${city.slug}`),
  );
  const keywords = getPageKeywords("market-report", city.slug);
  const asOf = fmtDate(market.period);

  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const pageUrl = `${siteUrl}/market-report/${city.slug}`;
  const pageTitle = `${city.city}, ${city.state} Market Report | PropertyTools AI`;
  const pageDescription = `Current housing trends, days on market, and price movement in ${city.city}, ${city.state}, including ${keywords[0]} analysis.`;

  return (
    <div className="w-full max-w-6xl py-6 sm:py-10">
      <BreadcrumbJsonLd
        title={pageTitle}
        description={pageDescription}
        url={pageUrl}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Market Reports", href: "/market-report" },
          { label: `${city.city}, ${city.state}`, href: `/market-report/${city.slug}` },
        ]}
      />
      <TrafficTracker pagePath={`/market-report/${city.slug}`} city={city.city} source="seo_market_report_city" />
      <h1 className="mb-2 text-3xl font-bold text-blue-600">
        {city.city}, {city.state} Housing Market Report
      </h1>
      <p className="mb-2 text-gray-600">
        Review {keywords[0]} data for {city.city} and convert market intelligence into a smarter seller
        launch strategy.
      </p>
      {asOf ? <p className="mb-6 text-xs text-slate-500">Market data as of {asOf}.</p> : null}

      {(market.typicalValue !== null ||
        market.yoyChangePct !== null ||
        market.medianDaysOnMarket !== null ||
        market.inventory !== null) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {market.typicalValue !== null && (
            <Metric label="Typical Value" value={formatCurrency(market.typicalValue)} />
          )}
          {market.yoyChangePct !== null && (
            <Metric
              label="Annual Trend"
              value={`${market.yoyChangePct > 0 ? "+" : ""}${market.yoyChangePct}%`}
            />
          )}
          {market.medianDaysOnMarket !== null && (
            <Metric label="Median Days on Market" value={`${Math.round(market.medianDaysOnMarket)} days`} />
          )}
          {market.inventory !== null && (
            <Metric label="Homes for Sale" value={Math.round(market.inventory).toLocaleString()} />
          )}
        </div>
      )}

      <section className="mt-8 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Monthly summary for {city.city}</h2>
          <p className="mt-2 text-sm text-slate-700">
            Inventory and buyer demand remain key drivers in {city.city}. Homeowners evaluating a move can use
            localized pricing data to time the market and improve net proceeds.
          </p>
          <p className="mt-2 text-sm text-slate-700">
            The market trend is currently <span className="font-semibold">{market.trend}</span>
            {market.yoyChangePct !== null
              ? `, with typical home values ${market.yoyChangePct >= 0 ? "up" : "down"} ${Math.abs(
                  market.yoyChangePct,
                )}% year over year`
              : ""}
            . When trend is {market.trend}, pricing precision and launch timing become even more important.
          </p>
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-800">Keyword coverage</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {keywords.map((keyword) => (
              <span key={keyword} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                {keyword}
              </span>
            ))}
          </div>
          <h3 className="mt-5 text-base font-semibold text-slate-900">FAQ</h3>
          <dl className="mt-2 space-y-4 text-sm text-slate-700">
            <div>
              <dt className="font-semibold text-slate-900">How often should I check the {city.city} market report?</dt>
              <dd className="mt-1 ml-0 text-slate-700">Weekly during active listing planning.</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">What metric matters most for sellers?</dt>
              <dd className="mt-1 ml-0 text-slate-700">Recent comp velocity plus days on market in your segment.</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">What does a stable trend mean?</dt>
              <dd className="mt-1 ml-0 text-slate-700">
                Price growth is flatter, so strategy and presentation drive results.
              </dd>
            </div>
          </dl>
          <h3 className="mt-5 text-base font-semibold text-slate-900">Internal links</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {nearbyCities.map((near) => (
              <a key={near.slug} className="text-blue-700 hover:underline" href={`/market-report/${near.slug}`}>
                {near.city} market report
              </a>
            ))}
            {relatedPages.map((page) => (
              <a key={page.href} className="text-blue-700 hover:underline" href={page.href}>
                {page.label}
              </a>
            ))}
          </div>
          <p className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
            CTA: Request your free local report with comps, trend signals, and seller recommendations.
          </p>
        </article>
        <LocalSeoLeadForm title={`Get ${city.city} Market Report`} source="seo_market_report_city" city={city.city} />
      </section>
    </div>
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
