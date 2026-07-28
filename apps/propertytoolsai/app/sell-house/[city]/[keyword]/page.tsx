import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { getSiteUrl } from "@/lib/siteUrl";
import {
  getMetroBySlug,
  getMetroSnapshot,
  getNearbyMetros,
  isValidKeywordSlugForMetro,
  resolveMetroKeyword,
} from "@/lib/trafficMetros";

/** Empty at build: large keyword matrix — bulk SSG OOMs Vercel. On demand + ISR. */
export const revalidate = 86400;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; keyword: string }>;
}): Promise<Metadata> {
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city || !isValidKeywordSlugForMetro("sell-house", city, p.keyword)) return {};
  const keyword = resolveMetroKeyword("sell-house", city, p.keyword);
  return {
    title: `${keyword} | ${city.city}, ${city.state} Seller Guide | PropertyTools AI`,
    description: `Localized selling strategy for ${keyword} in ${city.city}, ${city.state}.`,
    // Consolidate to parent city hub; keyword variants are noindex-crawlable.
    alternates: { canonical: `/sell-house/${p.city}` },
    robots: { index: false, follow: true },
  };
}

export default async function SellHouseKeywordPage({
  params,
}: {
  params: Promise<{ city: string; keyword: string }>;
}) {
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city || !isValidKeywordSlugForMetro("sell-house", city, p.keyword)) return notFound();
  const keyword = resolveMetroKeyword("sell-house", city, p.keyword);
  const market = await getMetroSnapshot(city.geoLevel, city.geoCode);
  const nearby = await getNearbyMetros(city.slug, 4);

  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const pageUrl = `${siteUrl}/sell-house/${city.slug}/${p.keyword}`;
  const pageTitle = `${keyword} | ${city.city}, ${city.state} Seller Guide | PropertyTools AI`;
  const pageDescription = `Localized selling strategy for ${keyword} in ${city.city}, ${city.state}.`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <BreadcrumbJsonLd
        title={pageTitle}
        description={pageDescription}
        url={pageUrl}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Sell House", href: "/sell-house" },
          { label: `${city.city}, ${city.state}`, href: `/sell-house/${city.slug}` },
          { label: keyword, href: `/sell-house/${city.slug}/${p.keyword}` },
        ]}
      />
      <TrafficTracker pagePath={`/sell-house/${city.slug}/${p.keyword}`} city={city.city} source="seo_sell_house_keyword" />
      <div className="mb-4 flex items-center gap-2">
        <a href={`/sell-house/${city.slug}`} className="text-blue-700 hover:underline">
          ← Back to {city.city}
        </a>
      </div>
      <h1 className="text-3xl font-bold text-slate-900">{keyword}</h1>
      <p className="mt-2 text-slate-700">
        Seller-focused local page for {city.city}. Get timing, pricing, and demand insights built for this market.
      </p>

      <section className="mt-8 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Market snapshot</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {market.medianDaysOnMarket !== null && (
              <li>Median time on market: {Math.round(market.medianDaysOnMarket)} days</li>
            )}
            {market.yoyChangePct !== null && (
              <li>
                1-year value trend: {market.yoyChangePct > 0 ? "+" : ""}
                {market.yoyChangePct}%
              </li>
            )}
            {market.typicalValue !== null && (
              <li>Typical home value: ${Math.round(market.typicalValue).toLocaleString()}</li>
            )}
            <li>Current direction: {market.trend}</li>
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
