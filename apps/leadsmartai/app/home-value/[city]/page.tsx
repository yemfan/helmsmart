import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import {
  estimateProgrammaticPageCount,
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
  const keywords = getPageKeywords("home-value", city.slug);
  return {
    title: `Free Home Value Estimate in ${city.city}, ${city.state} | RealtyBoss`,
    description: `Get a localized home value estimate for ${city.city}, ${city.state} with market trends, seller demand insights, and ${keywords[0]} guidance.`,
    alternates: { canonical: `/home-value/${p.city}` },
  };
}

export default async function HomeValueCityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const p = await params;
  const city = getCityBySlug(p.city);
  if (!city) return notFound();

  const market = getMarketSnapshot(p.city);
  const nearbyCities = getNearbyCities(city.slug, 4);
  const relatedPages = getRelatedPageLinks(city.slug).filter((page) => !page.href.endsWith(`/home-value/${city.slug}`));
  const keywords = getPageKeywords("home-value", city.slug);
  const estimatedPages = estimateProgrammaticPageCount();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath={`/home-value/${city.slug}`} city={city.city} source="seo_home_value_city" />
      <h1 className="text-3xl font-bold text-slate-900">
        Free Home Value Estimate in {city.city}, {city.state}
      </h1>
      <p className="mt-2 text-slate-700">
        Localized intro: Use this page to get a {keywords[0]} for {city.city}, compare hyper-local pricing, and decide the best time to sell.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Programmatic SEO coverage: {estimatedPages.toLocaleString()}+ intent-targeted page variants across city and keyword combinations.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Metric label="Avg Home Value" value={formatCurrency(market.avgHomeValue)} />
        <Metric label="YoY Change" value={`${market.yoyChangePct}%`} />
        <Metric label="Price Per Sqft" value={formatCurrency(market.pricePerSqft)} />
      </div>

      <section className="mt-8 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Seller insight for {city.city}</h2>
          <p className="mt-2 text-sm text-slate-700">
            Sellers in {city.city} are seeing{" "}
            <span className="font-semibold">{market.sellerDemandScore}/100 demand</span>. The best-performing
            listings are priced against fresh local comps and marketed with a clear timeline.
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Market trend is currently <span className="font-semibold">{market.trend}</span>, with a median listing pace of{" "}
            <span className="font-semibold">{market.medianDaysOnMarket} days</span>.
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
              <dt className="font-semibold text-slate-900">How accurate is a {keywords[0]} in {city.city}?</dt>
              <dd className="mt-1 ml-0 text-slate-700">
                It is strongest when combined with recent neighborhood comps.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Is now a good time to sell in {city.city}?</dt>
              <dd className="mt-1 ml-0 text-slate-700">
                Demand is {market.sellerDemandScore >= 70 ? "strong" : "moderate"} based on current velocity and pricing pressure.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">What impacts value the most?</dt>
              <dd className="mt-1 ml-0 text-slate-700">
                Condition, lot position, school zone, and pricing strategy versus local alternatives.
              </dd>
            </div>
          </dl>
          <h3 className="mt-5 text-base font-semibold text-slate-900">Internal links</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {nearbyCities.map((near) => (
              <a key={near.slug} className="text-blue-700 hover:underline" href={`/home-value/${near.slug}`}>
                {near.city} home values
              </a>
            ))}
            {relatedPages.map((page) => (
              <a key={page.href} className="text-blue-700 hover:underline" href={page.href}>
                {page.label}
              </a>
            ))}
          </div>
          <p className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Ready for a full valuation? Get your free report and custom pricing plan now.
          </p>
        </article>
        <LocalSeoLeadForm
          title={`Get Your ${city.city} Home Value Report`}
          source="seo_home_value_city"
          city={city.city}
        />
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

