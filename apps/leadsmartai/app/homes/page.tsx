import type { Metadata } from "next";
import Link from "next/link";

import { HOUSE_SEARCH_DISCLAIMER } from "@/lib/house-search/types";

export const metadata: Metadata = {
  title: "Homes for sale | CloseBoss",
  description:
    "Describe your ideal home in plain English and get real, current listings — powered by AI and live web search. Then connect with a local agent.",
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

/**
 * Public homes landing. The old RentCast IDX filter bar is gone — the browse
 * surface is now AI natural-language search (see /homes/search). This page is a
 * static shell: a plain GET form that hands a free-text query to the search
 * page (no client JS needed), popular-city tiles that deep-link into an
 * AI-brief search, and the value-prop section.
 */
export default function HomesIndexPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Find a home you&apos;ll love
        </h1>
        <p className="mt-3 text-base text-slate-600">
          Describe what you&apos;re looking for in plain English — our AI searches
          the live web for real, current listings and links you straight to the
          source.
        </p>
      </header>

      {/* Natural-language search — a plain GET form so the shell stays static. */}
      <form
        action="/homes/search"
        method="get"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row"
      >
        <label htmlFor="homes-q" className="sr-only">
          Describe the home you want
        </label>
        <input
          id="homes-q"
          name="q"
          type="text"
          placeholder="Try: 3-bed condo under $800k in Fremont, walkable to BART"
          className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Search homes
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Popular markets</h2>
        <p className="mt-1 text-sm text-slate-600">
          Browse by city to see what&apos;s on the market right now.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {POPULAR_CITIES.map((c) => {
            const q = `Homes for sale in ${c.city}, ${c.state}`;
            const sp = new URLSearchParams({ q });
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
          <div className="text-sm font-semibold text-slate-900">Search in plain English</div>
          <p className="mt-1 text-xs text-slate-600">
            Skip the checkboxes. Describe the home you want and let AI find real,
            current listings that fit.
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
          <div className="text-sm font-semibold text-slate-900">Free to try</div>
          <p className="mt-1 text-xs text-slate-600">
            One free AI search a day, no strings. Create a free account for 5 a
            day — unlimited on a paid plan. No spam, ever.
          </p>
        </div>
      </section>

      <footer className="mt-12 border-t border-slate-200 pt-6 pb-10 text-[11px] leading-relaxed text-slate-500">
        <p>{HOUSE_SEARCH_DISCLAIMER}</p>
        <p className="mt-2">Equal Housing Opportunity.</p>
      </footer>
    </main>
  );
}
