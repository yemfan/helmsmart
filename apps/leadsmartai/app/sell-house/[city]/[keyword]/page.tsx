import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import {
  getMetroBySlug,
  getMetroSnapshot,
  getNearbyMetros,
  isValidKeywordSlugForMetro,
  resolveMetroKeyword,
} from "@/lib/trafficMetros";
import { getServerT } from "@/lib/i18n/server";

/**
 * Render on demand at request time — NOT static/ISR. The root layout calls
 * cookies()/headers() (locale detection), which makes the whole tree dynamic.
 * Opting these pages into static generation (revalidate + generateStaticParams)
 * collided with that and threw DYNAMIC_SERVER_USAGE → 500 on every keyword URL
 * in production. force-dynamic mirrors the working behavior.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; keyword: string }>;
}): Promise<Metadata> {
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city || !isValidKeywordSlugForMetro("sell-house", city, p.keyword)) return {};
  const keyword = resolveMetroKeyword("sell-house", city, p.keyword);
  return pageMetadata({
    title: `${keyword} | ${city.city}, ${city.state} Seller Guide | CloseBoss`,
    description: `Localized selling strategy for ${keyword} in ${city.city}, ${city.state}.`,
    path: `/sell-house/${p.city}/${p.keyword}`,
  });
}

export default async function SellHouseKeywordPage({
  params,
}: {
  params: Promise<{ city: string; keyword: string }>;
}) {
  const t = await getServerT();
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city || !isValidKeywordSlugForMetro("sell-house", city, p.keyword)) return notFound();
  const keyword = resolveMetroKeyword("sell-house", city, p.keyword);
  const market = await getMetroSnapshot(city.geoLevel, city.geoCode);
  const nearby = await getNearbyMetros(city.slug, 4);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath={`/sell-house/${city.slug}/${p.keyword}`} city={city.city} source="seo_sell_house_keyword" />
      <h1 className="text-3xl font-bold text-slate-900">{keyword}</h1>
      <p className="mt-2 text-slate-700">{t("pages.keywordPages.sellerFocusedFor", { ns: "dashboard" })} {city.city}. Get timing, pricing, and demand insights built for this market.
      </p>

      <section className="mt-8 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">{t("pages.keywordPages.marketSnapshot", { ns: "dashboard" })}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {market.medianDaysOnMarket !== null && (
              <li>{t("pages.keywordPages.medianDaysOnMarket", { count: Math.round(market.medianDaysOnMarket), ns: "dashboard" })}</li>
            )}
            {market.yoyChangePct !== null && (
              <li>
                {t("pages.keywordPages.oneYearValueTrend", { ns: "dashboard" })} {market.yoyChangePct > 0 ? "+" : ""}
                {market.yoyChangePct}%
              </li>
            )}
            {market.typicalValue !== null && (
              <li>Typical home value: ${Math.round(market.typicalValue).toLocaleString()}</li>
            )}
            <li>{t("pages.keywordPages.currentDirection", { ns: "dashboard" })} {market.trend}</li>
          </ul>
          <h3 className="mt-4 text-base font-semibold text-slate-900">{t("pages.keywordPages.nearbyLinks", { ns: "dashboard" })}</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {nearby.map((n) => (
              <a key={n.slug} href={`/sell-house/${n.slug}/${p.keyword}`} className="text-blue-700 hover:underline">
                {keyword} in {n.city}
              </a>
            ))}
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900">{t("pages.keywordPages.relatedPages", { ns: "dashboard" })}</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <a href={`/home-value/${city.slug}/${p.keyword}`} className="text-blue-700 hover:underline">{t("pages.keywordPages.homeValueKeyword", { ns: "dashboard" })}</a>
            <a href={`/market-report/${city.slug}/${p.keyword}`} className="text-blue-700 hover:underline">{t("pages.keywordPages.marketReportKeyword", { ns: "dashboard" })}</a>
          </div>
        </article>
        <LocalSeoLeadForm title={`Get a ${city.city} Selling Plan`} source="seo_sell_house_keyword" city={city.city} />
      </section>
    </main>
  );
}
