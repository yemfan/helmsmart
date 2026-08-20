import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  cloneVoice,
  MAX_SAMPLE_BYTES,
  MIN_SAMPLE_BYTES,
  voiceCloningConfigured,
} from "@/lib/voiceClone";

// Cloning is one upload plus one ElevenLabs call — quick, but the sample can be
// a video, so allow for the fetch.
export const maxDuration = 120;
export const runtime = "nodejs";

/**
 * Clone a voice from a recording the user uploaded.
 *
 * A voice is a likeness, so this is gated the same way a character photo is:
 * the caller has to say whose voice it is and that they agreed. A cloned voice
 * can be made to say anything, which is precisely why the permission cannot be
 * assumed from the fact that someone had the file.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  if (!voiceCloningConfigured()) {
    return NextResponse.json(
      { error: "Voice cloning isn't switched on yet (missing ELEVENLABS_API_KEY)." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sampleUrl = typeof body.sampleUrl === "string" ? body.sampleUrl.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const consent = typeof body.consentNote === "string" ? body.consentNote.trim() : "";

  // The sample must be in our Storage — an arbitrary URL would let a caller
  // clone a voice from anything on the internet using our key.
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/`;
  if (prefix === "/storage/" || !sampleUrl.startsWith(prefix)) {
    return NextResponse.json({ error: "Upload the recording here rather than pasting a link." }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "Give the voice a name." }, { status: 400 });
  if (consent.length < 10) {
    return NextResponse.json(
      { error: "Say whose voice this is and how they agreed to it being cloned." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(sampleUrl);
    if (!res.ok) throw new Error(`Could not read that recording (${res.status}).`);
    const bytes = new Uint8Array(await res.arrayBuffer());

    // Checked here rather than only in the browser: a too-short sample clones
    // badly and still consumes a voice slot on the account.
    if (bytes.byteLength < MIN_SAMPLE_BYTES) {
      return NextResponse.json(
        { error: "That recording is too short to clone from. Aim for at least 30 seconds of clear speech." },
        { status: 400 },
      );
    }
    if (bytes.byteLength > MAX_SAMPLE_BYTES) {
      return NextResponse.json(
        { error: "That recording is too large. A minute or two of speech is plenty." },
        { status: 400 },
      );
    }

    const voiceId = await cloneVoice({
      name,
      bytes,
      filename: sampleUrl.split("/").pop() || "sample.mp3",
      mimeType: res.headers.get("content-type") || "audio/mpeg",
    });
    return NextResponse.json({ ok: true, voiceId, name });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Voice cloning failed.";
    if (/ELEVENLABS_API_KEY/.test(msg))
      return NextResponse.json({ error: "Voice cloning isn't configured on the server." }, { status: 503 });
    // cloneVoice already translates the provider's own failures into sentences
    // worth showing; anything else is ours and gets logged instead.
    if (/plan|slots|voice_limit|Upgrade/i.test(msg)) return NextResponse.json({ error: msg }, { status: 402 });
    console.error("[voice-clone] failed:", msg);
    return NextResponse.json(
      { error: "That recording couldn't be cloned. Try a clearer sample of one person speaking." },
      { status: 502 },
    );
  }
}
