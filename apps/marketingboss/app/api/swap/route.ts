import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAndStore, CreditError } from "@/lib/generation";

/**
 * A Kling O1 edit can take several minutes, and 300s was not enough.
 *
 * Seen in production 2026-08-19: a swap died on "Generation timed out" because
 * the poll ceiling was 280s to stay under a 300s function. The render was still
 * running; we simply stopped waiting for it and refunded a swap that might well
 * have finished. 800s gives it room, with the poll ceiling below that so the
 * refund still runs rather than being cut off by a SIGKILL.
 */
export const maxDuration = 800;
/** Under maxDuration, so a give-up is ours and the credits go back. */
const POLL_TIMEOUT_MS = 760_000;
export const runtime = "nodejs";

type SwapTarget = "face" | "person" | "outfit" | "product" | "background";

/**
 * Build the instruction the model follows. `@Image1` is the first reference
 * image; the user's own note (if any) is appended so they can steer details.
 */
function buildPrompt(target: SwapTarget, note: string): string {
  const base: Record<SwapTarget, string> = {
    face: "Replace the face of the main person in the video with the face from @Image1. Keep the original body, hair, motion, lighting, camera movement and background unchanged, and blend the new face naturally.",
    // Whole-person: the opposite instruction to `face`, which explicitly PRESERVES
    // body and clothing — asking for a wardrobe change under `face` fights the prompt.
    person:
      "Replace the entire person in the video with the person shown in @Image1 — their face, hair, body and clothing. Keep the original motion, gestures, camera movement, framing, lighting and background exactly as they are, and keep the new person consistent from frame to frame.",
    // Wardrobe only: same person, different clothes.
    outfit:
      "Change the clothing worn by the main person in the video to the outfit shown in @Image1. Keep their face, hair, body and motion unchanged, keep the background and lighting as they are, and let the fabric hang and move naturally with them.",
    product:
      "Replace the main product / object in the video with the item shown in @Image1. Match the original placement, scale, motion, lighting and reflections so it looks natural in the scene.",
    background:
      "Replace the background of the video with the scene shown in @Image1 while keeping the main subject, their motion and the original lighting on them intact.",
  };
  return note ? `${base[target]} ${note}` : base[target];
}

const TARGETS = new Set<SwapTarget>(["face", "person", "outfit", "product", "background"]);

/**
 * fal reports validation failures as `fal result 422: {"detail":[{msg,type,ctx}]}`.
 * Lift the human sentence out of that instead of echoing the payload: the raw
 * blob reads as a crash, and it also prints the caller's Storage URL back at
 * them. Returns null for any other shape so the caller can fall through.
 */
function falDetailMessage(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  try {
    const parsed = JSON.parse(raw.slice(start)) as {
      detail?: Array<{ msg?: string; type?: string; ctx?: Record<string, unknown> }>;
    };
    const first = parsed.detail?.[0];
    if (!first?.msg) return null;
    // The common one by far: the clip is below the model's floor. fal gives us
    // both numbers, so say which clip failed and by how much rather than
    // quoting a generic "720p+" rule the user then has to measure against.
    if (first.type === "video_too_small") {
      const min = first.ctx?.min_width;
      const found = first.ctx?.width;
      if (typeof min === "number" && typeof found === "number") {
        return `That clip is only ${found} pixels wide — swaps need at least ${min}. Re-export it at a higher resolution and try again.`;
      }
    }
    return first.msg;
  } catch {
    return null;
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
      timeoutMs: POLL_TIMEOUT_MS,
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
    // A give-up on our side, not a bad clip — say so, and say the credits came
    // back, because "try a different clip" sends people to fix the wrong thing.
    if (/timed out/i.test(msg))
      return NextResponse.json(
        {
          error:
            "That edit took longer than we waited for. Your credits were returned — try again, or use a shorter clip to speed it up.",
        },
        { status: 504 },
      );
    // Prefer fal's own structured reason — it names the actual number.
    const detail = falDetailMessage(msg);
    if (detail) return NextResponse.json({ error: detail }, { status: 422 });
    // Kling O1 rejects clips outside 3–10s / >200MB / odd resolutions — surface a hint.
    // "dimension"/"too small"/"pixel" matter: fal's video_too_small message contains
    // none of duration/resolution/size/format/invalid, so it used to fall through
    // to the raw-message branch below and print the whole JSON payload on screen.
    if (/duration|resolution|dimension|too small|pixel|size|format|invalid/i.test(msg))
      return NextResponse.json(
        { error: "That clip couldn't be edited. Use a 3–10s video, at least 720 pixels wide and under 200MB." },
        { status: 422 },
      );
    // Never echo the provider payload to the browser — log it, show a sentence.
    console.error("[swap] unhandled generation failure:", msg);
    return NextResponse.json(
      { error: "The swap couldn't be completed. Try a different clip, or try again in a moment." },
      { status: 500 },
    );
  }
}
