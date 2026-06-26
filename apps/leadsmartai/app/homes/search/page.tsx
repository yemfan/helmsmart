import type { Metadata } from "next";
import { Suspense } from "react";

import IdxDisclaimer from "@/components/idx/IdxDisclaimer";
import IdxFiltersBar from "@/components/idx/IdxFiltersBar";
import IdxListingCard from "@/components/idx/IdxListingCard";
import { getIdxAdapter, isIdxFailure } from "@/lib/idx";
import type { IdxPropertyType, IdxSearchFilters } from "@/lib/idx/types";

export const metadata: Metadata = {
  title: "Homes for sale | RealtyBoss",
  description: "Search homes for sale by city, ZIP, price, beds, and baths.",
};

const VALID_PROPERTY_TYPES: IdxPropertyType[] = [
  "single_family",
  "condo",
  "townhouse",
  "multi_family",
  "land",
  "other",
];

function asNumber(v: string | string[] | undefined): number | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function asString(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return undefined;
  const trimmed = s.trim();
  return trimmed ? trimmed : undefined;
}

function asPropertyType(v: string | string[] | undefined): IdxPropertyType | undefined {
  const s = asString(v);
  if (!s) return undefined;
  return VALID_PROPERTY_TYPES.includes(s as IdxPropertyType) ? (s as IdxPropertyType) : undefined;
}

function buildPaginationLinks(
  filters: IdxSearchFilters,
  hasNext: boolean,
): { prevHref: string | null; nextHref: string | null } {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && k !== "page" && k !== "pageSize") {
      sp.set(k, String(v));
    }
  }
  const page = filters.page ?? 1;
  const prevHref =
    page > 1 ? `/homes/search?${new URLSearchParams({ ...Object.fromEntries(sp), page: String(page - 1) }).toString()}` : null;
  const nextHref = hasNext
    ? `/homes/search?${new URLSearchParams({ ...Object.fromEntries(sp), page: String(page + 1) }).toString()}`
    : null;
  return { prevHref, nextHref };
}

export default async function HomesSearchPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;

  const filters: IdxSearchFilters = {
    city: asString(sp.city),
    state: asString(sp.state),
    zip: asString(sp.zip),
    priceMin: asNumber(sp.priceMin),
    priceMax: asNumber(sp.priceMax),
    bedsMin: asNumber(sp.bedsMin),
    bathsMin: asNumber(sp.bathsMin),
    sqftMin: asNumber(sp.sqftMin),
    propertyType: asPropertyType(sp.propertyType),
    page: asNumber(sp.page) ?? 1,
    pageSize: 24,
  };

  const hasAnyFilter = Boolean(
    filters.city || filters.state || filters.zip || filters.priceMin || filters.priceMax ||
      filters.bedsMin || filters.bathsMin || filters.propertyType,
  );

  const adapter = getIdxAdapter();
  const result = hasAnyFilter ? await adapter.searchListings(filters) : null;

  const errorBanner =
    result && isIdxFailure(result)
      ? result.error.kind === "not_configured"
        ? "Listing search is not configured for this environment."
        : result.error.kind === "rate_limited"
          ? "We're being rate-limited by our data provider — please try again shortly."
          : "We couldn't load listings right now. Please try again."
      : null;

  const listings = result && !isIdxFailure(result) ? result.data.listings : [];
  const hasNext = listings.length === filters.pageSize;
  const { prevHref, nextHref } = buildPaginationLinks(filters, hasNext);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Homes for sale</h1>
        <p className="mt-1 text-sm text-slate-600">
          Search active listings by city, ZIP, price, and more. Save searches and homes you love.
        </p>
      </header>

      <Suspense
        fallback={
          <div
            className="h-[200px] rounded-2xl border border-slate-200 bg-white shadow-sm md:h-[120px]"
            aria-hidden
          />
        }
      >
        <IdxFiltersBar />
      </Suspense>

      <section className="mt-6">
        {errorBanner ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {errorBanner}
          </div>
        ) : null}

        {!hasAnyFilter ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Enter a city, state, or ZIP above to see homes for sale.
          </div>
        ) : listings.length === 0 && !errorBanner ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No active listings matched these filters. Try widening your price range or removing filters.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <IdxListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}

        {hasAnyFilter && listings.length > 0 ? (
          <nav className="mt-8 flex items-center justify-between">
            {prevHref ? (
              <a href={prevHref} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">
                ← Previous
              </a>
            ) : (
              <span />
            )}
            {nextHref ? (
              <a href={nextHref} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">
                Next →
              </a>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>

      <IdxDisclaimer />
    </main>
  );
}
