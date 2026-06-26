import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import IdxDisclaimer from "@/components/idx/IdxDisclaimer";
import IdxFiltersBar from "@/components/idx/IdxFiltersBar";

/**
 * The filter bar is a client component that calls `useSearchParams()` — Next
 * 15+ requires any consumer of that hook to either force dynamic rendering
 * or sit inside a <Suspense> boundary. The /homes page is otherwise fully
 * static (popular-cities tiles, value-prop blurbs), so we keep the static
 * shell and isolate the dynamic part behind Suspense — best of both.
 */
function FiltersBarFallback() {
  return (
    <div
      className="h-[200px] rounded-2xl border border-slate-200 bg-white shadow-sm md:h-[120px]"
      aria-hidden
    />
  );
}

export const metadata: Metadata = {
  title: "Homes for sale | RealtyBoss",
  description:
    "Search homes for sale across the U.S. by city, ZIP, price, beds, and baths. Save searches, favorite homes, and get instant new-listing alerts.",
};

const POPULAR_CITIES: { city: string; state: string; blurb: string }[] = [
  { city: "Austin", state: "TX", blurb: "Hill country living, tech hub" },
  { city: "Denver", state: "CO", blurb: "Outdoorsy, walkable neighborhoods" },
  { city: "Charlotte", state: "NC", blurb: "Banking + booming suburbs" },
  { city: "Phoenix", state: "AZ", blurb: "Sunbelt growth and value" },
  { city: "Tampa", state: "FL", blurb: "Beaches + no state income tax" },
  { city: "Nashville", state: "TN", blurb: "Music city, family-friendly" },
  { city: "Raleigh", state: "NC", blurb: "Research Triangle, top schools" },
  { city: "San Diego", state: "CA", blurb: "Coastal lifestyle, high demand" },
];

export default function HomesIndexPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Find a home you&apos;ll love
        </h1>
        <p className="mt-3 text-base text-slate-600">
          Search active listings by city, ZIP, price, beds, and more. Save the
          ones you love and we&apos;ll alert you the moment something new matches.
        </p>
      </header>

      <Suspense fallback={<FiltersBarFallback />}>
        <IdxFiltersBar />
      </Suspense>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Popular markets</h2>
        <p className="mt-1 text-sm text-slate-600">
          Browse by city to see what&apos;s on the market this week.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {POPULAR_CITIES.map((c) => {
            const sp = new URLSearchParams({ city: c.city, state: c.state });
            return (
              <Link
                key={`${c.city}-${c.state}`}
                href={`/homes/search?${sp.toString()}`}
                className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:bg-blue-50/40"
              >
                <div className="text-base font-semibold text-slate-900">
                  {c.city}, {c.state}
                </div>
                <div className="mt-1 text-xs text-slate-600">{c.blurb}</div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-12 grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">Save what you love</div>
          <p className="mt-1 text-xs text-slate-600">
            Favorite homes and save searches. We&apos;ll alert you instantly when prices
            drop or a new listing matches.
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">Connect with a local agent</div>
          <p className="mt-1 text-xs text-slate-600">
            Talk to an agent in seconds — schedule a tour or get fast answers about
            any listing.
          </p>
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-900">Free to use</div>
          <p className="mt-1 text-xs text-slate-600">
            No fees, no spam. Just listings that match what you&apos;re actually
            looking for.
          </p>
        </div>
      </section>

      <IdxDisclaimer />
    </main>
  );
}
