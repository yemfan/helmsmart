import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Narrate a silent clip: text -> speech -> muxed onto the video.
 *
 * Kling produces silent video, so anything generated outside the UGC studio has
 * no voice at all. CloseBoss solved this with ElevenLabs, but MarketingBoss has
 * no ElevenLabs key — porting it would mean a second vendor and a new secret to
 * keep. fal already hosts a TTS model and we already hold FAL_KEY, so the whole
 * feature rides on credentials that exist.
 *
 * ElevenLabs is used when ELEVENLABS_API_KEY is present and fal's TTS otherwise,
 * so the feature works today and improves the moment the key is added rather
 * than being blocked on it. ElevenLabs earns the second vendor for one thing
 * fal's TTS cannot do: speak in a CLONED voice. The voices offered are read from
 * the account's own library rather than hardcoded, so a voice cloned elsewhere
 * appears here without a code change.
 *
 * Verified end to end on 2026-08-19 — the FAL path only, since no ElevenLabs key
 * exists here yet: `xai/tts/v1` returned an mp3 in 3s, and ffmpeg compose muxed
 * it onto a 5s clip in 10s with a `soun` track present in the output.
 */

const QUEUE = "https://queue.fal.run";
const TTS_MODEL = "xai/tts/v1";
const COMPOSE_MODEL = "fal-ai/ffmpeg-api/compose";
const ELEVEN_TTS = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVEN_VOICES = "https://api.elevenlabs.io/v1/voices";

export type VoiceOption = { id: string; name: string; cloned: boolean };

function elevenKey(): string | null {
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

/** Which engine will speak — the UI says so, since the voices differ. */
export function voiceProvider(): "elevenlabs" | "fal" {
  return elevenKey() ? "elevenlabs" : "fal";
}

/**
 * The voices on offer.
 *
 * Read from the ElevenLabs account rather than hardcoded, so a cloned voice
 * appears without a code change and this can never list an id the account
 * cannot actually use. Falls back to the single fal voice when there is no key,
 * or when ElevenLabs cannot be reached — a voice list is not worth failing a
 * page over.
 */
export async function listVoices(): Promise<VoiceOption[]> {
  const key = elevenKey();
  if (!key) return [{ id: "", name: "Default narrator", cloned: false }];
  try {
    const res = await fetch(ELEVEN_VOICES, { headers: { "xi-api-key": key } });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as {
      voices?: Array<{ voice_id?: string; name?: string; category?: string }>;
    };
    const voices = (body.voices ?? [])
      .filter((v) => v.voice_id && v.name)
      .map((v) => ({
        id: v.voice_id as string,
        name: v.name as string,
        cloned: v.category === "cloned" || v.category === "professional",
      }));
    // Cloned first — someone who cloned a voice wants to use it.
    voices.sort((a, b) => Number(b.cloned) - Number(a.cloned));
    return voices.length ? voices : [{ id: "", name: "Default narrator", cloned: false }];
  } catch {
    return [{ id: "", name: "Default narrator", cloned: false }];
  }
}

/** A TTS pass plus an ffmpeg mux — no frames are generated, so it is cheap. */
export const VOICEOVER_CREDIT = 3;
/** Past this the narration stops being a short-form ad read. */
export const MAX_SCRIPT_CHARS = 800;

export class VoiceoverCreditError extends Error {
  constructor() {
    super(`Not enough credits — a voiceover costs ${VOICEOVER_CREDIT}.`);
    this.name = "VoiceoverCreditError";
  }
}

function falHeaders(): Record<string, string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

/** Submit to fal's queue and poll to completion. */
async function falRun(model: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const H = falHeaders();
  const sub = await fetch(`${QUEUE}/${model}`, { method: "POST", headers: H, body: JSON.stringify(input) });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: unknown;
  };
  if (!sub.ok) throw new Error(`fal ${model} submit ${sub.status}`);

  const statusUrl = q.status_url || `${QUEUE}/${model}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${QUEUE}/${model}/requests/${q.request_id}`;
  const started = Date.now();
  for (;;) {
    const r = await fetch(statusUrl, { headers: H });
    const s = (await r.json().catch(() => ({}))) as { status?: string };
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error(`fal ${model} failed.`);
    if (Date.now() - started > 240_000) throw new Error("Narration timed out.");
    await new Promise((res) => setTimeout(res, 2500));
  }
  const out = (await (await fetch(responseUrl, { headers: H })).json().catch(() => ({}))) as Record<string, unknown>;
  // A COMPLETED job can still carry a validation error instead of a result.
  if (out.detail) throw new Error(`fal ${model} rejected the request.`);
  return out;
}

/**
 * How long the clip runs, read from the MP4's own header.
 *
 * Parsed here rather than taken from the browser: the value decides how much of
 * the track ffmpeg keeps, and a wrong number from a client would silently clip
 * the narration short.
 */
function durationFromMp4(buf: Uint8Array): number | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = -1;
  for (let p = 0; p + 4 <= buf.length; p += 1) {
    if (buf[p] === 0x6d && buf[p + 1] === 0x76 && buf[p + 2] === 0x68 && buf[p + 3] === 0x64) {
      i = p;
      break;
    }
  }
  if (i < 0) return null;
  try {
    // mvhd body follows the 4-byte type: v0 timescale@+16 duration@+20,
    // v1 widens both timestamps so they sit at +24 and +28.
    const version = buf[i + 4];
    const timescale = version === 1 ? dv.getUint32(i + 24) : dv.getUint32(i + 16);
    const duration = version === 1 ? Number(dv.getBigUint64(i + 28)) : dv.getUint32(i + 20);
    if (!timescale || !duration) return null;
    return duration / timescale;
  } catch {
    return null;
  }
}

/**
 * Speak `text`, returning a URL the mux can fetch.
 *
 * ElevenLabs returns raw audio rather than a URL, so those bytes are stored in
 * our own bucket and that public URL is passed on: fal has to be able to fetch
 * the track over HTTP.
 *
 * Exported because the talking avatar needs exactly this step — same engine
 * selection, same cloned voices — and a second copy would drift from this one.
 */
export async function speak(
  supabase: SupabaseClient,
  userId: string,
  text: string,
  voiceId: string,
): Promise<string> {
  const key = elevenKey();
  if (!key) {
    const out = await falRun(TTS_MODEL, { text });
    const url = (out.audio as { url?: string } | undefined)?.url;
    if (!url) throw new Error("Narration returned no audio.");
    return url;
  }

  // An empty id means no preference — pick a documented stock voice rather than
  // posting an empty path segment.
  const voice = voiceId || "21m00Tcm4TlvDq8ikWAM";
  const res = await fetch(`${ELEVEN_TTS}/${encodeURIComponent(voice)}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: text.slice(0, MAX_SCRIPT_CHARS),
      // Overridable so a newer model can be switched on with an env change; the
      // default stays a GA model so a misset var cannot break synthesis.
      model_id: process.env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_multilingual_v2",
      voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.35, use_speaker_boost: true },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Voice synth failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const path = `${userId}/voice/${crypto.randomUUID()}.mp3`;
  const { error: upErr } = await supabase.storage
    .from("media")
    .upload(path, bytes, { contentType: "audio/mpeg", upsert: false });
  if (upErr) throw new Error(`Could not store the narration: ${upErr.message}`);
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

/**
 * Narrate `videoUrl` with `script` and store the result.
 *
 * Credits are reserved up front and refunded on any failure, so a fal hiccup
 * does not cost the user a voiceover they never received.
 */
export async function addVoiceover(
  supabase: SupabaseClient,
  userId: string,
  videoUrl: string,
  script: string,
  voiceId = "",
): Promise<{ url: string; credits: number }> {
  const { data: remaining, error: reserveErr } = await supabase.rpc("consume_credits", {
    p_cost: VOICEOVER_CREDIT,
  });
  if (reserveErr) throw new Error("Could not check credits.");
  if (typeof remaining === "number" && remaining < 0) throw new VoiceoverCreditError();

  try {
    const source = await fetch(videoUrl);
    if (!source.ok) throw new Error(`Could not read that video (${source.status}).`);
    const videoBytes = new Uint8Array(await source.arrayBuffer());
    const seconds = durationFromMp4(videoBytes);
    if (!seconds) throw new Error("Could not read the clip's length.");

    const audioUrl = await speak(supabase, userId, script, voiceId);

    // Both tracks are pinned to the VIDEO's length so they stay aligned and the
    // result is never longer than the footage it narrates.
    const durationMs = Math.round(seconds * 1000);
    const out = await falRun(COMPOSE_MODEL, {
      tracks: [
        { id: "video", type: "video", keyframes: [{ url: videoUrl, timestamp: 0, duration: durationMs }] },
        { id: "audio", type: "audio", keyframes: [{ url: audioUrl, timestamp: 0, duration: durationMs }] },
      ],
    });
    const mixed =
      (typeof out.video_url === "string" ? out.video_url : undefined) ||
      (out.video as { url?: string } | undefined)?.url;
    if (!mixed) throw new Error("Narration returned no video.");

    const media = await fetch(mixed);
    if (!media.ok) throw new Error(`Could not fetch the narrated video (${media.status}).`);
    const bytes = new Uint8Array(await media.arrayBuffer());
    const path = `${userId}/${crypto.randomUUID()}.mp4`;
    const { error: upErr } = await supabase.storage
      .from("media")
      .upload(path, bytes, { contentType: "video/mp4", upsert: false });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
    const publicUrl = supabase.storage.from("media").getPublicUrl(path).data.publicUrl;

    await supabase.from("generations").insert({
      user_id: userId,
      type: "video",
      prompt: `Voiceover: ${script.slice(0, 180)}`,
      model: `${voiceProvider()} tts + ffmpeg`,
      aspect: "16:9",
      media_url: publicUrl,
    });

    return { url: publicUrl, credits: typeof remaining === "number" ? remaining : 0 };
  } catch (e) {
    await supabase.rpc("consume_credits", { p_cost: -VOICEOVER_CREDIT }); // best-effort refund
    throw e;
  }
}
