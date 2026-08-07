"use client";

import { useMemo, useRef, useState } from "react";
import {
  LISTING_AD_MAX_CLIPS,
  LISTING_AD_CLIP_SECONDS,
  type ListingAdClipSeconds,
  type ListingDetail,
} from "@/lib/listings/types";
import { createClient } from "@/lib/supabase/client";
import { uploadViaStorage } from "@/lib/uploads/uploadViaStorage";

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

  // Cinematic clips (Phase 2).
  const [clipUrls, setClipUrls] = useState<string[]>(listing.ad_clip_urls ?? []);
  const [generating, setGenerating] = useState(false);
  const [clipNote, setClipNote] = useState<string | null>(null);
  // Which photos to animate (agent-selected) + how long each clip runs. Null
  // selection = "all" (the default) so it Just Works before the agent touches it.
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string> | null>(null);
  const [clipSeconds, setClipSeconds] = useState<ListingAdClipSeconds>(5);

  // The ordered photos that will actually be animated: the agent's selection
  // (or all photos) in listing order, capped at the hard clip ceiling.
  const photosToAnimate = useMemo(() => {
    const chosen = facts.photoUrls.filter((u) => (selectedPhotos ? selectedPhotos.has(u) : true));
    return chosen.slice(0, LISTING_AD_MAX_CLIPS);
  }, [facts.photoUrls, selectedPhotos]);
  const estSeconds = photosToAnimate.length * clipSeconds;

  const isSelected = (url: string) => (selectedPhotos ? selectedPhotos.has(url) : true);
  const togglePhoto = (url: string) =>
    setSelectedPhotos((cur) => {
      const base = cur ?? new Set(facts.photoUrls);
      const next = new Set(base);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  const selectAllPhotos = () => setSelectedPhotos(null);
  const clearPhotoSelection = () => setSelectedPhotos(new Set());

  // Finished video ad (Phase 2b) + publish (Phase 2c).
  const [reelUrl, setReelUrl] = useState<string | null>(listing.ad_reel_url);
  const [reelCaption, setReelCaption] = useState<string>(listing.ad_reel_caption ?? "");
  const [building, setBuilding] = useState(false);
  const [reelNote, setReelNote] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishNote, setPublishNote] = useState<string | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);

  // Photo upload — the reliable foundation (portals like Zillow 403 the pull).
  const [uploading, setUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Paste-a-URL for the pull (the create form has no Listing-URL field).
  const [pullUrl, setPullUrl] = useState(listing.mls_url ?? "");

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
        body: JSON.stringify({ url: pullUrl.trim() || undefined }),
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

  /** Persist the given facts (manual source). Shared by Save + photo upload. */
  async function persistFacts(next: Facts): Promise<boolean> {
    const res = await fetch(`/api/dashboard/listings/${encodeURIComponent(listing.id)}/ad-intake`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        beds: next.beds,
        baths: next.baths,
        sqft: next.sqft,
        yearBuilt: next.yearBuilt,
        description: next.description,
        highlights: next.highlights.split("\n").map((s) => s.trim()).filter(Boolean),
        photoUrls: next.photoUrls,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; listing?: ListingDetail; error?: string };
    if (!res.ok || !body.ok || !body.listing) {
      setError(body.error ?? "Couldn't save.");
      return false;
    }
    setSource(body.listing.ad_facts_source);
    setSavedAt(body.listing.ad_facts_updated_at);
    setConfidence(null);
    return true;
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await persistFacts(facts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const supa = createClient();
      const uploaded: string[] = [];
      for (const f of files) {
        if (!f.type.startsWith("image/")) continue;
        const path = await uploadViaStorage(f, "ad_photo");
        const url = supa?.storage.from("social-images").getPublicUrl(path).data.publicUrl;
        if (url) uploaded.push(url);
      }
      if (uploaded.length === 0) {
        setError("Please choose image files.");
        return;
      }
      // Cap the total so a huge upload can't fan out into 30 fal clips later.
      const next = { ...facts, photoUrls: [...facts.photoUrls, ...uploaded].slice(0, 20) };
      setFacts(next);
      // Persist immediately so "Generate cinematic clips" (which reads the DB) sees them.
      await persistFacts(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(url: string) {
    setFacts((f) => {
      const next = { ...f, photoUrls: f.photoUrls.filter((u) => u !== url) };
      void persistFacts(next);
      return next;
    });
  }

  async function generateClips() {
    if (generating) return;
    // Render one photo per request (fal clips are slow; all-at-once times out).
    // The client loops over the agent's selected photos and shows progress;
    // index 0 resets the set server-side.
    const queue = photosToAnimate;
    const total = queue.length;
    if (total === 0) {
      setError("Select at least one photo to animate.");
      return;
    }
    setGenerating(true);
    setError(null);
    setClipNote(null);
    setClipUrls([]);
    try {
      let done = 0;
      let failed = 0;
      for (let i = 0; i < total; i++) {
        setClipNote(`Rendering clip ${i + 1} of ${total}… (~1–2 min each)`);
        try {
          const res = await fetch(`/api/dashboard/listings/${encodeURIComponent(listing.id)}/ad-video`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ index: i, photoUrl: queue[i], durationSec: String(clipSeconds) }),
          });
          const body = (await res.json().catch(() => ({}))) as { ok?: boolean; clipUrls?: string[]; error?: string };
          if (!res.ok || !body.ok) {
            failed += 1;
            // A hard config/credit error: stop the loop.
            if (res.status === 503 || res.status === 402) {
              setError(body.error ?? "Couldn't generate clips.");
              break;
            }
            continue;
          }
          done += 1;
          if (body.clipUrls) setClipUrls(body.clipUrls);
        } catch {
          failed += 1;
        }
      }
      setClipNote(
        failed > 0
          ? `${done} of ${total} clips rendered — ${failed} failed. Try again to retry.`
          : `${done} cinematic clip${done === 1 ? "" : "s"} ready.`,
      );
    } finally {
      setGenerating(false);
    }
  }

  const reelUrlEndpoint = `/api/dashboard/listings/${encodeURIComponent(listing.id)}/ad-reel`;

  async function buildReel() {
    if (building || clipUrls.length === 0) return;
    setBuilding(true);
    setError(null);
    setReelNote("Merging the clips + writing the caption… (a minute or two)");
    setReelUrl(null);
    try {
      // The merge runs server-side and returns the finished MP4 (no separate poll).
      const res = await fetch(reelUrlEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; caption?: string; error?: string };
      if (!res.ok || !body.ok || !body.url) {
        setError(body.error ?? "Couldn't build the ad.");
        setReelNote(null);
        return;
      }
      setReelUrl(body.url);
      if (body.caption) setReelCaption(body.caption);
      setReelNote("Your video ad is ready.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
      setReelNote(null);
    } finally {
      setBuilding(false);
    }
  }

  async function publishReel() {
    if (publishing || !reelUrl) return;
    setPublishing(true);
    setError(null);
    setPublishNote(null);
    setNeedsConnect(false);
    try {
      const res = await fetch(`${reelUrlEndpoint}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caption: reelCaption }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; scheduled?: number; error?: string };
      if (!res.ok || !body.ok) {
        if ((body.error ?? "").toLowerCase().includes("connected")) setNeedsConnect(true);
        setError(body.error ?? "Couldn't publish.");
        return;
      }
      setPublishNote(`Queued to ${body.scheduled ?? 0} channel${body.scheduled === 1 ? "" : "s"} — posts within a few minutes.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setPublishing(false);
    }
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
            disabled={pulling || !pullUrl.trim()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            title={pullUrl.trim() ? "Render the listing page and pull photos + facts" : "Paste a listing URL first"}
          >
            {pulling ? "Pulling…" : hasFacts ? "Re-pull from URL" : "Pull from URL"}
          </button>
        </div>

        {/* Paste any listing URL (Zillow/Realtor/etc.). The create form has no
            Listing-URL field, so this is where the pull gets its URL. */}
        <div className="mb-3">
          <input
            value={pullUrl}
            onChange={(e) => setPullUrl(e.target.value)}
            placeholder="Paste a listing URL — e.g. https://www.zillow.com/homedetails/…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            inputMode="url"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Best on your own listing. Photos come from the page; if a portal blocks it, use “+ Upload photos” below.
          </p>
        </div>

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-600">
              Photos ({facts.photoUrls.length})
              {facts.photoUrls.length > 0 && (
                <span className="ml-1 text-slate-400">· {photosToAnimate.length} selected for video</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {facts.photoUrls.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={selectAllPhotos}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearPhotoSelection}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "+ Upload photos"}
              </button>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onPickPhotos}
              className="hidden"
            />
          </div>
          {facts.photoUrls.length === 0 ? (
            <p className="mt-1 text-[12px] text-slate-400">
              No photos yet. <strong>Upload your listing photos</strong> (most reliable), or try Pull from MLS.
            </p>
          ) : (
            <>
              <p className="mt-1 text-[11px] text-slate-400">
                Tap a photo to include or exclude it from the video. The first {LISTING_AD_MAX_CLIPS} selected
                (in order) become clips.
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {facts.photoUrls.map((url) => {
                  const on = isSelected(url);
                  const overCap = on && photosToAnimate.indexOf(url) === -1; // selected but past the cap
                  return (
                    <div
                      key={url}
                      className={`group relative aspect-square overflow-hidden rounded-lg border-2 bg-slate-50 transition ${
                        on && !overCap ? "border-indigo-500" : "border-slate-200"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="listing"
                        onClick={() => togglePhoto(url)}
                        className={`h-full w-full cursor-pointer object-cover transition ${on ? "" : "opacity-40"}`}
                      />
                      {/* selection tick */}
                      <button
                        type="button"
                        onClick={() => togglePhoto(url)}
                        aria-label={on ? "Exclude photo from video" : "Include photo in video"}
                        aria-pressed={on}
                        className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold shadow ${
                          on && !overCap
                            ? "bg-indigo-600 text-white"
                            : overCap
                              ? "bg-amber-500 text-white"
                              : "bg-white/80 text-slate-400"
                        }`}
                        title={overCap ? `Beyond the ${LISTING_AD_MAX_CLIPS}-clip limit — won't be used` : undefined}
                      >
                        {on ? (overCap ? "!" : "✓") : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => removePhoto(url)}
                        className="absolute right-1 top-1 hidden rounded-full bg-black/60 px-1.5 text-xs text-white group-hover:block"
                        aria-label="remove photo"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save facts"}
          </button>
        </div>

        {/* ── Cinematic clips (Phase 2) ──────────────────────────────── */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Cinematic clips</h3>
              <p className="text-[11px] text-slate-500">
                Animate your selected photos into cinematic motion clips (the raw material for the video ad).
              </p>
            </div>
            <button
              type="button"
              onClick={() => void generateClips()}
              disabled={generating || photosToAnimate.length === 0}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              title={photosToAnimate.length === 0 ? "Select at least one photo" : "Generate cinematic clips (fal)"}
            >
              {generating ? "Rendering…" : clipUrls.length > 0 ? "Re-generate clips" : "Generate cinematic clips"}
            </button>
          </div>

          {/* Length controls: per-clip seconds + a live total-length estimate. */}
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
            <span className="text-xs font-medium text-slate-600">Clip length</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
              {LISTING_AD_CLIP_SECONDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setClipSeconds(s)}
                  className={`px-3 py-1 text-xs font-medium transition ${
                    clipSeconds === s ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">
              {photosToAnimate.length > 0 ? (
                <>
                  {photosToAnimate.length} clip{photosToAnimate.length === 1 ? "" : "s"} × {clipSeconds}s ≈{" "}
                  <span className="font-semibold text-slate-700">~{estSeconds}s video</span>
                </>
              ) : (
                "Select photos above to set the length"
              )}
            </span>
          </div>

          {generating ? (
            <p className="mt-2 text-[11px] text-slate-500">
              Rendering cinematic motion — this can take a couple minutes per photo.
            </p>
          ) : null}
          {clipNote ? <p className="mt-2 text-[12px] text-slate-600">{clipNote}</p> : null}

          {clipUrls.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {clipUrls.map((url) => (
                <video
                  key={url}
                  src={url}
                  controls
                  loop
                  muted
                  className="aspect-[9/16] w-full rounded-lg border border-slate-200 bg-black object-cover"
                />
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-400">
              No clips yet. Generate them above, then build the branded ad below.
            </p>
          )}
        </div>

        {/* ── Finished branded ad (Phase 2b) ─────────────────────────── */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Video ad</h3>
              <p className="text-[11px] text-slate-500">
                Stitch the clips into one video tour + an AI caption — ready to post.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void buildReel()}
              disabled={building || clipUrls.length === 0}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              title={clipUrls.length === 0 ? "Generate cinematic clips first" : "Build the video ad"}
            >
              {building ? "Building…" : reelUrl ? "Rebuild ad" : "Build the video ad"}
            </button>
          </div>

          {reelNote ? <p className="mt-2 text-[12px] text-slate-600">{reelNote}</p> : null}

          {reelUrl ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
              <video src={reelUrl} controls loop className="aspect-[9/16] w-48 shrink-0 rounded-lg border border-slate-200 bg-black" />
              <div className="min-w-0 flex-1">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Caption</span>
                  <textarea
                    value={reelCaption}
                    onChange={(e) => setReelCaption(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void publishReel()}
                    disabled={publishing}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    title="Post to your connected Facebook / Instagram / LinkedIn"
                  >
                    {publishing ? "Publishing…" : "Publish to social"}
                  </button>
                  <a
                    href={reelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Download ↗
                  </a>
                  {publishNote ? <span className="text-[11px] text-emerald-700">{publishNote}</span> : null}
                  {needsConnect ? (
                    <a href="/connections" className="text-[11px] text-indigo-600 underline underline-offset-2">
                      Connect Facebook / Instagram / LinkedIn →
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : clipUrls.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-400">Generate the cinematic clips first.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
