import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import {
  estimateKeywordRouteCount,
  getCityBySlug,
  getKeywordPagesForCity,
  getMarketSnapshot,
  getNearbyCities,
  isValidKeywordSlugForCity,
} from "@/lib/trafficSeo";

/**
 * Render on demand at request time — NOT static/ISR. The root layout calls
 * cookies()/headers() (locale detection), which makes the whole tree dynamic.
 * Opting these pages into static generation (revalidate + generateStaticParams)
 * collided with that and threw DYNAMIC_SERVER_USAGE → 500 on every keyword URL
 * in production (the base /[city] pages have no revalidate, so they render
 * dynamically and are fine). force-dynamic mirrors that working behavior.
 */
export const dynamic = "force-dynamic";

function resolveKeyword(citySlug: string, keywordSlug: string) {
  return getKeywordPagesForCity("sell-house", citySlug).find((k) => k.keywordSlug === keywordSlug)?.keyword ?? "";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; keyword: string }>;
}): Promise<Metadata> {
  const p = await params;
  const city = getCityBySlug(p.city);
  if (!city || !isValidKeywordSlugForCity("sell-house", p.city, p.keyword)) return {};
  const keyword = resolveKeyword(p.city, p.keyword);
  return {
    title: `${keyword} | ${city.city}, ${city.state} Seller Guide | CloseBoss`,
    description: `Localized selling strategy for ${keyword} in ${city.city}, ${city.state}.`,
    alternates: { canonical: `/sell-house/${p.city}/${p.keyword}` },
  };
}

export default async function SellHouseKeywordPage({
  params,
}: {
  params: Promise<{ city: string; keyword: string }>;
}) {
  const p = await params;
  const city = getCityBySlug(p.city);
  if (!city || !isValidKeywordSlugForCity("sell-house", p.city, p.keyword)) return notFound();
  const keyword = resolveKeyword(p.city, p.keyword);
  const market = getMarketSnapshot(p.city);
  const nearby = getNearbyCities(p.city, 4);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath={`/sell-house/${city.slug}/${p.keyword}`} city={city.city} source="seo_sell_house_keyword" />
      <h1 className="text-3xl font-bold text-slate-900">{keyword}</h1>
      <p className="mt-2 text-slate-700">
        Seller-focused local page for {city.city}. Get timing, pricing, and demand insights built for this market.
      </p>
      <p className="mt-1 text-xs text-slate-500">Programmatic keyword routes: {estimateKeywordRouteCount().toLocaleString()}+</p>

      <section className="mt-8 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Market snapshot</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            <li>Demand score: {market.sellerDemandScore}/100</li>
            <li>Median time on market: {market.medianDaysOnMarket} days</li>
            <li>Trend: {market.yoyChangePct}% YoY</li>
          </ul>
          <h3 className="mt-4 text-base font-semibold text-slate-900">Nearby city links</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {nearby.map((n) => (
              <a key={n.slug} href={`/sell-house/${n.slug}/${p.keyword}`} className="text-blue-700 hover:underline">
                {keyword} in {n.city}
              </a>
            ))}
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900">Related pages</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <a href={`/home-value/${city.slug}/${p.keyword}`} className="text-blue-700 hover:underline">Home value keyword page</a>
            <a href={`/market-report/${city.slug}/${p.keyword}`} className="text-blue-700 hover:underline">Market report keyword page</a>
          </div>
        </article>
        <LocalSeoLeadForm title={`Get a ${city.city} Selling Plan`} source="seo_sell_house_keyword" city={city.city} />
      </section>
    </main>
  );
}
