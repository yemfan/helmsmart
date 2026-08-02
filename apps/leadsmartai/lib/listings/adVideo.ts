import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ListingAdFacts } from "@/lib/listings/types";

/**
 * Listing ad video — Phase 2a: animate the listing's REAL photos into short
 * cinematic clips via fal image-to-video (Kling). These clips are the raw
 * material Phase 2b stitches into a branded reel (Remotion) for publishing.
 *
 * Using image-to-video on the actual photos (not text-to-video) keeps the ad
 * showing the real home, with cinematic camera motion. Gated on FAL_KEY —
 * falConfigured() is false until it's set in the leadsmartai Vercel project, so
 * the route/UI degrade gracefully instead of throwing.
 *
 * Cost note: each clip is a paid fal render (~$0.25-0.50). We cap the number of
 * photos animated per run (MAX_CLIPS) so a listing with 30 photos can't fan out
 * into a surprise bill.
 */

const FAL_QUEUE = "https://queue.fal.run";
const MODEL = "fal-ai/kling-video/v1.6/standard/image-to-video";
export const MAX_CLIPS = 5;
const BUCKET = "social-images";

export function falConfigured(): boolean {
  return Boolean(process.env.FAL_KEY?.trim());
}

function falHeaders(): Record<string, string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

/** A cinematic, real-estate motion prompt. Varies the move per index so the
 *  stitched tour doesn't feel like the same camera push five times. */
function motionPrompt(index: number, facts: ListingAdFacts): string {
  const moves = [
    "slow cinematic push-in",
    "gentle left-to-right parallax glide",
    "smooth crane-up reveal",
    "subtle dolly-in with slight tilt",
    "slow orbit / arc around the space",
  ];
  const move = moves[index % moves.length];
  const place = facts.city ? `home in ${facts.city}` : "home";
  return (
    `${move}, high-end real estate tour of a ${place}. ` +
    "Smooth stabilized camera motion, natural light, photorealistic, no people, no text overlays. " +
    "Keep the scene faithful to the photo — do not invent rooms or objects."
  );
}

type FalSubmit = { request_id?: string; status_url?: string; response_url?: string; detail?: string };

/** Animate one photo → a fal video URL (temporary; caller persists to Storage). */
async function animatePhoto(imageUrl: string, prompt: string): Promise<string> {
  const H = falHeaders();
  const sub = await fetch(`${FAL_QUEUE}/${MODEL}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ prompt, image_url: imageUrl, duration: "5", aspect_ratio: "9:16" }),
  });
  const q = (await sub.json().catch(() => ({}))) as FalSubmit;
  if (!sub.ok) throw new Error(`fal submit ${sub.status}: ${q.detail || JSON.stringify(q)}`);

  const statusUrl = q.status_url || `${FAL_QUEUE}/${MODEL}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${FAL_QUEUE}/${MODEL}/requests/${q.request_id}`;

  const started = Date.now();
  // Keep one clip under the 300s route ceiling (with room for download+upload).
  const TIMEOUT_MS = 240_000;
  for (;;) {
    const r = await fetch(statusUrl, { headers: H });
    const s = (await r.json().catch(() => ({}))) as { status?: string };
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error(`fal render failed: ${JSON.stringify(s)}`);
    if (Date.now() - started > TIMEOUT_MS) throw new Error("Clip render timed out.");
    await new Promise((res) => setTimeout(res, 2500));
  }

  const rr = await fetch(responseUrl, { headers: H });
  const out = (await rr.json().catch(() => ({}))) as { video?: { url?: string } };
  const url = out.video?.url;
  if (!url) throw new Error("fal returned no video URL.");
  return url;
}

/** Download a rendered clip and store it in our public bucket (durable URL). */
async function persistClip(agentId: string, listingId: string, index: number, src: string): Promise<string> {
  const media = await fetch(src);
  if (!media.ok) throw new Error(`Could not fetch rendered clip (${media.status}).`);
  const bytes = new Uint8Array(await media.arrayBuffer());
  const path = `videos/${agentId}/listing/${listingId}/clip-${index}-${crypto.randomUUID()}.mp4`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Animate ONE listing photo into a cinematic clip and APPEND it to the listing's
 * ad_clip_urls (append-safe: reads current, adds, writes). One clip per request
 * keeps each call well under the serverless timeout — the client loops over the
 * photos and shows progress. Returns the new clip URL + the full list so far.
 */
export async function generateOneListingClip(
  agentId: string,
  listingId: string,
  photoUrl: string,
  index: number,
  facts: ListingAdFacts,
  reset = false,
): Promise<{ url: string; clipUrls: string[] }> {
  const falUrl = await animatePhoto(photoUrl, motionPrompt(index, facts));
  const stored = await persistClip(agentId, listingId, index, falUrl);

  // reset (first clip of a fresh run) starts a new list; otherwise append-safe:
  // re-read the current list so earlier clips in this run aren't lost.
  let current: string[] = [];
  if (!reset) {
    const { data } = await supabaseAdmin
      .from("listings")
      .select("ad_clip_urls")
      .eq("id", listingId)
      .eq("agent_id", agentId)
      .maybeSingle();
    current = Array.isArray((data as { ad_clip_urls?: unknown } | null)?.ad_clip_urls)
      ? ((data as { ad_clip_urls: string[] }).ad_clip_urls)
      : [];
  }
  const clipUrls = [...current, stored];

  await supabaseAdmin
    .from("listings")
    .update({ ad_clip_urls: clipUrls, ad_clips_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("agent_id", agentId);

  return { url: stored, clipUrls };
}

export type ClipResult = { urls: string[]; attempted: number; failed: number };

/**
 * Animate up to MAX_CLIPS of the listing's photos into cinematic clips and
 * persist the durable URLs onto the listing. Sequential (cost + fal concurrency
 * on a fresh account). Partial success is fine — we store whatever rendered.
 */
export async function generateListingClips(
  agentId: string,
  listingId: string,
  photoUrls: string[],
  facts: ListingAdFacts,
): Promise<ClipResult> {
  const photos = photoUrls.filter((u) => /^https?:\/\//i.test(u)).slice(0, MAX_CLIPS);
  if (photos.length === 0) throw new Error("No photos to animate — pull or add listing photos first.");

  const urls: string[] = [];
  let failed = 0;
  for (let i = 0; i < photos.length; i++) {
    try {
      const falUrl = await animatePhoto(photos[i], motionPrompt(i, facts));
      urls.push(await persistClip(agentId, listingId, i, falUrl));
    } catch (e) {
      failed += 1;
      console.warn(`[adVideo] clip ${i} failed:`, e instanceof Error ? e.message : e);
    }
  }

  await supabaseAdmin
    .from("listings")
    .update({ ad_clip_urls: urls, ad_clips_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("agent_id", agentId);

  return { urls, attempted: photos.length, failed };
}
