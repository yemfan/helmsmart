"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/marketing/trackEvent";

/**
 * SEO-page listings CTA.
 *
 * Previously this fetched /api/search/homes-in-budget on mount and rendered a
 * live grid. That endpoint is now AI-backed (~40s Claude + web_search per call)
 * and rate-limited, which is unacceptable for a component that renders on every
 * SEO page visit. So this is now a STATIC call-to-action: it deep-links into the
 * /search AI experience pre-seeded with the page's city/state (and any known
 * filters) instead of running a live search here.
 */
export function SeoListingsGrid({
  query,
  seoPageSlug,
}: {
  query: {
    city: string;
    state: string;
    zip?: string;
    maxPrice?: number;
    beds?: number;
    propertyType?: string;
  };
  seoPageSlug?: string;
}) {
  const qs = new URLSearchParams();
  if (query.city) qs.set("city", query.city);
  if (query.state) qs.set("state", query.state);
  if (query.zip?.trim()) qs.set("zip", query.zip.trim());
  if (query.maxPrice) qs.set("maxPrice", String(query.maxPrice));
  if (query.beds) qs.set("beds", String(query.beds));
  if (query.propertyType) qs.set("propertyType", query.propertyType);

  const href = `/search?${qs.toString()}`;
  const where = [query.city, query.state].filter(Boolean).join(", ");

  return (
    <section className="rounded-3xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900">Homes available now</h2>
      <p className="mt-2 text-sm text-gray-600">
        Run an AI-powered search of live listings{where ? ` in ${where}` : ""} — describe
        exactly what you want and get real matches with source links.
      </p>
      <div className="mt-4">
        <Link
          href={href}
          onClick={() =>
            trackEvent("seo_listing_cta_click", {
              seo_slug: seoPageSlug ?? null,
              city: query.city ?? null,
              state: query.state ?? null,
            })
          }
          className="inline-flex items-center gap-2 rounded-2xl bg-gray-900 px-5 py-3 text-sm font-medium text-white"
        >
          {where ? `Search homes in ${where}` : "Search homes"} →
        </Link>
      </div>
    </section>
  );
}
