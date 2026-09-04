"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
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
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
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

  // AI script + voiceover (Phase 2d).
  const [script, setScript] = useState<string>(listing.ad_reel_script ?? "");
  const [voicedUrl, setVoicedUrl] = useState<string | null>(listing.ad_reel_voiced_url);
  const [voiceKind, setVoiceKind] = useState<"cloned" | "default" | null>(null);
  const [scripting, setScripting] = useState(false);
  const [voicing, setVoicing] = useState(false);
  const [voNote, setVoNote] = useState<string | null>(null);
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
        setError(t("pages.listingAd.needImages"));
        return;
      }
      // Cap the total so a huge upload can't fan out into 30 fal clips later.
      const next = { ...facts, photoUrls: [...facts.photoUrls, ...uploaded].slice(0, 20) };
      setFacts(next);
      // Persist immediately so t("pages.listingAd.generateClips") (which reads the DB) sees them.
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
      setError(t("pages.listingAd.needPhotoToAnimate"));
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

  const voiceoverEndpoint = `/api/dashboard/listings/${encodeURIComponent(listing.id)}/ad-voiceover`;

  async function generateScript() {
    if (scripting) return;
    setScripting(true);
    setError(null);
    setVoNote("Writing a narration script from the listing…");
    try {
      const res = await fetch(voiceoverEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "script" }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; script?: string; error?: string };
      if (!res.ok || !body.ok || !body.script) {
        setError(body.error ?? "Couldn't write a script.");
        setVoNote(null);
        return;
      }
      setScript(body.script);
      setVoNote("Script ready — edit it, then add the voiceover.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
      setVoNote(null);
    } finally {
      setScripting(false);
    }
  }

  async function addVoiceover() {
    if (voicing) return;
    setVoicing(true);
    setError(null);
    setVoNote("Recording the voiceover and adding it to your video… (a minute or two)");
    try {
      const res = await fetch(voiceoverEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "build", script: script.trim() || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        script?: string;
        voice?: "cloned" | "default";
        error?: string;
      };
      if (!res.ok || !body.ok || !body.url) {
        setError(body.error ?? "Couldn't add the voiceover.");
        setVoNote(null);
        return;
      }
      setVoicedUrl(body.url);
      if (body.script) setScript(body.script);
      setVoiceKind(body.voice ?? null);
      setVoNote(
        body.voice === "cloned"
          ? "Voiceover added in your cloned voice."
          : "Voiceover added in a professional voice.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
      setVoNote(null);
    } finally {
      setVoicing(false);
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
            <h2 className="text-sm font-semibold text-slate-900">{t("pages.listingAd.videoAd")}</h2>
            <p className="text-[11px] text-slate-500">{t("pages.listingAd.pullBlurb")}</p>
          </div>
          <button
            type="button"
            onClick={() => void pull()}
            disabled={pulling || !pullUrl.trim()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            title={pullUrl.trim() ? t("pages.listingAd.pullHint") : t("pages.listingAd.pullNeedsUrl")}
          >
            {pulling ? t("common:status.pulling") : hasFacts ? t("pages.listingAd.rePull") : t("pages.listingAd.pullFromUrl")}
          </button>
        </div>

        {/* Paste any listing URL (Zillow/Realtor/etc.). The create form has no
            Listing-URL field, so this is where the pull gets its URL. */}
        <div className="mb-3">
          <input
            value={pullUrl}
            onChange={(e) => setPullUrl(e.target.value)}
            placeholder={t("pages.listingAd.urlPlaceholder")}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            inputMode="url"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {t("pages.listingAd.urlHelp")}
          </p>
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">{error}</p>
        ) : null}

        {warnings.length > 0 ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <div className="font-medium">{t("pages.listingAd.partialPull")}</div>
            <ul className="list-inside list-disc">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <div className="mt-1">{t("pages.listingAd.fillMissing")}</div>
          </div>
        ) : null}

        {source ? (
          <p className="mb-3 text-[11px] text-slate-500">{t("pages.listingAd.source")}<span className="font-medium">{source === "mls_url" ? t("pages.listingAd.mlsPull") : t("pages.listingAd.manual")}</span>
            {confidence != null ? <> · {t("pages.listingAd.confidence", { pct: Math.round(confidence * 100) })}</> : null}
            {savedAt ? (
            <> {t("pages.listingAd.updatedAt", { date: new Date(savedAt).toLocaleDateString(locale) })}</>
          ) : null}
          </p>
        ) : null}

        {/* Facts */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{t("pages.listingAd.beds")}</span>
            <input value={facts.beds} onChange={(e) => setFacts({ ...facts, beds: e.target.value })} className={field} inputMode="numeric" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{t("pages.listingAd.baths")}</span>
            <input value={facts.baths} onChange={(e) => setFacts({ ...facts, baths: e.target.value })} className={field} inputMode="decimal" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{t("pages.listingAd.sqft")}</span>
            <input value={facts.sqft} onChange={(e) => setFacts({ ...facts, sqft: e.target.value })} className={field} inputMode="numeric" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">{t("pages.listingAd.yearBuilt")}</span>
            <input value={facts.yearBuilt} onChange={(e) => setFacts({ ...facts, yearBuilt: e.target.value })} className={field} inputMode="numeric" />
          </label>
        </div>

        <label className="mt-3 block">
          <span className="text-xs font-medium text-slate-600">{t("pages.listingAd.description")}</span>
          <textarea
            value={facts.description}
            onChange={(e) => setFacts({ ...facts, description: e.target.value })}
            rows={3}
            className={`${field} resize-y`}
            placeholder={t("pages.listingAd.descriptionPlaceholder")}
          />
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-medium text-slate-600">{t("pages.listingAd.highlights")}</span>
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
            <span className="text-xs font-medium text-slate-600">{t("pages.dashFragments.photos")}{facts.photoUrls.length})
              {facts.photoUrls.length > 0 && (
                <span className="ml-1 text-slate-400">· {photosToAnimate.length} {t("pages.dashFragments.selectedForVideo")}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {facts.photoUrls.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={selectAllPhotos}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >{t("pages.listingAd.selectAll")}</button>
                  <button
                    type="button"
                    onClick={clearPhotoSelection}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >{t("pages.listingAd.clear")}</button>
                </>
              )}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {uploading ? t("pages.listingAd.uploading") : t("pages.listingAd.uploadPhotos")}
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
                        alt={t("pages.listingAd.listingAlt")}
                        onClick={() => togglePhoto(url)}
                        className={`h-full w-full cursor-pointer object-cover transition ${on ? "" : "opacity-40"}`}
                      />
                      {/* selection tick */}
                      <button
                        type="button"
                        onClick={() => togglePhoto(url)}
                        aria-label={on ? t("pages.listingAd.excludePhoto") : t("pages.listingAd.includePhoto")}
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
                        aria-label={t("pages.listingAd.removePhoto")}
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
            {saving ? t("pages.listingAd.saving") : t("pages.listingAd.saveFacts")}
          </button>
        </div>

        {/* ── Cinematic clips (Phase 2) ──────────────────────────────── */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{t("pages.listingAd.cinematicClips")}</h3>
              <p className="text-[11px] text-slate-500">{t("pages.listingAd.animateBlurb")}</p>
            </div>
            <button
              type="button"
              onClick={() => void generateClips()}
              disabled={generating || photosToAnimate.length === 0}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              title={photosToAnimate.length === 0 ? t("pages.listingAd.needPhoto") : t("pages.listingAd.generateClips")}
            >
              {generating ? t("common:status.rendering") : clipUrls.length > 0 ? t("pages.listingAd.regenerateClips") : t("pages.listingAd.generateClips")}
            </button>
          </div>

          {/* Length controls: per-clip seconds + a live total-length estimate. */}
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
            <span className="text-xs font-medium text-slate-600">{t("pages.listingAd.clipLength")}</span>
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
                  {t("pages.listingAd.clipCount", { count: photosToAnimate.length, seconds: clipSeconds })}{" "}
                  <span className="font-semibold text-slate-700">~{estSeconds}{t("pages.dashFragments.sVideo")}</span>
                </>
              ) : (
                t("pages.listingAd.selectPhotosAboveTo")
              )}
            </span>
          </div>

          {generating ? (
            <p className="mt-2 text-[11px] text-slate-500">{t("pages.listingAd.rendering")}</p>
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
            <p className="mt-2 text-[11px] text-slate-400">{t("pages.listingAd.noClips")}</p>
          )}
        </div>

        {/* ── Finished branded ad (Phase 2b) ─────────────────────────── */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{t("pages.listingAd.videoAd")}</h3>
              <p className="text-[11px] text-slate-500">{t("pages.listingAd.stitchBlurb")}</p>
            </div>
            <button
              type="button"
              onClick={() => void buildReel()}
              disabled={building || clipUrls.length === 0}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              title={clipUrls.length === 0 ? t("pages.listingAd.needClips") : t("pages.listingAd.buildAd")}
            >
              {building ? t("common:status.building") : reelUrl ? t("pages.listingAd.rebuildAd") : t("pages.listingAd.buildAd")}
            </button>
          </div>

          {reelNote ? <p className="mt-2 text-[12px] text-slate-600">{reelNote}</p> : null}

          {reelUrl ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
              <video src={reelUrl} controls loop className="aspect-[9/16] w-48 shrink-0 rounded-lg border border-slate-200 bg-black" />
              <div className="min-w-0 flex-1">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">{t("pages.listingAd.caption")}</span>
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
                    title={t("pages.listingAd.publishHint")}
                  >
                    {publishing ? t("pages.listingAd.publishing") : t("pages.listingAd.publish")}
                  </button>
                  <a
                    href={reelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t("pages.listingAd.download")}
                  </a>
                  {publishNote ? <span className="text-[11px] text-emerald-700">{publishNote}</span> : null}
                  {needsConnect ? (
                    <a href="/connections" className="text-[11px] text-indigo-600 underline underline-offset-2">
                      {t("pages.listingAdPanel.connectSocials")}
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : clipUrls.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate-400">{t("pages.listingAd.clipsFirst")}</p>
          ) : null}
        </div>

        {/* ── AI script + voiceover (Phase 2d) ───────────────────────── */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{t("pages.listingAd.scriptVoiceover")}</h3>
              <p className="text-[11px] text-slate-500">{t("pages.listingAd.narrationBlurb")}</p>
            </div>
            <button
              type="button"
              onClick={() => void generateScript()}
              disabled={scripting || !reelUrl}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title={!reelUrl ? t("pages.listingAd.needAdFirst") : t("pages.listingAd.writeScript")}
            >
              {scripting ? t("common:status.writing") : script ? t("pages.listingAd.rewriteScript") : t("pages.listingAd.generateScript")}
            </button>
          </div>

          {!reelUrl ? (
            <p className="mt-2 text-[11px] text-slate-400">{t("pages.listingAd.buildAdFirstHint")}</p>
          ) : (
            <>
              <label className="mt-3 block">
                <span className="text-xs font-medium text-slate-600">{t("pages.listingAd.narrationScript")}</span>
                <textarea
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  rows={4}
                  placeholder={t("pages.listingAd.scriptPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </label>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void addVoiceover()}
                  disabled={voicing || !script.trim()}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  title={!script.trim() ? t("pages.listingAd.needScript") : t("pages.listingAd.speakScript")}
                >
                  {voicing ? t("common:status.adding") : voicedUrl ? t("pages.listingAd.redoVoiceover") : t("pages.listingAd.addVoiceover")}
                </button>
                {voNote ? <span className="text-[11px] text-slate-600">{voNote}</span> : null}
              </div>

              {voicedUrl ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                  <video
                    src={voicedUrl}
                    controls
                    loop
                    className="aspect-[9/16] w-48 shrink-0 rounded-lg border border-slate-200 bg-black"
                  />
                  <div className="min-w-0 flex-1 text-[11px] text-slate-500">
                    <p className="font-medium text-slate-700">{t("pages.listingAd.voicedVersion")}</p>
                    {voiceKind ? (
                      <p className="mt-0.5">
                        {voiceKind === "cloned" ? t("pages.listingAd.narratedInYourCloned") : t("pages.listingAd.narratedInAProfessional")}
                      </p>
                    ) : null}
                    <p className="mt-1">{t("pages.listingAd.voicedHint")}</p>
                    <a
                      href={voicedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {t("pages.listingAd.download")}
                    </a>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
