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

// Render on demand — NOT static/ISR, matching the [keyword] child route.
//
// The root layout reads cookies() (locale), so this tree is dynamic no matter
// what: production serves every one of these URLs with `Cache-Control: private,
// no-cache` and `X-Vercel-Cache: MISS`. The old generateStaticParams therefore
// prerendered 60 metros at build time whose output was then never served — it
// bought nothing and cost a warehouse round-trip per page against a database
// shared with propertytoolsai. When that database slowed on 2026-08-15, those
// prerenders blew Next's 60s-per-page export budget and blocked every deploy of
// both apps. Being explicit about what was already true removes the whole class
// of failure; the sitemap still enumerates these URLs for discovery.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city) return {};
  const keywords = getPageKeywords("home-value", city.slug);
  return pageMetadata({
    title: `Free Home Value Estimate in ${city.city}, ${city.state} | CloseBoss`,
    description: `Get a localized home value estimate for ${city.city}, ${city.state} with current market trends, days on market, and ${keywords[0]} guidance.`,
    path: `/home-value/${p.city}`,
  });
}

function fmtDate(period: string | null): string | null {
  if (!period) return null;
  const d = new Date(period);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function HomeValueCityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const p = await params;
  const city = await getMetroBySlug(p.city);
  if (!city) return notFound();

  const market = await getMetroSnapshot(city.geoLevel, city.geoCode);
  const nearbyCities = await getNearbyMetros(city.slug, 4);
  const relatedPages = getRelatedMetroLinks(city.slug).filter(
    (page) => !page.href.endsWith(`/home-value/${city.slug}`),
  );
  const keywords = getPageKeywords("home-value", city.slug);
  const asOf = fmtDate(market.period);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TrafficTracker pagePath={`/home-value/${city.slug}`} city={city.city} source="seo_home_value_city" />
      <h1 className="text-3xl font-bold text-slate-900">
        Free Home Value Estimate in {city.city}, {city.state}
      </h1>
      <p className="mt-2 text-slate-700">
        Use this page to get a {keywords[0]} for {city.city}, compare hyper-local pricing, and decide the
        best time to sell.
      </p>
      {asOf ? <p className="mt-1 text-xs text-slate-500">Market data as of {asOf}.</p> : null}

      {(market.typicalValue !== null ||
        market.yoyChangePct !== null ||
        market.medianDaysOnMarket !== null ||
        market.inventory !== null) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {market.typicalValue !== null && (
            <Metric label="Typical Home Value" value={formatCurrency(market.typicalValue)} />
          )}
          {market.yoyChangePct !== null && (
            <Metric
              label="1-Year Change"
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
          <h2 className="text-xl font-semibold text-slate-900">Seller insight for {city.city}</h2>
          <p className="mt-2 text-sm text-slate-700">
            The best-performing listings in {city.city} are priced against fresh local comps and marketed
            with a clear timeline.
            {market.medianDaysOnMarket !== null
              ? ` Homes here are currently selling in a median of about ${Math.round(
                  market.medianDaysOnMarket,
                )} days.`
              : ""}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            The {city.city} market trend is currently <span className="font-semibold">{market.trend}</span>
            {market.yoyChangePct !== null
              ? `, with typical values ${market.yoyChangePct >= 0 ? "up" : "down"} ${Math.abs(
                  market.yoyChangePct,
                )}% over the past year`
              : ""}
            .
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
                {market.trend === "up"
                  ? "Values are rising, which tends to favor sellers who price to the current market."
                  : market.trend === "down"
                    ? "Values have softened, so pricing precision and presentation matter more than ever."
                    : "The market is steady, so strategy, timing, and presentation drive your result."}
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
