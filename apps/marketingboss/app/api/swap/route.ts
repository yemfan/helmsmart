import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAndStore, CreditError } from "@/lib/generation";

// A Kling O1 edit can take a couple of minutes — give the function room.
export const maxDuration = 300;
export const runtime = "nodejs";

type SwapTarget = "face" | "product" | "background";

/**
 * Build the instruction the model follows. `@Image1` is the first reference
 * image; the user's own note (if any) is appended so they can steer details.
 */
function buildPrompt(target: SwapTarget, note: string): string {
  const base: Record<SwapTarget, string> = {
    face: "Replace the face of the main person in the video with the face from @Image1. Keep the original body, hair, motion, lighting, camera movement and background unchanged, and blend the new face naturally.",
    product:
      "Replace the main product / object in the video with the item shown in @Image1. Match the original placement, scale, motion, lighting and reflections so it looks natural in the scene.",
    background:
      "Replace the background of the video with the scene shown in @Image1 while keeping the main subject, their motion and the original lighting on them intact.",
  };
  return note ? `${base[target]} ${note}` : base[target];
}

const TARGETS = new Set<SwapTarget>(["face", "product", "background"]);

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
  const refUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const target = (TARGETS.has(body.target as SwapTarget) ? body.target : "face") as SwapTarget;
  const note = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1000) : "";
  const keepAudio = body.keepAudio !== false;

  if (!/^https?:\/\//.test(videoUrl))
    return NextResponse.json({ error: "Add a source video — upload a clip or paste a direct video URL." }, { status: 400 });
  if (!/^https?:\/\//.test(refUrl))
    return NextResponse.json({ error: "Add a reference image to swap in." }, { status: 400 });

  try {
    const out = await generateAndStore(supabase, user.id, {
      type: "video",
      prompt: buildPrompt(target, note),
      aspect: "16:9",
      videoUrl,
      imageUrls: [refUrl],
      keepAudio,
    });
    return NextResponse.json({ urls: out.urls, model: out.model, credits: out.credits });
  } catch (e: unknown) {
    if (e instanceof CreditError) {
      return NextResponse.json({ error: `${e.message} Top up to keep creating.`, credits: 0 }, { status: 402 });
    }
    const msg = e instanceof Error ? e.message : "Swap failed.";
    if (/balance|locked/i.test(msg))
      return NextResponse.json(
        { error: "The generation account is out of credits. Please top up fal.ai billing." },
        { status: 402 },
      );
    if (/FAL_KEY/.test(msg))
      return NextResponse.json({ error: "Server is not configured (missing FAL_KEY)." }, { status: 503 });
    // Kling O1 rejects clips outside 3–10s / >200MB / odd resolutions — surface a hint.
    if (/duration|resolution|size|format|invalid/i.test(msg))
      return NextResponse.json(
        { error: "That clip couldn't be edited. Use a 3–10s video, 720p+ and under 200MB." },
        { status: 422 },
      );
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
