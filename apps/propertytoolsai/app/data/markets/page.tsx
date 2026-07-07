import type { Metadata } from "next";
import Link from "next/link";
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

export const dynamic = "force-dynamic";

const TITLE = "U.S. Housing Market Data by State & Metro | PropertyTools AI";
const DESCRIPTION =
  "Explore real housing-market data — home values, sale prices, inventory, and days on market — for all 50 states and the top U.S. metro areas, refreshed monthly from authoritative public sources.";

export async function generateMetadata(): Promise<Metadata> {
  const base = getSiteUrl();
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${base}/data/markets` },
    openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
  };
}

export default async function MarketsIndexPage() {
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
    name: "U.S. Housing Market Data",
    description: DESCRIPTION,
    url: `${base}/data/markets`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: [
        ...states.map((s, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: `${s.geo_name} housing market`,
          url: `${base}/data/markets/${geoSlug(s)}`,
        })),
        ...topMetros.map((m, i) => ({
          "@type": "ListItem",
          position: states.length + i + 1,
          name: `${m.geo_name} housing market`,
          url: `${base}/data/markets/${stateSlug(m.state || "")}/${geoSlug(m)}`,
        })),
      ],
    },
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />
      <div className="mx-auto max-w-5xl px-4 py-12 space-y-12">
        <nav className="text-sm">
          <Link href="/" className="font-medium text-blue-700 hover:underline">
            PropertyTools AI
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <Link href="/data" className="font-medium text-blue-700 hover:underline">
            Data Center
          </Link>
          <span className="text-slate-400 mx-2">/</span>
          <span className="text-slate-600">Markets</span>
        </nav>

        <header className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Local market data
          </p>
          <h1 className="text-4xl font-bold leading-tight text-slate-900">
            U.S. housing market data by state &amp; metro
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-slate-600">
            Real home values, sale prices, inventory, and days on market for every
            state and the largest metro areas — refreshed monthly from authoritative
            public data. Pick your market to see the trend and how it compares to the
            nation.
          </p>
        </header>

        <section aria-label="National snapshot" className="space-y-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-2xl font-bold text-slate-900">National snapshot</h2>
            {periodLabel && (
              <span className="text-sm text-slate-500">As of {periodLabel}</span>
            )}
          </div>
          <StatGrid metrics={national} />
        </section>

        <section aria-label="States" className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Browse by state</h2>
          {states.length === 0 ? (
            <p className="text-sm text-slate-500">State data is being refreshed.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {states.map((s) => (
                <li key={s.geo_code}>
                  <Link
                    href={`/data/markets/${geoSlug(s)}`}
                    className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                  >
                    {s.geo_name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Top metros" className="space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Top metro areas</h2>
          {topMetros.length === 0 ? (
            <p className="text-sm text-slate-500">Metro data is being refreshed.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {topMetros.map((m) => (
                <li key={m.geo_code}>
                  <Link
                    href={`/data/markets/${stateSlug(m.state || "")}/${geoSlug(m)}`}
                    className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
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
    </div>
  );
}
