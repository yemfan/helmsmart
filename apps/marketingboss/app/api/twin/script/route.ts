import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/ai";
import { getTwin } from "@/lib/digitalTwin";
import { BRAND_KIT_COLUMNS, type BrandKit } from "@/lib/brandKit";
import { scriptFromVideo } from "@/lib/scriptFromVideo";

// Transcription measured at 3s for a 30s clip; the rest is one Claude call.
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Draft what the twin should say, from the user's own intro video.
 *
 * Returns the script and saves nothing. It is the sentence they are about to
 * appear on camera saying, so it belongs in the box for editing rather than
 * written straight onto the twin.
 *
 * The video is read from the twin row rather than the request body: it is
 * already known to be theirs, and taking a URL here would point the
 * transcriber at anything on the internet using our key.
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

  let topic = "";
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.topic === "string") topic = body.topic.trim().slice(0, 300);
  } catch {
    // No body is fine - it means "a general introduction".
  }

  const twin = await getTwin(supabase, user.id).catch(() => null);
  const mediaUrl = twin?.intro_video_url?.trim() || "";
  if (!mediaUrl) {
    return NextResponse.json(
      { error: "Upload a video of yourself talking first — that's what this writes from." },
      { status: 400 },
    );
  }

  // Optional colour. A user who has not filled in a Brand Kit still has a
  // transcript, which is the part that actually matters here.
  let brand: BrandKit | null = null;
  try {
    const { data } = await supabase
      .from("brand_kits")
      .select(BRAND_KIT_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle();
    brand = data as BrandKit | null;
  } catch {
    /* no brand kit - proceed from the transcript alone */
  }

  try {
    const out = await scriptFromVideo(mediaUrl, {
      brandName: brand?.brand_name ?? undefined,
      voice: brand?.voice ?? undefined,
      topic,
    });
    return NextResponse.json({ ok: true, ...out });
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
    console.error("[twin-script] failed:", msg);
    return NextResponse.json(
      { error: "That video couldn't be read. Try a clip where you speak clearly to camera." },
      { status: 502 },
    );
  }
}
