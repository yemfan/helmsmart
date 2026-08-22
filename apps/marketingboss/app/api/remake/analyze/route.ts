import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/ai";
import { analyzeAd, type ReferenceFrame } from "@/lib/adBlueprint";

// One Wizper transcription (3s on a 30s clip) plus one Claude call over ~10
// stills, which measured 28-32s. 300 leaves room for a longer reference.
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Read a reference ad's structure so it can be re-shot with the user's twin.
 *
 * Frames arrive already sampled and cut-detected by the browser (see
 * lib/trimClient) rather than being cut here: fal's ffmpeg-api cannot seek, and
 * bundling a real ffmpeg into a serverless function is far too heavy — the same
 * conclusion the trim path reached.
 *
 * Returns a blueprint and stores nothing. It is a reading of someone else's ad;
 * what the user does with it is the next step, and theirs to approve.
 */

/** Sixteen 360px JPEGs is ~1MB of base64 — well inside the ~4.5MB body cap. */
const MAX_FRAMES = 16;

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

  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
  // Must be our own Storage — an arbitrary URL would point the transcriber at
  // anything on the internet using our key.
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/`;
  if (prefix === "/storage/" || !videoUrl.startsWith(prefix)) {
    return NextResponse.json(
      { error: "Upload the reference video here rather than pasting a link." },
      { status: 400 },
    );
  }

  const durationSec = typeof body.durationSec === "number" ? body.durationSec : 0;
  if (!(durationSec > 0)) {
    return NextResponse.json({ error: "That clip's length couldn't be read." }, { status: 400 });
  }

  const rawFrames = Array.isArray(body.frames) ? body.frames : [];
  const frames: ReferenceFrame[] = rawFrames
    .slice(0, MAX_FRAMES)
    .map((f) => f as Record<string, unknown>)
    .filter((f) => typeof f.base64 === "string" && f.base64 && typeof f.atSec === "number")
    .map((f) => ({
      atSec: f.atSec as number,
      base64: f.base64 as string,
      mediaType: typeof f.mediaType === "string" ? f.mediaType : "image/jpeg",
    }));
  if (frames.length < 4) {
    return NextResponse.json(
      { error: "Not enough frames were sampled from that clip to read its shots." },
      { status: 400 },
    );
  }

  const cuts = Array.isArray(body.cuts)
    ? body.cuts.filter((c): c is number => typeof c === "number" && c > 0 && c < durationSec)
    : undefined;

  try {
    const blueprint = await analyzeAd({ videoUrl, frames, durationSec, cuts });
    return NextResponse.json({ ok: true, blueprint });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (/ANTHROPIC_API_KEY/.test(msg)) {
      return NextResponse.json({ error: "AI isn't configured on the server." }, { status: 503 });
    }
    console.error("[remake/analyze] failed:", msg);
    return NextResponse.json(
      { error: msg || "That reference couldn't be read. Try a different clip." },
      { status: 500 },
    );
  }
}
