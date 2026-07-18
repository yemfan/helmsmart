"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { HomesInBudgetResults } from "@/components/search/HomesInBudgetResults";
import { SaveThisSearchButton } from "@/components/search/SaveThisSearchButton";
import { paramsToBrief } from "@/lib/listings/brief";
import type { ListingResult } from "@/lib/listings/adapters/types";
import type { SavedSearchCriteria } from "@/lib/contacts/types";

type SearchCriteria = {
  maxPrice: number;
  minPrice: number;
  zip: string;
  city: string;
  state: string;
  propertyType: string;
  beds: number;
  baths: number;
};

type PublicUsage = {
  tier: "anonymous" | "free" | "unlimited";
  limit: number | null;
  used: number;
  remaining: number | null;
  reached: boolean;
  reason: "anon_limit" | "free_limit" | null;
};

type RateLimit = { reason: "anon_limit" | "free_limit"; message: string };

// Conversion CTAs. `next` returns visitors to the search after they auth.
const SIGNUP_HREF = "/signup?next=/search";
const SIGNIN_HREF = "/login?next=/search";
const UPGRADE_HREF = "/pricing";

function paramsFromSearch(sp: URLSearchParams): SearchCriteria {
  return {
    maxPrice: Number(sp.get("maxPrice") || 0),
    minPrice: Number(sp.get("minPrice") || 0),
    zip: sp.get("zip") || "",
    city: sp.get("city") || "",
    state: sp.get("state") || "CA",
    propertyType: sp.get("propertyType") || "",
    beds: Number(sp.get("beds") || 0),
    baths: Number(sp.get("baths") || 0),
  };
}

function briefFromCriteria(c: SearchCriteria): string | null {
  return paramsToBrief({
    city: c.city,
    state: c.state,
    zip: c.zip,
    priceMin: c.minPrice || null,
    priceMax: c.maxPrice || null,
    bedsMin: c.beds || null,
    bathsMin: c.baths || null,
    propertyType: c.propertyType || null,
  });
}

function SearchPageInner() {
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [homes, setHomes] = useState<ListingResult[]>([]);
  const [criteria, setCriteria] = useState<SearchCriteria | null>(null);
  const [error, setError] = useState("");
  const [rateLimited, setRateLimited] = useState<RateLimit | null>(null);
  const [usage, setUsage] = useState<PublicUsage | null>(null);
  const [ran, setRan] = useState(false);

  const ranOnceRef = useRef(false);

  const runSearch = useCallback(async (brief: string, crit: SearchCriteria | null) => {
    const q = brief.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    setRateLimited(null);
    setRan(true);
    try {
      const qs = new URLSearchParams();
      qs.set("q", q);
      if (crit) {
        if (crit.city) qs.set("city", crit.city);
        if (crit.state) qs.set("state", crit.state);
        if (crit.zip) qs.set("zip", crit.zip);
        if (crit.maxPrice) qs.set("maxPrice", String(crit.maxPrice));
        if (crit.minPrice) qs.set("minPrice", String(crit.minPrice));
        if (crit.propertyType) qs.set("propertyType", crit.propertyType);
        if (crit.beds) qs.set("beds", String(crit.beds));
        if (crit.baths) qs.set("baths", String(crit.baths));
      }
      const res = await fetch(`/api/search/homes-in-budget?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        results?: ListingResult[];
        criteria?: SearchCriteria;
        error?: string;
        reason?: "anon_limit" | "free_limit";
        usage?: PublicUsage;
      };
      if (json.usage) setUsage(json.usage);
      if (json.criteria) setCriteria(json.criteria);
      if (res.status === 429) {
        const reason = json.reason ?? json.usage?.reason ?? "anon_limit";
        setRateLimited({
          reason,
          message:
            json.error ??
            (reason === "free_limit"
              ? "You've hit today's free searches. Upgrade to a paid plan to keep searching."
              : "You've used today's free search. Create a free account to keep searching, or try again tomorrow."),
        });
        return;
      }
      if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load homes");
      setHomes(json.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load homes");
    } finally {
      setLoading(false);
    }
  }, []);

  // Seed from the URL: an explicit ?q= wins; otherwise translate structured
  // params into a brief. Auto-run once on mount when we arrived with a signal.
  useEffect(() => {
    if (ranOnceRef.current) return;
    ranOnceRef.current = true;

    const crit = paramsFromSearch(searchParams);
    setCriteria(crit);
    const qParam = (searchParams.get("q") || "").trim();
    const seeded = qParam || briefFromCriteria(crit) || "";
    setQuery(seeded);
    if (seeded) void runSearch(seeded, crit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void runSearch(query, criteria);
    },
    [query, criteria, runSearch],
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border bg-white p-8 shadow-sm md:p-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-gray-900">
                Homes in Your Budget
              </h1>
              <p className="mt-3 text-sm text-gray-600 md:text-base">
                Describe the home you want in plain English — our AI searches the
                live web and returns real matching listings with source links.
              </p>
            </div>
            {criteria && (
              <SaveThisSearchButton criteria={criteriaToSavedSearchCriteria(criteria)} />
            )}
          </div>

          <form onSubmit={onSubmit} className="mt-6">
            <label htmlFor="homes-q" className="text-sm font-semibold text-gray-900">
              Describe your ideal home
            </label>
            <textarea
              id="homes-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={3}
              placeholder="Try: 3-bed condo under $800k in Pasadena, walkable to shops"
              className="mt-2 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
              disabled={loading}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-400">
                {usage?.reached
                  ? usage.reason === "free_limit"
                    ? "You've hit today's free searches."
                    : "You've used today's free search."
                  : "Searches the live web — results take up to a minute."}
              </span>
              <button
                type="submit"
                disabled={loading || query.trim().length === 0 || usage?.reached === true}
                className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Searching…" : "Search homes"}
              </button>
            </div>
            {usage && usage.tier === "anonymous" && !usage.reached ? (
              <p className="mt-2 text-[11px] text-gray-400">
                You get 1 free AI search per day. Create a free account for 5 a day —
                more on a paid plan.
              </p>
            ) : null}
            {usage && usage.tier === "free" && !usage.reached && usage.remaining != null ? (
              <p className="mt-2 text-[11px] text-gray-400">
                {usage.remaining} of {usage.limit} free searches left today. Upgrade for
                unlimited.
              </p>
            ) : null}
          </form>
        </section>

        {rateLimited?.reason === "anon_limit" ? (
          <div className="rounded-3xl border border-blue-200 bg-blue-50 px-6 py-5 text-sm text-gray-800">
            <p className="text-base font-semibold text-gray-900">
              You&apos;ve used today&apos;s free search
            </p>
            <p className="mt-1 text-gray-700">{rateLimited.message}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href={SIGNUP_HREF}
                className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              >
                Create free account
              </Link>
              <Link href={SIGNIN_HREF} className="text-sm font-semibold text-[#0066b3] hover:underline">
                Sign in
              </Link>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Or come back tomorrow — your free search resets daily.
            </p>
          </div>
        ) : null}

        {rateLimited?.reason === "free_limit" ? (
          <div className="rounded-3xl border border-blue-200 bg-blue-50 px-6 py-5 text-sm text-gray-800">
            <p className="text-base font-semibold text-gray-900">
              You&apos;ve hit today&apos;s free searches
            </p>
            <p className="mt-1 text-gray-700">{rateLimited.message}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href={UPGRADE_HREF}
                className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              >
                Upgrade
              </Link>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Or come back tomorrow — your free searches reset daily.
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border bg-white p-6 text-sm text-gray-500 shadow-sm">
            Searching the web for matching listings… this can take up to a minute.
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error}
          </div>
        ) : ran && !rateLimited ? (
          <HomesInBudgetResults homes={homes} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Translate the page's URL-param SearchCriteria into the shape the
 * saved-searches service expects. Drops zero/empty fields so the
 * criteria JSON doesn't pollute the DB with "priceMin: 0" when the
 * user didn't actually set a minimum.
 */
function criteriaToSavedSearchCriteria(c: SearchCriteria): SavedSearchCriteria {
  const out: SavedSearchCriteria = {};
  if (c.city) out.city = c.city;
  if (c.state) out.state = c.state;
  if (c.zip) out.zip = c.zip;
  if (c.propertyType && c.propertyType !== "any") {
    const pt = c.propertyType.toLowerCase().replace(/[-\s]/g, "_");
    if (
      pt === "single_family" ||
      pt === "condo" ||
      pt === "townhouse" ||
      pt === "multi_family"
    ) {
      out.propertyType = pt;
    }
  }
  if (c.minPrice && Number(c.minPrice) > 0) out.priceMin = Number(c.minPrice);
  if (c.maxPrice && Number(c.maxPrice) > 0) out.priceMax = Number(c.maxPrice);
  if (c.beds && Number(c.beds) > 0) out.bedsMin = Number(c.beds);
  if (c.baths && Number(c.baths) > 0) out.bathsMin = Number(c.baths);
  return out;
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 p-4 md:p-6">
          <div className="mx-auto max-w-7xl rounded-3xl border bg-white p-8 text-sm text-gray-500 shadow-sm">
            Loading search…
          </div>
        </div>
      }
    >
      <SearchPageInner />
    </Suspense>
  );
}
