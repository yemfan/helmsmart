import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";

/**
 * Agent digital twin — Phase A. From the agent's uploaded intro video we build a
 * structured brand profile:
 *   1. transcribe the video (fal Wizper — accepts mp4)
 *   2. Claude distills {bio, specialties, market, tone, tagline} from what they said
 *   3. store it on the agent (personalizes their AI-generated marketing)
 *
 * The intro video is PRIVATE (lead-media bucket, agent likeness/voice). Wizper
 * needs a URL, so we hand it a short-lived signed URL — never a public link.
 * Gated on FAL_KEY (transcription) + ANTHROPIC_API_KEY (extraction), and only
 * runs after the agent has recorded consent to AI use of their likeness/voice.
 */

const FAL_QUEUE = "https://queue.fal.run";
const WIZPER = "fal-ai/wizper";
const PRIVATE_BUCKET = "lead-media";

export type BrandProfile = {
  bio: string;
  specialties: string[];
  market: string;
  tone: string;
  tagline: string;
};

export function digitalTwinConfigured(): boolean {
  return Boolean(process.env.FAL_KEY?.trim()) && isAnthropicConfigured();
}

function falHeaders(): Record<string, string> {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("FAL_KEY is not configured on the server.");
  return { Authorization: `Key ${key}`, "Content-Type": "application/json" };
}

/** Transcribe the intro video via fal Wizper (audio_url accepts mp4). */
async function transcribe(mediaUrl: string): Promise<string> {
  const H = falHeaders();
  const sub = await fetch(`${FAL_QUEUE}/${WIZPER}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ audio_url: mediaUrl, task: "transcribe" }),
  });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: string;
  };
  if (!sub.ok) throw new Error(`Transcription submit ${sub.status}: ${q.detail || ""}`);

  const statusUrl = q.status_url || `${FAL_QUEUE}/${WIZPER}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${FAL_QUEUE}/${WIZPER}/requests/${q.request_id}`;
  const started = Date.now();
  for (;;) {
    const r = await fetch(statusUrl, { headers: H });
    const s = (await r.json().catch(() => ({}))) as { status?: string };
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error("Transcription failed.");
    if (Date.now() - started > 180_000) throw new Error("Transcription timed out.");
    await new Promise((res) => setTimeout(res, 2500));
  }
  const rr = await fetch(responseUrl, { headers: H });
  const out = (await rr.json().catch(() => ({}))) as { text?: string };
  return (out.text ?? "").trim();
}

const PROFILE_SCHEMA_HINT =
  'Return ONLY JSON: {"bio": string (2-3 sentence first-person agent bio), ' +
  '"specialties": string[] (3-6 short phrases, e.g. "first-time buyers", "luxury"), ' +
  '"market": string (the area/market they serve), "tone": string (their voice, e.g. "warm and direct"), ' +
  '"tagline": string (a short personal tagline)}';

/** Claude distills a brand profile from the transcript. Facts-only, no invention. */
async function extractProfile(transcript: string, agentName: string | null): Promise<BrandProfile> {
  const client = getAnthropicClient();
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system:
      "You build a real-estate agent's brand profile from the transcript of a short intro video they recorded. " +
      "Use ONLY what they actually say — never invent credentials, stats, or a market they didn't mention. " +
      "Write the bio in first person, in their own voice. " +
      PROFILE_SCHEMA_HINT,
    messages: [
      { role: "user", content: `Agent name: ${agentName ?? "(unknown)"}\n\nIntro video transcript:\n${transcript.slice(0, 6000)}` },
    ],
  });
  const text = (res.content.find((b) => b.type === "text") as { text?: string } | undefined)?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const p = JSON.parse(m ? m[0] : text) as Partial<BrandProfile>;
    return {
      bio: (p.bio || "").toString().slice(0, 800),
      specialties: Array.isArray(p.specialties) ? p.specialties.filter((s) => typeof s === "string").slice(0, 6) : [],
      market: (p.market || "").toString().slice(0, 200),
      tone: (p.tone || "").toString().slice(0, 120),
      tagline: (p.tagline || "").toString().slice(0, 200),
    };
  } catch {
    return { bio: "", specialties: [], market: "", tone: "", tagline: "" };
  }
}

async function setTwin(agentId: string, patch: Record<string, unknown>): Promise<void> {
  await supabaseAdmin
    .from("agents")
    .update({ ...patch, dt_updated_at: new Date().toISOString() })
    .eq("id", agentId);
}

/**
 * Process an uploaded intro video into a brand profile. Requires consent (the
 * caller records it). Signs the private video, transcribes, extracts, stores.
 */
export async function processDigitalTwin(
  agentId: string,
  videoPath: string,
  agentName: string | null,
): Promise<{ status: string; profile: BrandProfile }> {
  await setTwin(agentId, { dt_status: "processing", dt_error: null, dt_intro_video_path: videoPath });
  try {
    const { data, error } = await supabaseAdmin.storage.from(PRIVATE_BUCKET).createSignedUrl(videoPath, 900);
    if (error || !data?.signedUrl) throw new Error("Could not read the uploaded video.");

    const transcript = await transcribe(data.signedUrl);
    if (!transcript) throw new Error("No speech detected in the video — record yourself talking to camera.");

    const profile = await extractProfile(transcript, agentName);
    await setTwin(agentId, {
      dt_status: "ready",
      dt_transcript: transcript,
      dt_brand_profile: profile,
      dt_error: null,
    });
    return { status: "ready", profile };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Processing failed.";
    await setTwin(agentId, { dt_status: "failed", dt_error: msg });
    throw e;
  }
}

/** Record the agent's likeness/voice consent (idempotent). */
export async function setDigitalTwinConsent(agentId: string, consent: boolean): Promise<void> {
  await setTwin(agentId, {
    dt_consent: consent,
    dt_consent_at: consent ? new Date().toISOString() : null,
  });
}

/** Save an edited brand profile (agent tweaks the AI-drafted one). */
export async function saveBrandProfile(agentId: string, profile: BrandProfile): Promise<void> {
  await setTwin(agentId, { dt_brand_profile: profile });
}
