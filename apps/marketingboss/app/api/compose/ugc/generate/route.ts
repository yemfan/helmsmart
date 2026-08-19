import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAndStore, CreditError } from "@/lib/generation";
import { DEFAULT_MODELS } from "@/lib/fal";

/**
 * Seedance is slow, and 300s was not enough once 30s clips became possible.
 *
 * Measured against the live model on 2026-08-19:
 *   20s @ 480p -> 198s
 *   30s @ 720p -> 298s   (the old ceiling was 300)
 *
 * A Vercel timeout is a SIGKILL, which skips the refund in generateAndStore —
 * so a clip finishing at 301s would have cost the user 35 credits and returned
 * nothing. 800s leaves room for a slow 30s render at 1080p.
 */
export const maxDuration = 800;
export const runtime = "nodejs";

const ASPECTS = new Set(["9:16", "16:9", "1:1", "4:3", "3:4"]);
const RESOLUTIONS = new Set(["480p", "720p", "1080p"]);
/** Seedance 2.5 generates 4-30s natively — the whole point of the 2.0 upgrade. */
const MIN_UGC_SECONDS = 4;
const MAX_UGC_SECONDS = 30;

/**
 * Generate a UGC ad clip on Seedance (9:16, native audio), optionally guided by
 * references.
 *
 * Length is the caller's choice up to 30s. A normal UGC ad runs 15-30s, which
 * the previous model (2.0, 15s cap) could only reach by generating two clips
 * and merging them — and a seam mid-sentence is where a talking-head ad stops
 * looking real.
 */
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

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const aspect = typeof body.aspect === "string" && ASPECTS.has(body.aspect) ? body.aspect : "9:16";
  if (!prompt) return NextResponse.json({ error: "A prompt is required." }, { status: 400 });

  // References must live in OUR Storage (SSRF guard); cap counts to Seedance limits.
  const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/`;
  const clean = (arr: unknown, max: number): string[] =>
    (Array.isArray(arr) ? arr : [])
      .filter((u): u is string => typeof u === "string" && storagePrefix !== "/storage/" && u.startsWith(storagePrefix))
      .slice(0, max);
  const imageUrls = clean(body.imageUrls, 30);
  const videoUrls = clean(body.videoUrls, 10);

  const asked = typeof body.duration === "number" ? Math.round(body.duration) : null;
  const duration =
    asked === null ? undefined : Math.min(Math.max(asked, MIN_UGC_SECONDS), MAX_UGC_SECONDS);
  const resolution =
    typeof body.resolution === "string" && RESOLUTIONS.has(body.resolution)
      ? body.resolution
      : "720p";

  try {
    const out = await generateAndStore(supabase, user.id, {
      type: "video",
      prompt,
      aspect,
      model: DEFAULT_MODELS.ugcText,
      imageUrls: imageUrls.length ? imageUrls : undefined,
      videoUrls: videoUrls.length ? videoUrls : undefined,
      duration,
      resolution,
    });
    return NextResponse.json({ url: out.urls[0], credits: out.credits });
  } catch (e) {
    if (e instanceof CreditError) return NextResponse.json({ error: `${e.message} Top up to keep creating.`, credits: 0 }, { status: 402 });
    const msg = e instanceof Error ? e.message : "Generation failed.";
    if (/balance|locked/i.test(msg))
      return NextResponse.json({ error: "The generation account is out of credits. Top up fal.ai billing." }, { status: 402 });
    if (/FAL_KEY/.test(msg)) return NextResponse.json({ error: "Server is not configured (missing FAL_KEY)." }, { status: 503 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
