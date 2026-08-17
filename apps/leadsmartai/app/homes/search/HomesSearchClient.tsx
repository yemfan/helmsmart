"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import IdxLeadCaptureModal from "@/components/idx/IdxLeadCaptureModal";
import { paramsToBrief, type HomeSearchParams } from "@/lib/house-search/brief";
import type { HouseListing, HouseSearchResult } from "@/lib/house-search/types";

type PublicUsage = {
  tier: "anonymous" | "free" | "unlimited";
  limit: number | null;
  used: number;
  remaining: number | null;
  reached: boolean;
  reason: "anon_limit" | "free_limit" | null;
};

type RateLimit = { reason: "anon_limit" | "free_limit"; message: string };

// Deep links for the conversion CTAs. `next` returns visitors to the search
// after they authenticate.
const SIGNUP_HREF = "/signup?next=/homes/search";
const SIGNIN_HREF = "/login?next=/homes/search";
const UPGRADE_HREF = "/agent/pricing";

/**
 * Public AI house-search experience. Describe a home in plain English (or
 * arrive via a deep link with ?q= or structured ?city=&state=&… params) and
 * Claude + live web search returns real, currently-listed matches with source
 * links, suggested refinements, and a "connect with an agent" CTA.
 *
 * Mirrors the authed dashboard House Search UX (loading state for the ~30-60s
 * run, result cards, refinement chips) but is unauthenticated and rate-limited.
 */
export default function HomesSearchClient({
  initialQuery,
  initialParams,
}: {
  initialQuery: string | null;
  initialParams: HomeSearchParams;
}) {
  const { t } = useTranslation("dashboard");
  // Seed the box: an explicit ?q= wins; otherwise translate structured params.
  const seededBrief = initialQuery?.trim() || paramsToBrief(initialParams) || "";

  const [query, setQuery] = useState(seededBrief);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<RateLimit | null>(null);
  const [result, setResult] = useState<HouseSearchResult | null>(null);
  const [usage, setUsage] = useState<PublicUsage | null>(null);

  // Lead-capture modal (connect with a local agent), optionally seeded with a
  // listing address the buyer was viewing.
  const [leadAddress, setLeadAddress] = useState<string | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);

  const ranOnceRef = useRef(false);

  const runSearch = useCallback(
    async (brief: string, refinements: string[]) => {
      const q = brief.trim();
      if (!q) return;
      setLoading(true);
      setError(null);
      setRateLimited(null);
      try {
        const res = await fetch("/api/homes/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: q, refinements }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          result?: HouseSearchResult;
          error?: string;
          reason?: "anon_limit" | "free_limit";
          usage?: PublicUsage;
        };
        if (data.usage) setUsage(data.usage);
        if (res.status === 429) {
          const reason = data.reason ?? data.usage?.reason ?? "anon_limit";
          setRateLimited({
            reason,
            message:
              data.error ??
              (reason === "free_limit"
                ? "You've hit today's free searches. Upgrade to an unlimited plan to keep searching."
                : "You've used today's free search. Create a free account to keep searching, or try again tomorrow."),
          });
          return;
        }
        if (!res.ok || data.ok === false || !data.result) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setResult(data.result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Auto-run once on mount when we arrived with a seeded brief (deep link from
  // popular cities, open-house "search similar nearby", or filter bar).
  useEffect(() => {
    if (ranOnceRef.current) return;
    if (seededBrief) {
      ranOnceRef.current = true;
      void runSearch(seededBrief, []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void runSearch(query, []);
    },
    [query, runSearch],
  );

  const onRefine = useCallback(
    (label: string) => {
      void runSearch(query, [label]);
    },
    [query, runSearch],
  );

  const openLead = useCallback((address: string | null) => {
    setLeadAddress(address);
    setLeadOpen(true);
  }, []);

  return (
    <div className="space-y-6">
      {/* Search box */}
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <label htmlFor="homes-q" className="text-sm font-semibold text-slate-900">{t("pages.homesSearch.describeIdeal")}</label>
        <textarea
          id="homes-q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="Try: 3-bed condo under $800k in Fremont, walkable to BART"
          className="mt-2 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          disabled={loading}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            {usage?.reached
              ? usage.reason === "free_limit"
                ? "You've hit today's free searches."
                : "You've used today's free search."
              : "Searches the live web — results take up to a minute."}
          </span>
          <button
            type="submit"
            disabled={loading || query.trim().length === 0 || usage?.reached === true}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Searching…" : "Search homes"}
          </button>
        </div>
        {usage && usage.tier === "anonymous" && !usage.reached ? (
          <p className="mt-2 text-[11px] text-slate-400">{t("pages.homesSearch.oneFreePerDay")}</p>
        ) : null}
        {usage && usage.tier === "free" && !usage.reached && usage.remaining != null ? (
          <p className="mt-2 text-[11px] text-slate-400">
            {usage.remaining} of {usage.limit} {t("pages.homesSearch.freeLeft")}</p>
        ) : null}
      </form>

      {rateLimited?.reason === "anon_limit" ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-5 text-sm text-slate-800">
          <p className="text-base font-semibold text-slate-900">{t("pages.homesSearch.usedTodays")}</p>
          <p className="mt-1 text-slate-700">{rateLimited.message}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={SIGNUP_HREF}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >{t("pages.homesSearch.createAccount")}</Link>
            <Link href={SIGNIN_HREF} className="text-sm font-semibold text-blue-700 hover:underline">{t("pages.homesSearch.signIn")}</Link>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t("pages.homesSearch.comeBackTomorrow")}</p>
        </div>
      ) : null}

      {rateLimited?.reason === "free_limit" ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-5 text-sm text-slate-800">
          <p className="text-base font-semibold text-slate-900">{t("pages.homesSearch.hitLimit")}</p>
          <p className="mt-1 text-slate-700">{rateLimited.message}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={UPGRADE_HREF}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >{t("pages.homesSearch.upgrade")}</Link>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t("pages.homesSearch.comeBackTomorrowPl")}</p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
          Searching the web for matching listings… this can take up to a minute.
        </div>
      ) : null}

      {result && !loading ? (
        <>
          {/* Interpretation + refinement chips */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{t("pages.homesSearch.howWeRead")}</h2>
            <p className="mt-1 text-sm text-slate-600">{result.interpreted}</p>
            {result.criteria.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.criteria.map((c, i) => (
                  <li
                    key={i}
                    className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-700"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            ) : null}

            {result.refinements.length > 0 ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("pages.homesSearch.narrowSearch")}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.refinements.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onRefine(r.label)}
                      disabled={loading}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {result.summary ? (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              {result.summary}
            </p>
          ) : null}

          {/* Listings */}
          {result.listings.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{t("pages.homesSearch.noMatches")}</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.listings.map((l, i) => (
                <ListingCard key={i} listing={l} onConnect={() => openLead(l.address)} />
              ))}
            </div>
          )}

          {/* Lead-capture CTA */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">{t("pages.homesSearch.wantHelp")}</div>
              <p className="mt-1 text-xs text-slate-600">{t("pages.homesSearch.connectBody")}</p>
            </div>
            <button
              type="button"
              onClick={() => openLead(null)}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 sm:mt-0"
            >{t("pages.homesSearch.connectAgent")}</button>
          </section>

          {/* Sources + disclaimer */}
          {result.sources.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.articleChrome.sources")}</h3>
              <ul className="mt-2 space-y-1">
                {result.sources.slice(0, 12).map((s, i) => (
                  <li key={i} className="truncate text-xs">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener nofollow"
                      className="text-blue-700 hover:underline"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result.disclaimer ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              {result.disclaimer}
            </p>
          ) : null}
        </>
      ) : null}

      <IdxLeadCaptureModal
        open={leadOpen}
        onClose={() => setLeadOpen(false)}
        context={{
          action: "contact_agent",
          listingAddress: leadAddress,
        }}
      />
    </div>
  );
}

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Price on request";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function metaLine(l: HouseListing): string {
  const parts: string[] = [];
  if (l.beds != null) parts.push(`${l.beds} bd`);
  if (l.baths != null) parts.push(`${l.baths} ba`);
  if (l.sqft) parts.push(`${l.sqft.toLocaleString()} sqft`);
  if (l.propertyType) parts.push(l.propertyType);
  return parts.join(" · ");
}

function ListingCard({
  listing,
  onConnect,
}: {
  listing: HouseListing;
  onConnect: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const meta = metaLine(listing);
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-lg font-bold text-slate-900">{money(listing.price)}</div>
      {meta ? <div className="mt-1 text-sm text-slate-700">{meta}</div> : null}
      <div className="mt-1 text-sm text-slate-600">{listing.address}</div>
      {listing.matchReason ? (
        <p className="mt-2 text-xs text-slate-600">{listing.matchReason}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
        {listing.listingUrl ? (
          <a
            href={listing.listingUrl}
            target="_blank"
            rel="noopener nofollow"
            className="text-xs font-semibold text-blue-700 hover:underline"
          >
            View listing ↗
          </a>
        ) : null}
        <button
          type="button"
          onClick={onConnect}
          className="text-xs font-semibold text-slate-700 hover:text-slate-900 hover:underline"
        >{t("pages.homesSearch.askAnAgent")}</button>
      </div>
    </div>
  );
}
