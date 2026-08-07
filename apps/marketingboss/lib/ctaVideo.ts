import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderCtaCardPng, ctaCardDims, type CtaAspect, type CtaCardInput } from "@/lib/ctaCard";

/**
 * CTA end-card pipeline: render a branded closing frame, turn it into a short
 * clip, and append it to a marketing video. Runs entirely on FAL_KEY via the
 * ffmpeg queue (the same merge used by the listing-ad reel), so no new infra:
 *   1. render the card PNG (Brand Kit colours/logo) and store it (public URL)
 *   2. compose the image into an N-second clip (fal ffmpeg compose)
 *   3. concatenate [source video, card clip] (fal ffmpeg merge-videos)
 *   4. persist the finished video + record a `generations` row
 * Credits are reserved up front and refunded on any failure.
 */

const FAL_QUEUE = "https://queue.fal.run";
const COMPOSE_MODEL = "fal-ai/ffmpeg-api/compose";
const MERGE_MODEL = "fal-ai/ffmpeg-api/merge-videos";

export const CTA_CREDIT = 6;

export class CtaCreditError extends Error {
  constructor() {
    super(`Not enough credits — this costs ${CTA_CREDIT}.`);
    this.name = "CtaCreditError";
  }
}

function falHeaders(): Record<string, string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

/** Submit a fal ffmpeg job and poll to completion. */
async function falRun(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const H = falHeaders();
  const sub = await fetch(`${FAL_QUEUE}/${model}`, { method: "POST", headers: H, body: JSON.stringify(input) });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: string;
  };
  if (!sub.ok) throw new Error(`fal ${model} submit ${sub.status}: ${q.detail || ""}`);

  const statusUrl = q.status_url || `${FAL_QUEUE}/${model}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${FAL_QUEUE}/${model}/requests/${q.request_id}`;
  const started = Date.now();
  for (;;) {
    const r = await fetch(statusUrl, { headers: H });
    const s = (await r.json().catch(() => ({}))) as { status?: string };
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error(`fal ${model} failed.`);
    if (Date.now() - started > 260_000) throw new Error("End-card render timed out.");
    await new Promise((res) => setTimeout(res, 2500));
  }
  const rr = await fetch(responseUrl, { headers: H });
  const out = (await rr.json().catch(() => ({}))) as Record<string, unknown>;
  if (!rr.ok) throw new Error(`fal ${model} result ${rr.status}.`);
  return out;
}

function outUrl(out: Record<string, unknown>): string | null {
  const v =
    (out.video as { url?: string } | undefined)?.url ||
    (typeof out.video_url === "string" ? out.video_url : undefined) ||
    (typeof out.url === "string" ? out.url : undefined);
  return typeof v === "string" && v ? v : null;
}

/** Hold the CTA card on screen for N seconds as a video clip. */
async function imageToClip(cardUrl: string, seconds: number, aspect: CtaAspect): Promise<string> {
  const { w, h } = ctaCardDims(aspect);
  const out = await falRun(COMPOSE_MODEL, {
    output_format: "mp4",
    width: w,
    height: h,
    tracks: [
      {
        id: "cta",
        type: "image",
        keyframes: [{ timestamp: 0, duration: Math.round(seconds * 1000), url: cardUrl }],
      },
    ],
  });
  const url = outUrl(out);
  if (!url) throw new Error("CTA card clip returned no video URL.");
  return url;
}

/** Concatenate the card clip onto the end of the source video. */
async function appendClip(videoUrl: string, clipUrl: string): Promise<string> {
  const out = await falRun(MERGE_MODEL, { video_urls: [videoUrl, clipUrl] });
  const url = outUrl(out);
  if (!url) throw new Error("Merging the end card returned no video URL.");
  return url;
}

export type CtaBuild = CtaCardInput & {
  videoUrl: string;
  durationSec?: number;
};

/** Build + persist a video with a branded CTA end card appended. */
export async function buildCtaEndCard(
  supabase: SupabaseClient,
  userId: string,
  build: CtaBuild,
): Promise<{ url: string; credits: number }> {
  const aspect: CtaAspect = build.aspect ?? "16:9";
  const seconds = Math.min(Math.max(build.durationSec ?? 3, 2), 5);

  const { data: remaining, error: reserveErr } = await supabase.rpc("consume_credits", { p_cost: CTA_CREDIT });
  if (reserveErr) throw new Error("Could not check credits.");
  if (typeof remaining === "number" && remaining < 0) throw new CtaCreditError();

  try {
    // 1. render + store the card (fal needs a public URL to fetch)
    const png = await renderCtaCardPng({ ...build, aspect });
    const cardPath = `${userId}/cta/${crypto.randomUUID()}.png`;
    const { error: cardErr } = await supabase.storage
      .from("media")
      .upload(cardPath, png, { contentType: "image/png", upsert: false });
    if (cardErr) throw new Error(`Card upload failed: ${cardErr.message}`);
    const cardUrl = supabase.storage.from("media").getPublicUrl(cardPath).data.publicUrl;

    // 2. card → clip; 3. append onto the source video
    const clip = await imageToClip(cardUrl, seconds, aspect);
    const merged = await appendClip(build.videoUrl, clip);

    // 4. persist the finished video + record the generation
    const media = await fetch(merged);
    if (!media.ok) throw new Error(`Could not fetch the final video (${media.status}).`);
    const bytes = new Uint8Array(await media.arrayBuffer());
    const path = `${userId}/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, bytes, { contentType: "video/mp4", upsert: false });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
    const publicUrl = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;

    await supabase.from("generations").insert({
      user_id: userId,
      type: "video",
      prompt: `CTA end card: ${build.headline}`,
      model: "ffmpeg/cta-endcard",
      aspect,
      media_url: publicUrl,
    });

    return { url: publicUrl, credits: typeof remaining === "number" ? remaining : 0 };
  } catch (e) {
    await supabase.rpc("consume_credits", { p_cost: -CTA_CREDIT }); // best-effort refund
    throw e;
  }
}
