import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient } from "@/lib/anthropic";
import { falConfigured } from "@/lib/listings/adVideo";
import { scheduleReel } from "@/lib/social/scheduleReel";
import type { ListingAdFacts } from "@/lib/listings/types";

/**
 * Listing ad reel — Phase 2b (fal-only, no AWS/Remotion). Assembles the per-photo
 * cinematic clips into ONE finished, postable 9:16 video tour and writes the
 * social caption:
 *   1. merge the clips into a single tour (fal ffmpeg merge-videos)
 *   2. persist the tour to our public bucket (durable URL for posting)
 *   3. Claude writes the post caption from the listing facts (facts-only)
 *
 * Runs entirely on FAL_KEY — no Remotion Lambda / AWS. Burned-in lower-thirds /
 * motion-graphics branding would need Remotion (not configured); the address /
 * price / specs / CTA live in the caption that posts with the video.
 */

const FAL_QUEUE = "https://queue.fal.run";
const MERGE_MODEL = "fal-ai/ffmpeg-api/merge-videos";
const BUCKET = "social-images";

export function reelBuildConfigured(): boolean {
  return falConfigured();
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
    if (Date.now() - started > 260_000) throw new Error("Merge timed out.");
    await new Promise((res) => setTimeout(res, 2500));
  }
  const rr = await fetch(responseUrl, { headers: H });
  const out = (await rr.json().catch(() => ({}))) as { video?: { url?: string }; url?: string };
  const url = out.video?.url || out.url;
  if (!url) throw new Error("fal merge returned no video URL.");
  return url;
}

/** Download a fal video and store it in our public bucket (durable, postable). */
async function persistVideo(agentId: string, listingId: string, src: string): Promise<string> {
  const media = await fetch(src);
  if (!media.ok) throw new Error(`Could not fetch merged video (${media.status}).`);
  const bytes = new Uint8Array(await media.arrayBuffer());
  const path = `videos/${agentId}/listing/${listingId}/ad-${crypto.randomUUID()}.mp4`;
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Claude writes the social post caption from the listing facts. */
async function draftReelCaption(facts: ListingAdFacts): Promise<string> {
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

  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system:
        "You are a real-estate listing-ad copywriter. Write ONE social caption for a short vertical video tour of THIS listing. " +
        "Use ONLY the facts given — never invent price, specs, or features. 1-2 punchy sentences, a clear call to action " +
        "(e.g. 'DM to book a private tour'), then 3-5 relevant hashtags. Return ONLY the caption text.",
      messages: [
        {
          role: "user",
          content: `Listing: ${where || "a home"}\nSpecs: ${specs || "(none given)"}\nDescription: ${(facts.description ?? "").slice(0, 600)}\nHighlights: ${facts.highlights.slice(0, 6).join(", ")}`,
        },
      ],
    });
    const text = (res.content.find((b) => b.type === "text") as { text?: string } | undefined)?.text?.trim();
    if (text) return text.slice(0, 800);
  } catch {
    // fall through to a plain caption
  }
  return [where, specs].filter(Boolean).join(" — ") || "New listing";
}

async function setReel(agentId: string, listingId: string, patch: Record<string, unknown>): Promise<void> {
  await supabaseAdmin
    .from("listings")
    .update({ ...patch, ad_reel_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("agent_id", agentId);
}

/**
 * Build the finished video ad: merge the cinematic clips into one tour + write
 * the caption. Synchronous (merge is quick) — returns the ready MP4 URL.
 */
export async function buildListingReel(
  agentId: string,
  listingId: string,
  clipUrls: string[],
  facts: ListingAdFacts,
): Promise<{ status: string; url: string; caption: string }> {
  const clips = clipUrls.filter((u) => /^https?:\/\//i.test(u));
  if (clips.length === 0) throw new Error("No cinematic clips yet — generate them first.");

  await setReel(agentId, listingId, { ad_reel_status: "rendering", ad_reel_error: null });
  try {
    const merged = clips.length === 1 ? clips[0] : await mergeClips(clips);
    const url = await persistVideo(agentId, listingId, merged);
    const caption = await draftReelCaption(facts);
    await setReel(agentId, listingId, {
      ad_reel_status: "ready",
      ad_reel_url: url,
      ad_reel_caption: caption,
      ad_reel_render_id: null,
      ad_reel_render_bucket: null,
      ad_reel_error: null,
    });
    return { status: "ready", url, caption };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Build failed.";
    await setReel(agentId, listingId, { ad_reel_status: "failed", ad_reel_error: msg });
    throw e;
  }
}

/**
 * Publish the finished ad to the agent's connected FB/IG/LinkedIn accounts.
 * Reuses the whole reel publish pipeline: drop a social_reels row carrying the
 * MP4 + caption, then scheduleReel fans it out to scheduled_posts (drained by
 * the publish cron within a few minutes). Caption can be overridden by the UI.
 */
export async function publishListingReel(
  agentId: string,
  listingId: string,
  captionOverride?: string,
): Promise<{ scheduled: number; error?: string }> {
  const { data } = await supabaseAdmin
    .from("listings")
    .select("ad_reel_url, ad_reel_caption, ad_reel_status")
    .eq("id", listingId)
    .eq("agent_id", agentId)
    .maybeSingle();
  const l = data as { ad_reel_url: string | null; ad_reel_caption: string | null; ad_reel_status: string | null } | null;
  if (!l?.ad_reel_url || l.ad_reel_status !== "ready") throw new Error("Build the video ad first.");

  const caption = (captionOverride?.trim() || l.ad_reel_caption || "").slice(0, 800);
  const { data: reelRow, error } = await supabaseAdmin
    .from("social_reels")
    .insert({ agent_id: Number(agentId), slides: [], caption, hashtags: [], mp4_url: l.ad_reel_url, status: "rendered" } as never)
    .select("id")
    .single();
  if (error || !reelRow) throw new Error(error?.message ?? "Could not queue the ad for posting.");

  return scheduleReel({ agentId, reelId: (reelRow as { id: string }).id, queueStatus: "scheduled" });
}
