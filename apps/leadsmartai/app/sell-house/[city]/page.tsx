import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LocalSeoLeadForm from "@/components/LocalSeoLeadForm";
import TrafficTracker from "@/components/TrafficTracker";
import { getPageKeywords } from "@/lib/trafficSeo";
import { pageMetadata } from "@/lib/seo";
import {
  getMetroBySlug,
  getMetroSnapshot,
  getNearbyMetros,
  getRelatedMetroLinks,
  listTrafficMetros,
} from "@/lib/trafficMetros";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/locale";

// Render dynamically (root layout reads cookies() -> dynamic tree; `revalidate`
// here would throw DYNAMIC_SERVER_USAGE / 500 in prod). generateStaticParams only
// supplies known slugs for the largest metros; the long tail resolves on request.
export async function generateStaticParams() {
  const metros = await listTrafficMetros();
  return metros.slice(0, 60).map((m) => ({ city: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city) return {};
  const keywords = getPageKeywords("sell-house", city.slug);
  return pageMetadata({
    title: `Sell Your House Fast in ${city.city}, ${city.state} | CloseBoss`,
    description: `Localized strategy to sell your house in ${city.city}, ${city.state} with current demand, days on market, and timing insights for ${keywords[0]}.`,
    path: `/sell-house/${p.city}`,
  });
}

function fmtDate(period: string | null, locale: string): string | null {
  if (!period) return null;
  const d = new Date(period);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

export default async function SellHouseCityPage({
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
    (page) => !page.href.endsWith(`/sell-house/${city.slug}`),
  );
  const keywords = getPageKeywords("sell-house", city.slug);
  const asOf = fmtDate(market.period, locale);
  const domText =
    market.medianDaysOnMarket !== null ? `${Math.round(market.medianDaysOnMarket)} days` : "varies";

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath={`/sell-house/${city.slug}`} city={city.city} source="seo_sell_house_city" />
      <h1 className="text-3xl font-bold text-slate-900">
        {t("pages.seoCityPages.shTitle", { ns: "dashboard", city: city.city, state: city.state })}
      </h1>
      <p className="mt-2 text-slate-700">
        {t("pages.seoCityPages.shIntroFull", { ns: "dashboard", keyword: keywords[0], city: city.city })}
      </p>
      {asOf ? <p className="mt-1 text-xs text-slate-500">{t("pages.seoCityPages.dataAsOfDate", { ns: "dashboard", date: asOf })}</p> : null}

      <section className="mt-8 grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold text-slate-900">{t("pages.seoCityPages.localSellerInsights", { ns: "dashboard" })}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {market.medianDaysOnMarket !== null && (
              <li>{t("pages.seoCityPages.timeOnMarketLi", { ns: "dashboard", days: Math.round(market.medianDaysOnMarket) })}</li>
            )}
            {market.yoyChangePct !== null && (
              <li>
                {t("pages.seoCityPages.yearChangeLi", { ns: "dashboard", pct: `${market.yoyChangePct > 0 ? "+" : ""}${market.yoyChangePct}` })}
              </li>
            )}
            {market.typicalValue !== null && (
              <li>{t("pages.seoCityPages.typicalValueLi", { ns: "dashboard", value: `$${Math.round(market.typicalValue).toLocaleString(locale)}` })}</li>
            )}
            {market.inventory !== null && (
              <li>{t("pages.seoCityPages.inventoryLi", { ns: "dashboard", count: Math.round(market.inventory).toLocaleString(locale) })}</li>
            )}
          </ul>
          <p className="mt-3 text-sm text-slate-700">
            {t("pages.seoCityPages.launchPricing", { ns: "dashboard" })}
          </p>
          <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-800">{t("pages.seoCityPages.keywordCoverage", { ns: "dashboard" })}</h3>
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
              <dt className="font-semibold text-slate-900">{t("pages.seoCityPages.howFastQ", { ns: "dashboard", city: city.city })}</dt>
              <dd className="mt-1 ml-0 text-slate-700">
                {t("pages.seoCityPages.medianTimelinesFull", { ns: "dashboard", dom: domText })}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">{t("pages.seoCityPages.shouldIRenovate", { ns: "dashboard" })}</dt>
              <dd className="mt-1 ml-0 text-slate-700">
                {t("pages.seoCityPages.shouldIRenovateA", { ns: "dashboard" })}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">{t("pages.seoCityPages.maximizeProceeds", { ns: "dashboard" })}</dt>
              <dd className="mt-1 ml-0 text-slate-700">
                {t("pages.seoCityPages.maximizeProceedsA", { ns: "dashboard" })}
              </dd>
            </div>
          </dl>
          <h3 className="mt-5 text-base font-semibold text-slate-900">{t("pages.seoCityPages.internalLinks", { ns: "dashboard" })}</h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {nearbyCities.map((near) => (
              <a key={near.slug} className="text-blue-700 hover:underline" href={`/sell-house/${near.slug}`}>
                {t("pages.seoCityPages.sellNearby", { ns: "dashboard", city: near.city })}
              </a>
            ))}
            {relatedPages.map((page) => (
              <a key={page.href} className="text-blue-700 hover:underline" href={page.href}>
                {page.label}
              </a>
            ))}
          </div>
          <p className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
            {t("pages.seoCityPages.sellCta", { ns: "dashboard" })}
          </p>
        </article>
        <LocalSeoLeadForm title={`Get a ${city.city} Selling Plan`} source="seo_sell_house_city" city={city.city} />
      </section>
    </main>
  );
}
