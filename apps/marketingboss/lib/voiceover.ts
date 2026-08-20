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
 * Verified end to end on 2026-08-19: `xai/tts/v1` returned an mp3 in 3s, and
 * ffmpeg compose muxed it onto a 5s clip in 10s with a `soun` track present in
 * the output.
 */

const QUEUE = "https://queue.fal.run";
const TTS_MODEL = "xai/tts/v1";
const COMPOSE_MODEL = "fal-ai/ffmpeg-api/compose";

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

/** Speak `text`, returning a fal-hosted mp3 URL. */
async function speak(text: string): Promise<string> {
  const out = await falRun(TTS_MODEL, { text });
  const url = (out.audio as { url?: string } | undefined)?.url;
  if (!url) throw new Error("Narration returned no audio.");
  return url;
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

    const audioUrl = await speak(script);

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
      model: `${TTS_MODEL} + ffmpeg`,
      aspect: "16:9",
      media_url: publicUrl,
    });

    return { url: publicUrl, credits: typeof remaining === "number" ? remaining : 0 };
  } catch (e) {
    await supabase.rpc("consume_credits", { p_cost: -VOICEOVER_CREDIT }); // best-effort refund
    throw e;
  }
}
