import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { getSiteUrl } from "@/lib/siteUrl";
import {
  getLatestMetrics,
  listActiveGeographies,
  type ActiveGeography,
} from "@/lib/research/warehouse/read";
import { geoSlug, stateSlug } from "@/lib/research/warehouse/slug";
import { formatPeriod, findMetric } from "@/lib/research/warehouse/format";
import StatGrid from "../_components/StatGrid";
import DataSources from "../_components/DataSources";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const TITLE =
  "Local Market Data for Real Estate Agents — By State & Metro | CloseBoss";
const DESCRIPTION =
  "The local housing numbers to quote in your CMA and listing appointment — home values, sale prices, inventory, and days on market for every state and the top U.S. metros, refreshed monthly from authoritative public sources. Talking points your buyers and sellers will trust.";

export async function generateMetadata(): Promise<Metadata> {
  const base = getSiteUrl();
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${base}/data/markets` },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: `${base}/data/markets`,
      type: "website",
    },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  };
}

export default async function MarketsIndexPage() {
  const t = await getServerT();
  const envOk = !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  let national = [] as Awaited<ReturnType<typeof getLatestMetrics>>;
  let states: ActiveGeography[] = [];
  let metros: ActiveGeography[] = [];

  if (envOk) {
    try {
      [national, states, metros] = await Promise.all([
        getLatestMetrics("national", "US"),
        listActiveGeographies("state"),
        listActiveGeographies("metro"),
      ]);
    } catch {
      national = [];
      states = [];
      metros = [];
    }
  }

  const topMetros = metros.slice(0, 50);
  const base = getSiteUrl();
  const zhvi = findMetric(national, "zhvi");
  const periodLabel = zhvi ? formatPeriod(zhvi.period) : "";

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Local Market Data for Real Estate Agents",
    description: DESCRIPTION,
    url: `${base}/data/markets`,
    publisher: { "@type": "Organization", name: "CloseBoss" },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: [
        ...states.map((s, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: `${s.geo_name} housing market data for agents`,
          url: `${base}/data/markets/${geoSlug(s)}`,
        })),
        ...topMetros.map((m, i) => ({
          "@type": "ListItem",
          position: states.length + i + 1,
          name: `${m.geo_name} housing market data for agents`,
          url: `${base}/data/markets/${stateSlug(m.state || "")}/${geoSlug(m)}`,
        })),
      ],
    },
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <JsonLd data={collectionJsonLd} />
      <div className="mx-auto max-w-5xl px-4 py-12 space-y-12">
        <nav className="text-sm">
          <Link href="/" className="font-medium text-[#0072ce] hover:text-[#005ca8]">
            CloseBoss
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <Link href="/data" className="font-medium text-[#0072ce] hover:text-[#005ca8]">{t("pages.articleChrome.dataCenter", { ns: "dashboard" })}</Link>
          <span className="text-slate-400 mx-2">/</span>
          <span className="text-slate-600">{t("pages.dataCenterPages.markets")}</span>
        </nav>

        <header className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#0072ce]">{t("pages.dataCenterPages.marketsTitle")}</p>
          <h1 className="text-4xl font-bold leading-tight text-slate-900">{t("pages.dataCenterPages.marketsH1")}</h1>
          <p className="max-w-2xl text-lg leading-relaxed text-slate-600">{t("pages.dataCenterPages.marketsBody")}</p>
        </header>

        <section aria-label={t("pages.dataCenterPages.nationalAria")} className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-bold text-slate-900">{t("pages.dataCenterPages.nationalTitle")}</h2>
            {periodLabel && (
              <span className="text-sm text-slate-500">As of {periodLabel}</span>
            )}
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">{t("pages.dataCenterPages.nationalBody")}</p>
          <StatGrid metrics={national} />
        </section>

        <section aria-label={t("pages.dataCenterPages.statesAria")} className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">{t("pages.dataCenterPages.statesTitle")}</h2>
          {states.length === 0 ? (
            <p className="text-sm text-slate-500">{t("pages.dataCenterPages.statesRefreshing")}</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {states.map((s) => (
                <li key={s.geo_code}>
                  <Link
                    href={`/data/markets/${geoSlug(s)}`}
                    className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#0072ce]/40 hover:text-[#0072ce]"
                  >
                    {s.geo_name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={t("pages.dataCenterPages.topMetrosAria")} className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">{t("pages.dataCenterPages.topMetrosTitle")}</h2>
          {topMetros.length === 0 ? (
            <p className="text-sm text-slate-500">{t("pages.dataCenterPages.metrosRefreshing")}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {topMetros.map((m) => (
                <li key={m.geo_code}>
                  <Link
                    href={`/data/markets/${stateSlug(m.state || "")}/${geoSlug(m)}`}
                    className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-[#0072ce]/40 hover:text-[#0072ce]"
                  >
                    {m.geo_name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <DataSources />
      </div>
    </main>
  );
}
