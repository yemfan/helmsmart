import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  addVoiceover,
  listVoices,
  MAX_SCRIPT_CHARS,
  VOICEOVER_CREDIT,
  VoiceoverCreditError,
  voiceProvider,
} from "@/lib/voiceover";

// TTS is quick; the mux is an ffmpeg pass. Measured at ~13s end to end.
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * Which voices this account can use.
 *
 * Served rather than hardcoded in the client: the list comes from the
 * ElevenLabs account, so a cloned voice appears without a deploy, and the
 * browser never needs the key to find out.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  return NextResponse.json({ provider: voiceProvider(), voices: await listVoices() });
}

/**
 * Narrate a silent clip.
 *
 * Its own request rather than a step inside generation, for the same reason
 * /api/upscale is: each stage is independently slow, and chaining them in one
 * function is how renders start dying at the ceiling. It also means a clip the
 * user already has — from the gallery, or generated an hour ago — can be
 * narrated without regenerating it.
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
  const script = typeof body.script === "string" ? body.script.trim() : "";
  const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";

  // The clip must be one of ours. An arbitrary URL would point our renderer at
  // anything on the internet using our key.
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/`;
  if (prefix === "/storage/" || !videoUrl.startsWith(prefix)) {
    return NextResponse.json({ error: "Narration works on clips made here." }, { status: 400 });
  }
  if (!script) return NextResponse.json({ error: "Write what the voice should say." }, { status: 400 });
  if (script.length > MAX_SCRIPT_CHARS) {
    return NextResponse.json(
      { error: `Keep the narration under ${MAX_SCRIPT_CHARS} characters.` },
      { status: 400 },
    );
  }

  try {
    const out = await addVoiceover(supabase, user.id, videoUrl, script, voiceId);
    return NextResponse.json({ url: out.url, credits: out.credits, cost: VOICEOVER_CREDIT });
  } catch (e) {
    if (e instanceof VoiceoverCreditError) {
      return NextResponse.json({ error: `${e.message} Top up to keep creating.`, credits: 0 }, { status: 402 });
    }
    const msg = e instanceof Error ? e.message : "Narration failed.";
    if (/balance|locked/i.test(msg))
      return NextResponse.json(
        { error: "The generation account is out of credits. Please top up fal.ai billing." },
        { status: 402 },
      );
    if (/FAL_KEY/.test(msg))
      return NextResponse.json({ error: "Server is not configured (missing FAL_KEY)." }, { status: 503 });
    // ElevenLabs rejects an unusable voice id or an exhausted quota — say which,
    // because "try again" is wrong advice for both.
    if (/Voice synth failed \(401|Voice synth failed \(403/.test(msg))
      return NextResponse.json(
        { error: "The voice service rejected our key. Your credits were returned." },
        { status: 502 },
      );
    if (/Voice synth failed \(422|Voice synth failed \(404/.test(msg))
      return NextResponse.json(
        { error: "That voice isn't available on this account. Pick another and try again." },
        { status: 422 },
      );
    if (/timed out/i.test(msg))
      return NextResponse.json(
        { error: "Narration took too long. Your credits were returned — try a shorter script." },
        { status: 504 },
      );
    if (/length/i.test(msg))
      return NextResponse.json(
        { error: "Couldn't read that clip's length, so it wasn't narrated. Your credits were returned." },
        { status: 422 },
      );
    // Never echo the provider payload — log it, show a sentence.
    console.error("[voiceover] failed:", msg);
    return NextResponse.json(
      { error: "That clip couldn't be narrated. Your credits were returned — try again in a moment." },
      { status: 502 },
    );
  }
}
