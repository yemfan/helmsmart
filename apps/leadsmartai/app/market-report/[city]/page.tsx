import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import {
  formatCurrency,
  getCityBySlug,
  getMarketSnapshot,
  getNearbyCities,
  getPageKeywords,
  getRelatedPageLinks,
  TRAFFIC_CITIES,
} from "@/lib/trafficSeo";

export function generateStaticParams() {
  return TRAFFIC_CITIES.map((c) => ({ city: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const p = await params;
  const city = getCityBySlug(p.city);
  if (!city) return {};
  const keywords = getPageKeywords("market-report", city.slug);
  return {
    title: `${city.city}, ${city.state} Market Report | RealtyBoss`,
    description: `Current housing trends, demand, and pricing movement in ${city.city}, ${city.state}, including ${keywords[0]} analysis.`,
    alternates: { canonical: `/market-report/${p.city}` },
  };
}

export default async function MarketReportCityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const p = await params;
  const city = getCityBySlug(p.city);
  if (!city) return notFound();
  const market = getMarketSnapshot(p.city);
  const nearbyCities = getNearbyCities(city.slug, 4);
  const relatedPages = getRelatedPageLinks(city.slug).filter((page) => !page.href.endsWith(`/market-report/${city.slug}`));
  const keywords = getPageKeywords("market-report", city.slug);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath={`/market-report/${city.slug}`} city={city.city} source="seo_market_report_city" />
      <h1 className="text-3xl font-bold text-slate-900">
        {city.city}, {city.state} Housing Market Report
      </h1>
      <p className="mt-2 text-slate-700">
        Localized intro: Review {keywords[0]} data for {city.city} and convert market intelligence into a smarter seller launch strategy.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Metric label="Median Value" value={formatCurrency(market.avgHomeValue)} />
        <Metric label="Annual Trend" value={`${market.yoyChangePct}%`} />
        <Metric label="Price / Sqft" value={formatCurrency(market.pricePerSqft)} />
      </div>

      <section className="mt-8 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Monthly summary for {city.city}</h2>
          <p className="mt-2 text-sm text-slate-700">
            Inventory and buyer demand remain key drivers in {city.city}. Homeowners evaluating a move can use
            localized pricing data to time the market and improve net proceeds.
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Seller insight: when trend is <span className="font-semibold">{market.trend}</span>, pricing precision and launch timing become even more important.
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

