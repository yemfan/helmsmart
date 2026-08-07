import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { getAgentVoiceSettings } from "@/lib/agent-voice/settings";
import type { ListingAdFacts } from "@/lib/listings/types";

/**
 * Listing ad voiceover — Phase 2d. Adds an AI-written, agent-editable narration
 * script and an ElevenLabs voiceover muxed onto the finished (silent) tour:
 *   1. Claude drafts a spoken script from the listing facts, sized to the video.
 *   2. ElevenLabs speaks it — in the agent's CLONED voice if they have one ready
 *      + consented (Digital Twin), otherwise a neutral professional default.
 *   3. fal ffmpeg `compose` overlays that narration onto the merged tour MP4.
 *
 * Gated on FAL_KEY + ELEVENLABS_API_KEY + Anthropic. The base tour (ad_reel_url)
 * is never mutated — the voiced result lands in ad_reel_voiced_url, so a failed
 * voiceover always leaves a working silent ad behind.
 */

const FAL_QUEUE = "https://queue.fal.run";
const COMPOSE_MODEL = "fal-ai/ffmpeg-api/compose";
const ELEVEN_TTS = "https://api.elevenlabs.io/v1/text-to-speech";
const BUCKET = "social-images";
// Neutral, professional default voice for agents who haven't cloned their own.
// Overridable via env; falls back to a well-known public ElevenLabs voice.
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_DEFAULT_VOICE_ID?.trim() || "21m00Tcm4TlvDq8ikWAM";

export function voiceoverConfigured(): boolean {
  return (
    Boolean(process.env.FAL_KEY?.trim()) &&
    Boolean(process.env.ELEVENLABS_API_KEY?.trim()) &&
    isAnthropicConfigured()
  );
}

function falHeaders(): Record<string, string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

export type VoiceKind = "cloned" | "default";

/**
 * The agent's cloned voice when it's ready + consented (Digital Twin), otherwise
 * the professional default. Never throws — a missing/error voice-settings row
 * simply resolves to the default.
 */
export async function resolveListingVoice(agentId: string): Promise<{ voiceId: string; kind: VoiceKind }> {
  try {
    const s = await getAgentVoiceSettings(agentId);
    const id = s.voiceCloneRemoteId?.trim();
    if (s.consentConfirmed && s.voiceCloneStatus === "ready" && id) {
      return { voiceId: id, kind: "cloned" };
    }
  } catch {
    /* fall through to default */
  }
  return { voiceId: DEFAULT_VOICE_ID, kind: "default" };
}

/** Claude writes a spoken narration script sized to the video length. */
export async function draftListingScript(facts: ListingAdFacts, targetSeconds: number): Promise<string> {
  // ~2.3 spoken words/sec; clamp so a very short/long tour still reads well.
  const words = Math.max(20, Math.min(240, Math.round(targetSeconds * 2.3)));
  const specs = [
    facts.beds != null ? `${facts.beds} bed` : null,
    facts.baths != null ? `${facts.baths} bath` : null,
    facts.sqft != null ? `${facts.sqft.toLocaleString()} sqft` : null,
    facts.price != null ? `$${Number(facts.price).toLocaleString()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const where = [facts.address, facts.city, facts.state].filter(Boolean).join(", ");

  const client = getAnthropicClient();
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    system:
      "You write a spoken VOICEOVER script for a short vertical video tour of THIS home. " +
      "Use ONLY the facts given — never invent price, specs, features, awards, or neighborhood claims. " +
      "Warm, confident, natural spoken cadence — no stage directions, no emojis, no hashtags, no markdown. " +
      `Aim for about ${words} words so it fits a ~${targetSeconds}s video. End with a clear call to action to book a tour. ` +
      "Return ONLY the words to be spoken.",
    messages: [
      {
        role: "user",
        content:
          `Home: ${where || "a home"}\nSpecs: ${specs || "(none given)"}\n` +
          `Description: ${(facts.description ?? "").slice(0, 600)}\n` +
          `Highlights: ${facts.highlights.slice(0, 8).join(", ")}`,
      },
    ],
  });
  const text = (res.content.find((b) => b.type === "text") as { text?: string } | undefined)?.text?.trim() ?? "";
  return text.slice(0, 1500);
}

/** ElevenLabs text-to-speech → mp3 bytes. */
async function synthVoice(voiceId: string, text: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured.");
  const res = await fetch(`${ELEVEN_TTS}/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: text.slice(0, 2500),
      // Overridable model (default GA); expressive settings — same cost, one call.
      model_id: process.env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_multilingual_v2",
      voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.35, use_speaker_boost: true },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voice synth failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function pollCompose(statusUrl: string, responseUrl: string, headers: Record<string, string>): Promise<string> {
  const started = Date.now();
  for (;;) {
    const r = await fetch(statusUrl, { headers });
    const s = (await r.json().catch(() => ({}))) as { status?: string };
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error("Voiceover compose failed.");
    if (Date.now() - started > 260_000) throw new Error("Voiceover compose timed out.");
    await new Promise((res) => setTimeout(res, 2500));
  }
  const rr = await fetch(responseUrl, { headers });
  const out = (await rr.json().catch(() => ({}))) as { video_url?: string; video?: { url?: string } };
  const url = out.video_url || out.video?.url;
  if (!url) throw new Error("fal compose returned no video URL.");
  return url;
}

type ListingRow = {
  ad_reel_url: string | null;
  ad_reel_script: string | null;
  ad_clip_urls: string[] | null;
  ad_clip_seconds: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  list_price: number | null;
  property_address: string;
  city: string | null;
  state: string | null;
  property_description: string | null;
  highlights: string[] | null;
};

async function readListing(agentId: string, listingId: string): Promise<ListingRow | null> {
  const { data } = await supabaseAdmin
    .from("listings")
    .select(
      "ad_reel_url, ad_reel_script, ad_clip_urls, ad_clip_seconds, beds, baths, sqft, year_built, list_price, property_address, city, state, property_description, highlights",
    )
    .eq("id", listingId)
    .eq("agent_id", agentId)
    .maybeSingle();
  return (data ?? null) as ListingRow | null;
}

function factsOf(l: ListingRow): ListingAdFacts {
  return {
    beds: l.beds,
    baths: l.baths,
    sqft: l.sqft,
    yearBuilt: l.year_built,
    price: l.list_price,
    address: l.property_address,
    city: l.city,
    state: l.state,
    description: l.property_description,
    highlights: l.highlights ?? [],
    photoUrls: [],
    confidence: 0,
    warnings: [],
  };
}

/** Finished-tour length in seconds = clip count × per-clip length (legacy 5). */
function videoSeconds(l: ListingRow): number {
  const clips = Array.isArray(l.ad_clip_urls) ? l.ad_clip_urls.length : 0;
  const per = l.ad_clip_seconds && l.ad_clip_seconds > 0 ? l.ad_clip_seconds : 5;
  return Math.max(per, clips * per);
}

/** Generate + persist a narration script only (cheap — no TTS, no render). */
export async function generateListingScript(agentId: string, listingId: string): Promise<{ script: string }> {
  const l = await readListing(agentId, listingId);
  if (!l) throw new Error("Listing not found.");
  const script = await draftListingScript(factsOf(l), videoSeconds(l));
  await supabaseAdmin
    .from("listings")
    .update({ ad_reel_script: script, updated_at: new Date().toISOString() })
    .eq("id", listingId)
    .eq("agent_id", agentId);
  return { script };
}

/**
 * Build the voiced video: speak the script in the resolved voice and mux it onto
 * the finished tour. Writes ad_reel_voiced_url; leaves the silent ad_reel_url
 * intact so a failure never destroys a working ad.
 */
export async function buildListingVoiceover(
  agentId: string,
  listingId: string,
  scriptOverride?: string,
): Promise<{ url: string; script: string; voice: VoiceKind }> {
  if (!voiceoverConfigured()) {
    throw new Error("Voiceover isn't configured yet (needs FAL_KEY + ELEVENLABS_API_KEY).");
  }
  const l = await readListing(agentId, listingId);
  if (!l) throw new Error("Listing not found.");
  if (!l.ad_reel_url) throw new Error("Build the video ad first, then add a voiceover.");

  const secs = videoSeconds(l);
  const script = (scriptOverride?.trim() || l.ad_reel_script?.trim() || (await draftListingScript(factsOf(l), secs))).slice(
    0,
    1500,
  );
  if (!script) throw new Error("Couldn't produce a script to narrate.");

  const { voiceId, kind } = await resolveListingVoice(agentId);
  const mp3 = await synthVoice(voiceId, script);

  // Store the narration publicly so fal can fetch it for the compose step.
  const audioPath = `videos/${agentId}/listing/${listingId}/vo-${crypto.randomUUID()}.mp3`;
  const { error: aErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(audioPath, mp3, { contentType: "audio/mpeg", upsert: true });
  if (aErr) throw new Error(`Storage upload failed: ${aErr.message}`);
  const audioUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl(audioPath).data.publicUrl;

  // Overlay the narration onto the (silent) tour via fal ffmpeg compose. Both
  // tracks are pinned to the video's length so audio and video stay aligned.
  const H = falHeaders();
  const durationMs = Math.round(secs * 1000);
  const sub = await fetch(`${FAL_QUEUE}/${COMPOSE_MODEL}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      tracks: [
        { id: "video", type: "video", keyframes: [{ url: l.ad_reel_url, timestamp: 0, duration: durationMs }] },
        { id: "audio", type: "audio", keyframes: [{ url: audioUrl, timestamp: 0, duration: durationMs }] },
      ],
    }),
  });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: string;
  };
  if (!sub.ok) throw new Error(`fal compose submit ${sub.status}: ${q.detail || ""}`);
  const statusUrl = q.status_url || `${FAL_QUEUE}/${COMPOSE_MODEL}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${FAL_QUEUE}/${COMPOSE_MODEL}/requests/${q.request_id}`;
  const composedUrl = await pollCompose(statusUrl, responseUrl, H);

  // Persist the finished voiced video to our public bucket (durable, postable).
  const media = await fetch(composedUrl);
  if (!media.ok) throw new Error(`Could not fetch the voiced video (${media.status}).`);
  const bytes = new Uint8Array(await media.arrayBuffer());
  const outPath = `videos/${agentId}/listing/${listingId}/voiced-${crypto.randomUUID()}.mp4`;
  const { error: vErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(outPath, bytes, { contentType: "video/mp4", upsert: true });
  if (vErr) throw new Error(`Storage upload failed: ${vErr.message}`);
  const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(outPath).data.publicUrl;

  await supabaseAdmin
    .from("listings")
    .update({
      ad_reel_voiced_url: url,
      ad_reel_script: script,
      ad_reel_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId)
    .eq("agent_id", agentId);

  return { url, script, voice: kind };
}
