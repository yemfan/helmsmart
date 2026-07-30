import { NextResponse } from "next/server";

import { requireCrmFeature } from "@/lib/billing/guard";
import { generateClipCopy, planClip, transcribeClip, type ClipWord } from "@/lib/social/clipAi";
import { SOCIAL_CUSTOMIZATION_FEATURE } from "@/lib/social/customization";
import { reelConfigured, triggerBrandedClipRender } from "@/lib/social/renderReel";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Branded-clip video editor. The browser has already uploaded the raw clip to
 * the public social-images bucket (via /api/dashboard/uploads/sign, kind
 * `video_upload`) and read its duration. This kicks off the Remotion "BrandedClip"
 * render (intro → clip 9:16 → CTA outro) and stores it as a social_reels row in
 * `rendering` status — so the EXISTING reel poll/publish pipeline
 * (runReelRenderTick → scheduleReel → publishInstagramReel/FB video/LinkedIn)
 * finishes and posts it. No new orchestration needed.
 *
 * Signature/Team gated (same tier as reels + the ad composer).
 */
export const runtime = "nodejs";
// Transcription (captions / AI copy) can take a while on a 90s clip.
export const maxDuration = 120;

const CLIP_FPS = 30;
const MAX_CLIP_SECONDS = 90; // bound Lambda render cost/time

export async function POST(req: Request) {
  const gate = await requireCrmFeature(SOCIAL_CUSTOMIZATION_FEATURE);
  if (!gate.ok) return gate.response;
  const agentId = String(gate.ctx.agentId);

  if (!reelConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Video rendering isn't configured — set the REMOTION_* env vars first." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    videoPath?: unknown;
    videoDurationSeconds?: unknown;
    hook?: unknown;
    cta?: unknown;
    caption?: unknown;
    hashtags?: unknown;
    captions?: unknown;
    aiCopy?: unknown;
    silenceCut?: unknown;
  };

  const videoPath = typeof body.videoPath === "string" ? body.videoPath : "";
  if (!videoPath || !videoPath.startsWith(`videos/${agentId}/`)) {
    return NextResponse.json({ ok: false, error: "Invalid video path." }, { status: 400 });
  }
  const durationSec = Number(body.videoDurationSeconds);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return NextResponse.json({ ok: false, error: "Could not read the video length." }, { status: 400 });
  }
  const cappedDurationSec = Math.min(durationSec, MAX_CLIP_SECONDS);

  const videoUrl = supabaseServer.storage.from("social-images").getPublicUrl(videoPath).data.publicUrl;

  // Raw agent-entered copy (may be blank when AI is writing it).
  let hook = (typeof body.hook === "string" ? body.hook : "").trim();
  let cta = (typeof body.cta === "string" ? body.cta : "").trim();
  let caption = (typeof body.caption === "string" ? body.caption : "").trim();
  const hashtags = Array.isArray(body.hashtags)
    ? (body.hashtags as unknown[]).map((h) => String(h).replace(/^#/, "").trim()).filter(Boolean).slice(0, 30)
    : ["realestate", "realtor", "closebossai"];

  const wantCaptions = body.captions !== false; // default on
  const wantAiCopy = body.aiCopy === true;
  const wantSilenceCut = body.silenceCut === true;

  // AI layer — one transcript powers captions, AI copy, AND silence-cut. Each
  // fails soft (a missing key / big file just skips it).
  let words: ClipWord[] = [];
  if (wantCaptions || wantAiCopy || wantSilenceCut) {
    const tr = await transcribeClip(videoUrl);
    if (tr) {
      words = tr.words;
      if (wantAiCopy) {
        const ai = await generateClipCopy(tr.text);
        if (ai) {
          if (!hook) hook = ai.hook;
          if (!cta) cta = ai.cta;
          if (!caption) caption = ai.caption;
        }
      }
    }
  }

  hook = hook || "Watch this →";
  cta = cta || "See how it works";
  caption = caption || hook;

  // Trim + silence-cut + re-timed captions (all from the word timestamps).
  const plan = planClip(words, {
    videoDurationSec: cappedDurationSec,
    fps: CLIP_FPS,
    silenceCut: wantSilenceCut,
  });

  let render: { renderId: string; bucketName: string } | null;
  try {
    render = await triggerBrandedClipRender({
      videoUrl,
      videoDurationInFrames: plan.totalFrames,
      hook,
      cta,
      captions: wantCaptions ? plan.cues : [],
      segments: plan.segments,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Render could not be started." },
      { status: 502 },
    );
  }
  if (!render) {
    return NextResponse.json({ ok: false, error: "Render could not be started." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("social_reels")
    .insert({
      agent_id: Number(agentId),
      slides: [],
      caption,
      hashtags,
      render_id: render.renderId,
      render_bucket: render.bucketName,
      status: "rendering",
    } as never)
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reelId: (data as { id: string }).id, status: "rendering" });
}
