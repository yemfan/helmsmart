import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCtaEndCard, CtaCreditError } from "@/lib/ctaVideo";
import type { CtaAspect } from "@/lib/ctaCard";
import { anthropicJson } from "@/lib/ai";
import { BRAND_KIT_COLUMNS, type BrandKit } from "@/lib/brandKit";

// Card render + two ffmpeg passes — give the function room.
export const maxDuration = 300;
export const runtime = "nodejs";

const ASPECTS = new Set<CtaAspect>(["16:9", "9:16", "1:1", "4:3", "3:4"]);

/** Claude writes the end-card CTA from the video topic + brand voice. */
async function aiCopy(topic: string, kit: BrandKit | null): Promise<{ headline: string; subline: string }> {
  try {
    const brand = [
      kit?.brand_name ? `Brand: ${kit.brand_name}` : null,
      kit?.voice ? `Voice: ${kit.voice}` : null,
      kit?.audience ? `Audience: ${kit.audience}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const out = await anthropicJson<{ headline: string; subline: string }>({
      system:
        "You write the end-card call-to-action for a short marketing video. Return a punchy CTA headline (max 6 words) and a one-line supporting subline (max 10 words). No hashtags, no emojis, no quotes.",
      user: `Video topic: ${topic || "a marketing video"}\n${brand}`,
      schema: {
        type: "object",
        properties: { headline: { type: "string" }, subline: { type: "string" } },
        required: ["headline", "subline"],
        additionalProperties: false,
      },
      maxTokens: 200,
    });
    return { headline: (out.headline || "").slice(0, 60), subline: (out.subline || "").slice(0, 90) };
  } catch {
    return { headline: "Ready to get started?", subline: "" };
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  if (!/^https?:\/\//.test(videoUrl))
    return NextResponse.json({ error: "No source video to add a card to." }, { status: 400 });

  const aspect = (ASPECTS.has(body.aspect as CtaAspect) ? body.aspect : "16:9") as CtaAspect;
  const source = body.source === "custom" || body.source === "ai" ? body.source : "brand";
  const durationSec = Math.min(Math.max(Number(body.durationSec) || 3, 2), 5);
  const topic = typeof body.topic === "string" ? body.topic.slice(0, 300) : "";

  const { data: kitRow } = await supabase
    .from("brand_kits")
    .select(BRAND_KIT_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();
  const kit = (kitRow ?? null) as BrandKit | null;

  let headline = typeof body.headline === "string" ? body.headline.trim().slice(0, 60) : "";
  let subline = typeof body.subline === "string" ? body.subline.trim().slice(0, 90) : "";

  if (source === "ai") {
    const ai = await aiCopy(topic, kit);
    if (!headline) headline = ai.headline;
    if (!subline) subline = ai.subline;
  }
  if (!headline) headline = kit?.brand_name ? `Work with ${kit.brand_name}` : "Ready to get started?";

  try {
    const out = await buildCtaEndCard(supabase, user.id, {
      videoUrl,
      aspect,
      durationSec,
      headline,
      subline,
      brandName: kit?.brand_name ?? null,
      primaryColor: kit?.primary_color ?? null,
      accentColor: kit?.accent_color ?? null,
      logoUrl: kit?.logo_url ?? null,
    });
    return NextResponse.json({ url: out.url, credits: out.credits });
  } catch (e: unknown) {
    if (e instanceof CtaCreditError)
      return NextResponse.json({ error: `${e.message} Top up to keep creating.`, credits: 0 }, { status: 402 });
    const msg = e instanceof Error ? e.message : "Couldn't add the end card.";
    if (/balance|locked/i.test(msg))
      return NextResponse.json(
        { error: "The generation account is out of credits. Please top up fal.ai billing." },
        { status: 402 },
      );
    if (/FAL_KEY/.test(msg))
      return NextResponse.json({ error: "Server is not configured (missing FAL_KEY)." }, { status: 503 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
