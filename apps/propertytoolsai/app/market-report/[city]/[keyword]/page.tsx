import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { getSiteUrl } from "@/lib/siteUrl";
import { formatCurrency } from "@/lib/trafficSeo";
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
  if (!city || !isValidKeywordSlugForMetro("market-report", city, p.keyword)) return {};
  const keyword = resolveMetroKeyword("market-report", city, p.keyword);
  return {
    title: `${keyword} | ${city.city}, ${city.state} | PropertyTools AI`,
    description: `Track ${keyword} with local pricing and trend data for ${city.city}, ${city.state}.`,
    // Consolidate to parent city hub; keyword variants are noindex-crawlable.
    alternates: { canonical: `/market-report/${p.city}` },
    robots: { index: false, follow: true },
  };
}

export default async function MarketReportKeywordPage({
  params,
}: {
  params: Promise<{ city: string; keyword: string }>;
}) {
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city || !isValidKeywordSlugForMetro("market-report", city, p.keyword)) return notFound();
  const keyword = resolveMetroKeyword("market-report", city, p.keyword);
  const market = await getMetroSnapshot(city.geoLevel, city.geoCode);
  const nearby = await getNearbyMetros(city.slug, 4);

  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const pageUrl = `${siteUrl}/market-report/${city.slug}/${p.keyword}`;
  const pageTitle = `${keyword} | ${city.city}, ${city.state} | PropertyTools AI`;
  const pageDescription = `Track ${keyword} with local pricing and trend data for ${city.city}, ${city.state}.`;

  return (
    <div className="w-full max-w-6xl py-6 sm:py-10">
      <BreadcrumbJsonLd
        title={pageTitle}
        description={pageDescription}
        url={pageUrl}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Market Report", href: "/market-report" },
          { label: `${city.city}, ${city.state}`, href: `/market-report/${city.slug}` },
          { label: keyword, href: `/market-report/${city.slug}/${p.keyword}` },
        ]}
      />
      <TrafficTracker pagePath={`/market-report/${city.slug}/${p.keyword}`} city={city.city} source="seo_market_report_keyword" />
      <div className="mb-4 flex items-center gap-2">
        <a href={`/market-report/${city.slug}`} className="text-blue-700 hover:underline">
          ← Back to {city.city}
        </a>
      </div>
      <h1 className="mb-2 text-3xl font-bold text-blue-600">{keyword}</h1>
      <p className="mb-6 text-gray-600">
        Local market report content for {city.city}, {city.state}, built for long-tail SEO intent.
      </p>

      {(market.typicalValue !== null ||
        market.yoyChangePct !== null ||
        market.medianDaysOnMarket !== null) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
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
            <Metric label="Days on Market" value={`${Math.round(market.medianDaysOnMarket)}`} />
          )}
        </div>
      )}

      <section className="mt-8 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">Seller insight</h2>
          <p className="mt-2 text-sm text-slate-700">
            The {city.city} market is currently <span className="font-semibold">{market.trend}</span>
            {market.medianDaysOnMarket !== null
              ? `, with market speed around ${Math.round(market.medianDaysOnMarket)} days`
              : ""}
            .
          </p>
          <h3 className="mt-4 text-base font-semibold text-slate-900">Nearby city links</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {nearby.map((n) => (
              <a key={n.slug} href={`/market-report/${n.slug}/${p.keyword}`} className="text-blue-700 hover:underline">
                {keyword} in {n.city}
              </a>
            ))}
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900">Related pages</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <a href={`/home-value/${city.slug}/${p.keyword}`} className="text-blue-700 hover:underline">Home value keyword page</a>
            <a href={`/sell-house/${city.slug}/${p.keyword}`} className="text-blue-700 hover:underline">Sell house keyword page</a>
          </div>
        </article>
        <LocalSeoLeadForm title={`Get ${city.city} Market Report`} source="seo_market_report_keyword" city={city.city} />
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
