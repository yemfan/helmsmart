import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/ai";
import { brandFromVideo } from "@/lib/brandFromVideo";

// Transcription measured at 3s for a 30s clip; the rest is one Claude call.
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Suggest Brand Kit fields from a video of the owner speaking.
 *
 * Returns suggestions and saves nothing. The Brand Kit is the thing every AI
 * post is written against, so overwriting it from one clip would let a single
 * off-message video quietly change the voice of everything that follows.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI isn't configured on the server." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : "";
  // Must be our own Storage — an arbitrary URL would point the transcriber at
  // anything on the internet using our key.
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/`;
  if (prefix === "/storage/" || !mediaUrl.startsWith(prefix)) {
    return NextResponse.json({ error: "Upload the video here rather than pasting a link." }, { status: 400 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await brandFromVideo(mediaUrl)) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't read that video.";
    // "Not enough speech" is the user's to fix and names the fix, so pass it on.
    if (/enough speech/i.test(msg)) return NextResponse.json({ error: msg }, { status: 422 });
    if (/FAL_KEY|ANTHROPIC_API_KEY/.test(msg))
      return NextResponse.json({ error: "Server is not configured for this yet." }, { status: 503 });
    if (/timed out/i.test(msg))
      return NextResponse.json(
        { error: "Reading that video took too long. Try a shorter clip." },
        { status: 504 },
      );
    console.error("[brand-from-video] failed:", msg);
    return NextResponse.json(
      { error: "That video couldn't be read. Try a clip where you speak clearly to camera." },
      { status: 502 },
    );
  }
}
