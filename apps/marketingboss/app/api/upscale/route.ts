import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CREDIT_COST } from "@/lib/creditCosts";
import { upscaleVideo } from "@/lib/fal";

// A 2x pass over a short clip runs in a minute or two.
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Double a source clip's resolution so it clears the swap model's 720px floor.
 *
 * Deliberately a SEPARATE request from /api/swap rather than a step chained
 * ahead of it. Both are minutes long, and running them back to back inside one
 * 300s function is exactly how the CloseBoss avatar renders used to 504 — and
 * a SIGKILL skips the refund, so the user lost the credits too. Two short
 * requests are strictly safer than one long one, and the user gets a usable
 * 720p clip back even if they never run the swap.
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

  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  if (!/^https?:\/\//.test(videoUrl))
    return NextResponse.json({ error: "Upload a source video first." }, { status: 400 });

  const cost = CREDIT_COST.upscale;

  const { data, error } = await supabase.rpc("consume_credits", { p_cost: cost });
  if (error) return NextResponse.json({ error: "Could not check credits." }, { status: 500 });
  const remaining = typeof data === "number" ? data : -1;
  if (remaining < 0)
    return NextResponse.json(
      { error: `Not enough credits — upscaling costs ${cost}. Top up to keep creating.`, credits: 0 },
      { status: 402 },
    );

  try {
    const url = await upscaleVideo(videoUrl);
    return NextResponse.json({ url, credits: remaining, cost });
  } catch (e: unknown) {
    await supabase.rpc("consume_credits", { p_cost: -cost }); // best-effort refund
    const msg = e instanceof Error ? e.message : "Upscale failed.";
    if (/balance|locked/i.test(msg))
      return NextResponse.json(
        { error: "The generation account is out of credits. Please top up fal.ai billing." },
        { status: 402 },
      );
    if (/FAL_KEY/.test(msg))
      return NextResponse.json({ error: "Server is not configured (missing FAL_KEY)." }, { status: 503 });
    if (/timed out/i.test(msg))
      return NextResponse.json(
        { error: "Upscaling took too long. Try a shorter clip — your credits were returned." },
        { status: 504 },
      );
    // Never echo the provider payload to the browser — log it, show a sentence.
    console.error("[upscale] failed:", msg);
    return NextResponse.json(
      { error: "That clip couldn't be upscaled. Your credits were returned — try a different file." },
      { status: 502 },
    );
  }
}
