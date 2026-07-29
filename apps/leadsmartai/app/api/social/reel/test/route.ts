import { NextResponse } from "next/server";
import { z } from "zod";

import { getDashboardAgentContext } from "@/lib/contact-intake/dashboardAgentContext";
import { publishPost, type PublishPlatform } from "@/lib/leads-gen/publish";
import { carouselClaimViolation, generateCarouselBatch } from "@/lib/social/generateCarousel";
import { getReel, markReelRendered, markReelRendering, markReelStatus, persistReelDrafts } from "@/lib/social/reels";
import { getReelRenderStatus, reelConfigured, triggerReelRender, type ReelSlide } from "@/lib/social/renderReel";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Manual reel smoke-test — renders + posts ONE reel on demand, bypassing the
 * weekly-generate → render-tick → publish-scheduled cron chain. Use it the
 * moment the REMOTION_* env is set (and a FB/IG/LinkedIn account is connected)
 * to verify the whole video path end to end.
 *
 * Two steps (rendering is async on Lambda, ~1-2 min):
 *   POST /api/social/reel/test           { slides?, caption?, hashtags? }
 *     → creates a reel, kicks off the Lambda render, returns { reelId, renderId }.
 *   GET  /api/social/reel/test?reelId=…&publish=1&platforms=facebook,instagram,linkedin
 *     → polls the render; when done, publishes NOW to each requested connected
 *       platform (default: all connected). Poll until status !== "rendering".
 *
 * Auth: the dashboard agent context (same as the carousel manual-publish route).
 */
export const runtime = "nodejs";
// Publish step is several sequential platform calls (+ IG container polls).
export const maxDuration = 60;

const SAMPLE_SLIDES: ReelSlide[] = [
  { heading: "Hire an AI real estate team", body: "And enjoy your life." },
  { heading: "Answers every call", body: "Your AI receptionist never misses a lead." },
  { heading: "Follows up for you", body: "Texts, emails, and books — around the clock." },
  { heading: "CloseBoss", body: "closebossai.com" },
];

const postSchema = z.object({
  /** true = generate a fresh AI brand reel; false/omitted with no slides = sample. */
  generate: z.boolean().optional(),
  slides: z
    .array(z.object({ heading: z.string(), body: z.string() }))
    .min(1)
    .max(8)
    .optional(),
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string()).max(30).optional(),
});

const ALL_PLATFORMS: PublishPlatform[] = ["facebook", "instagram", "linkedin"];
const DEFAULT_HASHTAGS = ["realestate", "realtor", "aiforrealestate", "closebossai"];

/** Connected, video-capable posting targets for an agent → [{platform, connectionId}]. */
async function resolveTargets(
  agentId: string,
  wanted: PublishPlatform[],
): Promise<{ platform: PublishPlatform; connectionId: string }[]> {
  const { data } = await supabaseAdmin
    .from("social_accounts")
    .select("id, platform, fb_page_id, ig_business_user_id, linkedin_member_urn, status")
    .eq("agent_id", agentId)
    .in("platform", ["meta", "linkedin"])
    .eq("status", "connected");
  const accounts = (data as
    | { id: string; platform: string; fb_page_id: string | null; ig_business_user_id: string | null; linkedin_member_urn: string | null }[]
    | null) ?? [];
  const targets: { platform: PublishPlatform; connectionId: string }[] = [];
  for (const a of accounts) {
    if (a.platform === "meta") {
      if (a.fb_page_id && wanted.includes("facebook")) targets.push({ platform: "facebook", connectionId: a.id });
      if (a.ig_business_user_id && wanted.includes("instagram")) targets.push({ platform: "instagram", connectionId: a.id });
    } else if (a.platform === "linkedin") {
      if (a.linkedin_member_urn && wanted.includes("linkedin")) targets.push({ platform: "linkedin", connectionId: a.id });
    }
  }
  return targets;
}

export async function POST(req: Request) {
  const auth = await getDashboardAgentContext();
  if (auth.ok === false) return auth.response;
  const agentId = auth.agentId;

  if (!reelConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Reel rendering is not configured — set the REMOTION_* env vars in Vercel first." },
      { status: 503 },
    );
  }

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  let slides: ReelSlide[] = parsed.data.slides?.length ? parsed.data.slides : SAMPLE_SLIDES;
  let caption = parsed.data.caption ?? "Meet your AI real estate team. 🏡 closebossai.com";
  let hashtags = parsed.data.hashtags ?? DEFAULT_HASHTAGS;

  // AI-generated brand reel: reuse the brand carousel generator (its slides are
  // {heading, body}, exactly a reel's), claim-screened. Falls back to the sample.
  if (parsed.data.generate && !parsed.data.slides?.length) {
    try {
      const batch = await generateCarouselBatch(1);
      const clean = batch.filter((d) => !carouselClaimViolation(d));
      if (clean[0]?.slides?.length) {
        slides = clean[0].slides;
        caption = clean[0].caption || caption;
        hashtags = clean[0].hashtags?.length ? clean[0].hashtags : hashtags;
      }
    } catch (e) {
      console.warn("[reel/test] generate failed, using sample:", e instanceof Error ? e.message : e);
    }
  }

  const [reelId] = await persistReelDrafts(Number(agentId), [{ slides, caption, hashtags }]);
  if (!reelId) {
    return NextResponse.json({ ok: false, error: "Could not create the reel draft." }, { status: 500 });
  }

  try {
    const res = await triggerReelRender(slides);
    if (!res) {
      await markReelStatus(reelId, "failed", "Render env not configured.");
      return NextResponse.json({ ok: false, error: "Render could not be triggered." }, { status: 503 });
    }
    await markReelRendering(reelId, res.renderId, res.bucketName);
    return NextResponse.json({
      ok: true,
      reelId,
      renderId: res.renderId,
      bucket: res.bucketName,
      status: "rendering",
      next: `GET /api/social/reel/test?reelId=${reelId}&publish=1`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Render trigger failed.";
    await markReelStatus(reelId, "failed", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

export async function GET(req: Request) {
  const auth = await getDashboardAgentContext();
  if (auth.ok === false) return auth.response;
  const agentId = auth.agentId;

  const url = new URL(req.url);

  // Lightweight action: which video-capable platforms is this agent connected to?
  // Drives the panel's platform checkboxes — no reelId needed.
  if (url.searchParams.get("targets") === "1") {
    const targets = await resolveTargets(agentId, ALL_PLATFORMS);
    return NextResponse.json({ ok: true, platforms: targets.map((t) => t.platform) });
  }

  const reelId = url.searchParams.get("reelId");
  if (!reelId) {
    return NextResponse.json({ ok: false, error: "reelId query param is required." }, { status: 400 });
  }
  const doPublish = url.searchParams.get("publish") === "1";
  const platformsParam = url.searchParams.get("platforms");
  const wanted = platformsParam
    ? (platformsParam.split(",").map((p) => p.trim()).filter((p) => ALL_PLATFORMS.includes(p as PublishPlatform)) as PublishPlatform[])
    : ALL_PLATFORMS;

  const reel = await getReel(reelId);
  if (!reel) {
    return NextResponse.json({ ok: false, error: "Reel not found." }, { status: 404 });
  }

  // Resolve the MP4 — either already rendered, or poll the in-flight render.
  let mp4Url = reel.mp4_url;
  if (!mp4Url) {
    if (!reel.render_id || !reel.render_bucket) {
      return NextResponse.json(
        { ok: false, error: "Reel has no render in flight. POST first to start one." },
        { status: 409 },
      );
    }
    const status = await getReelRenderStatus(reel.render_id, reel.render_bucket);
    if (!status.done) {
      return NextResponse.json({ ok: true, reelId, status: "rendering", progress: status.progress });
    }
    if ("error" in status) {
      await markReelStatus(reelId, "failed", status.error);
      return NextResponse.json({ ok: false, status: "failed", error: status.error }, { status: 502 });
    }
    mp4Url = status.url;
    await markReelRendered(reelId, mp4Url);
  }

  if (!doPublish) {
    return NextResponse.json({ ok: true, reelId, status: "rendered", mp4Url });
  }

  // Map each connected, video-capable account to its platform + connection id.
  const targets = await resolveTargets(agentId, wanted);

  if (targets.length === 0) {
    return NextResponse.json(
      { ok: false, reelId, mp4Url, error: "No connected video-capable accounts (Facebook, Instagram, or LinkedIn)." },
      { status: 404 },
    );
  }

  const caption = [reel.caption?.trim(), (reel.hashtags ?? []).map((h) => `#${String(h).replace(/^#/, "")}`).join(" ")]
    .filter(Boolean)
    .join("\n\n");

  const published = [];
  for (const t of targets) {
    const result = await publishPost({
      agentId,
      platform: t.platform,
      connectionId: t.connectionId,
      caption,
      hashtags: reel.hashtags ?? [],
      imageUrl: mp4Url,
      mediaKind: "video",
      trigger: "manual_reel_test",
      subjectKind: "social_reel",
      subjectRefId: reelId,
    });
    published.push(
      result.ok
        ? { platform: t.platform, ok: true, url: result.externalPostUrl }
        : { platform: t.platform, ok: false, error: result.error },
    );
  }

  if (published.some((p) => p.ok)) {
    await markReelStatus(reelId, "posted");
  }

  return NextResponse.json({ ok: true, reelId, mp4Url, published });
}
