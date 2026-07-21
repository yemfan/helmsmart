import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import {
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
  const keywords = getPageKeywords("sell-house", city.slug);
  return {
    title: `Sell Your House Fast in ${city.city}, ${city.state} | CloseBoss`,
    description: `Localized strategy to sell your house in ${city.city}, ${city.state} with demand and timing insights for ${keywords[0]}.`,
    alternates: { canonical: `/sell-house/${p.city}` },
  };
}

export default async function SellHouseCityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const p = await params;
  const city = getCityBySlug(p.city);
  if (!city) return notFound();
  const market = getMarketSnapshot(p.city);
  const nearbyCities = getNearbyCities(city.slug, 4);
  const relatedPages = getRelatedPageLinks(city.slug).filter((page) => !page.href.endsWith(`/sell-house/${city.slug}`));
  const keywords = getPageKeywords("sell-house", city.slug);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath={`/sell-house/${city.slug}`} city={city.city} source="seo_sell_house_city" />
      <h1 className="text-3xl font-bold text-slate-900">
        Sell Your House in {city.city}, {city.state}
      </h1>
      <p className="mt-2 text-slate-700">
        Localized intro: Build your plan to {keywords[0]} in {city.city} with market timing, pricing, and prep guidance.
      </p>

      <section className="mt-8 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Local seller insights</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>Demand score: {market.sellerDemandScore}/100</li>
            <li>Typical time on market: {market.medianDaysOnMarket} days</li>
            <li>Current trend: {market.yoyChangePct}% YoY change</li>
            <li>Median local price: ${Math.round(market.avgHomeValue).toLocaleString()}</li>
          </ul>
          <p className="mt-3 text-sm text-slate-700">
            Seller insight: homes that launch with pricing tied to current inventory windows typically generate stronger early offer activity.
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
              <dt className="font-semibold text-slate-900">How fast can I sell in {city.city}?</dt>
              <dd className="mt-1 ml-0 text-slate-700">
                Median timelines are currently about {market.medianDaysOnMarket} days, depending on condition and price.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Should I renovate before listing?</dt>
              <dd className="mt-1 ml-0 text-slate-700">
                Prioritize updates with strong buyer signal in your neighborhood price band.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">How do I maximize net proceeds?</dt>
              <dd className="mt-1 ml-0 text-slate-700">
                Use a pricing strategy tied to demand trend and buyer activity by week.
              </dd>
            </div>
          </dl>
          <h3 className="mt-5 text-base font-semibold text-slate-900">Internal links</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {nearbyCities.map((near) => (
              <a key={near.slug} className="text-blue-700 hover:underline" href={`/sell-house/${near.slug}`}>
                Sell in {near.city}
              </a>
            ))}
            {relatedPages.map((page) => (
              <a key={page.href} className="text-blue-700 hover:underline" href={page.href}>
                {page.label}
              </a>
            ))}
          </div>
          <p className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
            CTA: Get your free selling strategy and estimated listing range.
          </p>
        </article>
        <LocalSeoLeadForm title={`Get a ${city.city} Selling Plan`} source="seo_sell_house_city" city={city.city} />
      </section>
    </main>
  );
}

