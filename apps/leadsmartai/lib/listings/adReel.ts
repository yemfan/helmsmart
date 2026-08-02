import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient } from "@/lib/anthropic";
import { falConfigured } from "@/lib/listings/adVideo";
import { reelConfigured, triggerBrandedClipRender, getReelRenderStatus } from "@/lib/social/renderReel";
import type { ListingAdFacts } from "@/lib/listings/types";

/**
 * Listing ad reel — Phase 2b. Assembles the cinematic clips into ONE finished,
 * branded, captioned 9:16 video ad:
 *   1. merge the per-photo clips into a single tour (fal ffmpeg merge-videos)
 *   2. persist the merged tour to our public bucket (durable, render-reachable)
 *   3. Claude writes the hook / CTA / post caption from the listing facts
 *   4. wrap the tour in the already-deployed Remotion BrandedClip composition
 *      (branded intro/outro + captions) via Remotion Lambda
 *   5. poll the render → store the final MP4 on the listing
 *
 * Reuses the deployed BrandedClip composition, so NO Remotion site redeploy is
 * needed. Gated on FAL_KEY (merge) + the Remotion Lambda env (reelConfigured()).
 */

const FAL_QUEUE = "https://queue.fal.run";
const MERGE_MODEL = "fal-ai/ffmpeg-api/merge-videos";
const BUCKET = "social-images";
const CLIP_SECONDS = 5;
const FPS = 30;

export function reelBuildConfigured(): boolean {
  return falConfigured() && reelConfigured();
}

function falHeaders(): Record<string, string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

/** Merge N clip URLs into one video via fal ffmpeg; returns the fal output URL. */
async function mergeClips(clipUrls: string[]): Promise<string> {
  const H = falHeaders();
  const sub = await fetch(`${FAL_QUEUE}/${MERGE_MODEL}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ video_urls: clipUrls }),
  });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: string;
  };
  if (!sub.ok) throw new Error(`fal merge submit ${sub.status}: ${q.detail || ""}`);

  const statusUrl = q.status_url || `${FAL_QUEUE}/${MERGE_MODEL}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${FAL_QUEUE}/${MERGE_MODEL}/requests/${q.request_id}`;
  const started = Date.now();
  for (;;) {
    const r = await fetch(statusUrl, { headers: H });
    const s = (await r.json().catch(() => ({}))) as { status?: string };
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error("fal merge failed.");
    if (Date.now() - started > 200_000) throw new Error("Merge timed out.");
    await new Promise((res) => setTimeout(res, 2500));
  }
  const rr = await fetch(responseUrl, { headers: H });
  const out = (await rr.json().catch(() => ({}))) as { video?: { url?: string }; url?: string };
  const url = out.video?.url || out.url;
  if (!url) throw new Error("fal merge returned no video URL.");
  return url;
}

/** Download a fal video and store it in our public bucket (durable, render-safe). */
async function persistVideo(agentId: string, listingId: string, src: string): Promise<string> {
  const media = await fetch(src);
  if (!media.ok) throw new Error(`Could not fetch merged video (${media.status}).`);
  const bytes = new Uint8Array(await media.arrayBuffer());
  const path = `videos/${agentId}/listing/${listingId}/tour-${crypto.randomUUID()}.mp4`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export type ReelCopy = { hook: string; cta: string; caption: string };

/** Claude writes the reel's on-screen hook, CTA, and the social post caption. */
async function draftReelCopy(facts: ListingAdFacts): Promise<ReelCopy> {
  const client = getAnthropicClient();
  const specs = [
    facts.beds != null ? `${facts.beds} bed` : null,
    facts.baths != null ? `${facts.baths} bath` : null,
    facts.sqft != null ? `${facts.sqft.toLocaleString()} sqft` : null,
    facts.price != null ? `$${Number(facts.price).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const where = [facts.address, facts.city, facts.state].filter(Boolean).join(", ");

  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system:
      "You are a real-estate listing-ad copywriter. Write for a short vertical video tour of THIS listing. " +
      "Use ONLY the facts given — never invent price, specs, or features. Return ONLY JSON: " +
      '{"hook": string (<=6 words, on-screen opener), "cta": string (<=5 words, e.g. "Book a private tour"), ' +
      '"caption": string (the social post caption, 1-2 sentences + 3-5 hashtags)}',
    messages: [
      {
        role: "user",
        content: `Listing: ${where || "a home"}\nSpecs: ${specs || "(none given)"}\nDescription: ${(facts.description ?? "").slice(0, 600)}\nHighlights: ${facts.highlights.slice(0, 6).join(", ")}`,
      },
    ],
  });
  const text = (res.content.find((b) => b.type === "text") as { text?: string } | undefined)?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const p = JSON.parse(m ? m[0] : text) as Partial<ReelCopy>;
    return {
      hook: (p.hook || "Just listed").toString().slice(0, 60),
      cta: (p.cta || "Book a tour").toString().slice(0, 40),
      caption: (p.caption || `${where}`).toString().slice(0, 600),
    };
  } catch {
    return { hook: "Just listed", cta: "Book a tour", caption: where || "New listing" };
  }
}

async function setReel(agentId: string, listingId: string, patch: Record<string, unknown>): Promise<void> {
  await supabaseAdmin
    .from("listings")
    .update({ ...patch, ad_reel_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("agent_id", agentId);
}

/**
 * Kick off a reel build: merge clips → persist → copy → trigger the branded
 * render. Returns quickly with status 'rendering'; poll with pollListingReel.
 */
export async function buildListingReel(
  agentId: string,
  listingId: string,
  clipUrls: string[],
  facts: ListingAdFacts,
): Promise<{ status: string; caption: string }> {
  const clips = clipUrls.filter((u) => /^https?:\/\//i.test(u));
  if (clips.length === 0) throw new Error("No cinematic clips yet — generate them first.");

  const merged = clips.length === 1 ? clips[0] : await mergeClips(clips);
  const tourUrl = await persistVideo(agentId, listingId, merged);
  const copy = await draftReelCopy(facts);

  const durationFrames = clips.length * CLIP_SECONDS * FPS;
  const render = await triggerBrandedClipRender({
    videoUrl: tourUrl,
    videoDurationInFrames: durationFrames,
    hook: copy.hook,
    cta: copy.cta,
  });
  if (!render) throw new Error("Video rendering isn't configured (missing REMOTION_* env).");

  await setReel(agentId, listingId, {
    ad_reel_status: "rendering",
    ad_reel_render_id: render.renderId,
    ad_reel_render_bucket: render.bucketName,
    ad_reel_caption: copy.caption,
    ad_reel_url: null,
    ad_reel_error: null,
  });
  return { status: "rendering", caption: copy.caption };
}

/** Poll the in-flight render; on completion, store the final MP4 on the listing. */
export async function pollListingReel(
  agentId: string,
  listingId: string,
  renderId: string,
  bucket: string,
): Promise<{ status: string; url?: string; progress: number; error?: string }> {
  const st = await getReelRenderStatus(renderId, bucket);
  if (!st.done) return { status: "rendering", progress: st.progress };
  if ("error" in st) {
    await setReel(agentId, listingId, { ad_reel_status: "failed", ad_reel_error: st.error });
    return { status: "failed", progress: st.progress, error: st.error };
  }
  await setReel(agentId, listingId, { ad_reel_status: "ready", ad_reel_url: st.url, ad_reel_error: null });
  return { status: "ready", url: st.url, progress: 1 };
}
