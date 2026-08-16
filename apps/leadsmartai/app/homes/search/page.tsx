import type { Metadata } from "next";

import type { HomeSearchParams } from "@/lib/house-search/brief";

import HomesSearchClient from "./HomesSearchClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "AI home search | CloseBoss",
  description:
    "Describe the home you want in plain English and get real, current listings — powered by AI and live web search.",
};

function asString(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  const trimmed = s?.trim();
  return trimmed ? trimmed : undefined;
}

function asNumber(v: string | string[] | undefined): number | undefined {
  const s = asString(v);
  if (!s) return undefined;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Public AI home-search surface. Thin server page: reads the deep-link params
 * and hands them to the client. An explicit `?q=` becomes the brief verbatim;
 * otherwise legacy structured params (?city=&state=&zip=&price…&beds…&type)
 * are translated into a brief client-side and auto-run — preserving the
 * popular-city, open-house, and filter-bar deep links from the old IDX SRP.
 */
export default async function HomesSearchPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getServerT();
  const sp = await props.searchParams;

  const initialQuery = asString(sp.q) ?? null;
  const initialParams: HomeSearchParams = {
    city: asString(sp.city) ?? null,
    state: asString(sp.state) ?? null,
    zip: asString(sp.zip) ?? null,
    priceMin: asNumber(sp.priceMin) ?? null,
    priceMax: asNumber(sp.priceMax) ?? null,
    bedsMin: asNumber(sp.bedsMin) ?? null,
    bathsMin: asNumber(sp.bathsMin) ?? null,
    sqftMin: asNumber(sp.sqftMin) ?? null,
    propertyType: asString(sp.propertyType) ?? null,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          Find your next home
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Describe what you&apos;re looking for in plain English. We search the
          live web for real, current listings and link you straight to the
          source.
        </p>
      </header>

      <HomesSearchClient initialQuery={initialQuery} initialParams={initialParams} />
    </main>
  );
}
