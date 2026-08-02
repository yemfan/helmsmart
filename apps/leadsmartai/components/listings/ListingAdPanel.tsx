"use client";

import { useState } from "react";
import type { ListingDetail } from "@/lib/listings/types";

/**
 * Listing → video ad panel (Phase 1: intake).
 *
 * Pulls the property's photos + facts from its MLS URL (AI web_fetch) so a
 * video ad has source material, and lets the agent review/edit/upload since
 * portal scraping is best-effort. Phase 2 adds the cinematic video generation;
 * this panel is where the "Generate video ad" button will live.
 */

type Facts = {
  beds: string;
  baths: string;
  sqft: string;
  yearBuilt: string;
  description: string;
  highlights: string; // newline-separated in the textarea
  photoUrls: string[];
};

function factsFromListing(l: ListingDetail): Facts {
  return {
    beds: l.beds != null ? String(l.beds) : "",
    baths: l.baths != null ? String(l.baths) : "",
    sqft: l.sqft != null ? String(l.sqft) : "",
    yearBuilt: l.year_built != null ? String(l.year_built) : "",
    description: l.property_description ?? "",
    highlights: (l.highlights ?? []).join("\n"),
    photoUrls: l.photo_urls ?? [],
  };
}

export function ListingAdPanel({ listing }: { listing: ListingDetail }) {
  const [facts, setFacts] = useState<Facts>(() => factsFromListing(listing));
  const [source, setSource] = useState<string | null>(listing.ad_facts_source);
  const [confidence, setConfidence] = useState<number | null>(listing.ad_facts_confidence);
  const [pulling, setPulling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(listing.ad_facts_updated_at);

  const hasFacts =
    !!facts.beds ||
    !!facts.baths ||
    !!facts.sqft ||
    !!facts.description ||
    facts.photoUrls.length > 0;

  async function pull() {
    if (pulling) return;
    setPulling(true);
    setError(null);
    setWarnings([]);
    try {
      const res = await fetch(`/api/dashboard/listings/${encodeURIComponent(listing.id)}/ad-intake`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        listing?: ListingDetail;
        facts?: { warnings?: string[]; confidence?: number };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.listing) {
        setError(body.error ?? "Couldn't pull the listing.");
        return;
      }
      setFacts(factsFromListing(body.listing));
      setSource(body.listing.ad_facts_source);
      setConfidence(body.listing.ad_facts_confidence);
      setSavedAt(body.listing.ad_facts_updated_at);
      setWarnings(body.facts?.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPulling(false);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/listings/${encodeURIComponent(listing.id)}/ad-intake`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          beds: facts.beds,
          baths: facts.baths,
          sqft: facts.sqft,
          yearBuilt: facts.yearBuilt,
          description: facts.description,
          highlights: facts.highlights.split("\n").map((s) => s.trim()).filter(Boolean),
          photoUrls: facts.photoUrls,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        listing?: ListingDetail;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.listing) {
        setError(body.error ?? "Couldn't save.");
        return;
      }
      setSource(body.listing.ad_facts_source);
      setSavedAt(body.listing.ad_facts_updated_at);
      setConfidence(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  function removePhoto(url: string) {
    setFacts((f) => ({ ...f, photoUrls: f.photoUrls.filter((u) => u !== url) }));
  }

  const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";

  return (
    <section>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Video ad</h2>
            <p className="text-[11px] text-slate-500">
              Pull the photos + facts from the listing, then (soon) generate a cinematic video ad.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void pull()}
            disabled={pulling}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            title={listing.mls_url ? "Fetch photos + facts from the MLS URL" : "No MLS URL on this listing"}
          >
            {pulling ? "Pulling…" : hasFacts ? "Re-pull from MLS" : "Pull from MLS"}
          </button>
        </div>

        {!listing.mls_url ? (
          <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            This listing has no MLS URL — pulling won&apos;t work. Add one on the listing, or fill the facts in
            manually below.
          </p>
        ) : null}

        {error ? (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">{error}</p>
        ) : null}

        {warnings.length > 0 ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <div className="font-medium">The pull was partial:</div>
            <ul className="list-inside list-disc">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <div className="mt-1">Fill in what&apos;s missing below.</div>
          </div>
        ) : null}

        {source ? (
          <p className="mb-3 text-[11px] text-slate-500">
            Source: <span className="font-medium">{source === "mls_url" ? "MLS pull" : "Manual"}</span>
            {confidence != null ? <> · confidence {Math.round(confidence * 100)}%</> : null}
            {savedAt ? <> · updated {new Date(savedAt).toLocaleDateString()}</> : null}
          </p>
        ) : null}

        {/* Facts */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Beds</span>
            <input value={facts.beds} onChange={(e) => setFacts({ ...facts, beds: e.target.value })} className={field} inputMode="numeric" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Baths</span>
            <input value={facts.baths} onChange={(e) => setFacts({ ...facts, baths: e.target.value })} className={field} inputMode="decimal" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Sq ft</span>
            <input value={facts.sqft} onChange={(e) => setFacts({ ...facts, sqft: e.target.value })} className={field} inputMode="numeric" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Year built</span>
            <input value={facts.yearBuilt} onChange={(e) => setFacts({ ...facts, yearBuilt: e.target.value })} className={field} inputMode="numeric" />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="text-xs font-medium text-slate-600">Description</span>
          <textarea
            value={facts.description}
            onChange={(e) => setFacts({ ...facts, description: e.target.value })}
            rows={3}
            className={`${field} resize-y`}
            placeholder="The marketing description for this home…"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-medium text-slate-600">Highlights (one per line)</span>
          <textarea
            value={facts.highlights}
            onChange={(e) => setFacts({ ...facts, highlights: e.target.value })}
            rows={3}
            className={`${field} resize-y`}
            placeholder={"Chef's kitchen\nWalk to downtown\nBrand-new roof"}
          />
        </label>

        {/* Photos */}
        <div className="mt-3">
          <span className="text-xs font-medium text-slate-600">
            Photos ({facts.photoUrls.length})
          </span>
          {facts.photoUrls.length === 0 ? (
            <p className="mt-1 text-[12px] text-slate-400">
              No photos yet. Pull from the MLS URL, or (in a later step) upload your own.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {facts.photoUrls.map((url) => (
                <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="listing" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(url)}
                    className="absolute right-1 top-1 hidden rounded-full bg-black/60 px-1.5 text-xs text-white group-hover:block"
                    aria-label="remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">Generating the video ad comes next.</span>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save facts"}
          </button>
        </div>
      </div>
    </section>
  );
}
