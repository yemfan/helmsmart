import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAndStore, CreditError } from "@/lib/generation";
import { DEFAULT_MODELS } from "@/lib/fal";

// Seedance video generation can take a couple minutes.
export const maxDuration = 300;
export const runtime = "nodejs";

const ASPECTS = new Set(["9:16", "16:9", "1:1", "4:3", "3:4"]);

/** Generate a UGC ad clip on Seedance (9:16, native audio), optionally guided by references. */
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
  const imageUrls = clean(body.imageUrls, 9);
  const videoUrls = clean(body.videoUrls, 3);

  try {
    const out = await generateAndStore(supabase, user.id, {
      type: "video",
      prompt,
      aspect,
      model: DEFAULT_MODELS.ugcText,
      imageUrls: imageUrls.length ? imageUrls : undefined,
      videoUrls: videoUrls.length ? videoUrls : undefined,
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
