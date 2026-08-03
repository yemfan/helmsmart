import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { getAgentVoiceSettings } from "@/lib/agent-voice/settings";
import type { BrandProfile } from "@/lib/agent/digitalTwin";

/**
 * Agent digital twin — Phase C (talking avatar). Composes what Phases A + B
 * already built, with NO new provider:
 *   1. Claude drafts a short spoken script from the agent's brand profile.
 *   2. ElevenLabs speaks it in the agent's CLONED voice (Phase B) — cheap preview.
 *   3. (gated, paid) fal lipsync renders that audio onto the agent's intro
 *      video (Phase A) → a talking-avatar clip of the agent saying the script.
 *
 * Cost gate: draft + preview are cheap; the video render is a separate explicit
 * step so the agent hears the voice before spending on the lipsync render.
 *
 * Privacy: the source intro video + cloned voice stay private (own-likeness +
 * consent from A/B). The finished avatar clip is the agent's own likeness saying
 * their own marketing, so it lands in the public social bucket to be posted.
 */

const FAL_QUEUE = "https://queue.fal.run";
const LIPSYNC = "fal-ai/sync-lipsync/v2/pro";
const PRIVATE_BUCKET = "lead-media";
const PUBLIC_BUCKET = "social-images";
const ELEVEN_TTS = "https://api.elevenlabs.io/v1/text-to-speech";

export type AvatarState = {
  configured: boolean;
  hasIntroVideo: boolean;
  voiceReady: boolean;
  script: string | null;
  videoUrl: string | null;
};

export function avatarConfigured(): boolean {
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

type AgentRow = {
  brand_name: string | null;
  dt_intro_video_path: string | null;
  dt_brand_profile: BrandProfile | null;
  dt_avatar_script: string | null;
  dt_avatar_video_url: string | null;
};

async function readAgent(agentId: string): Promise<AgentRow | null> {
  const { data } = await supabaseAdmin
    .from("agents")
    .select("brand_name, dt_intro_video_path, dt_brand_profile, dt_avatar_script, dt_avatar_video_url")
    .eq("id", agentId)
    .maybeSingle();
  return (data ?? null) as AgentRow | null;
}

async function setAgent(agentId: string, patch: Record<string, unknown>): Promise<void> {
  await supabaseAdmin.from("agents").update(patch).eq("id", agentId);
}

/** Voice clone must be ready + consented before we can speak in the agent's voice. */
async function clonedVoiceId(agentId: string): Promise<string> {
  const s = await getAgentVoiceSettings(agentId);
  const id = s.voiceCloneRemoteId?.trim();
  if (!s.consentConfirmed || s.voiceCloneStatus !== "ready" || !id) {
    throw new Error("Clone your voice first (Digital Twin → Your AI voice).");
  }
  return id;
}

export async function getAvatarState(agentId: string): Promise<AvatarState> {
  const [agent, voice] = await Promise.all([readAgent(agentId), getAgentVoiceSettings(agentId)]);
  return {
    configured: avatarConfigured(),
    hasIntroVideo: Boolean(agent?.dt_intro_video_path?.trim()),
    voiceReady:
      voice.consentConfirmed && voice.voiceCloneStatus === "ready" && Boolean(voice.voiceCloneRemoteId?.trim()),
    script: agent?.dt_avatar_script ?? null,
    videoUrl: agent?.dt_avatar_video_url ?? null,
  };
}

/** Claude drafts a short, first-person spoken script from the brand profile. */
export async function draftAvatarScript(agentId: string, topic: string | null): Promise<string> {
  const agent = await readAgent(agentId);
  const profile = agent?.dt_brand_profile ?? null;
  const name = agent?.brand_name ?? null;

  const client = getAnthropicClient();
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system:
      "You write a SHORT script for a real-estate agent to say to camera in a talking-head video (about 20-30 seconds, 55-85 words). " +
      "First person, in their own voice, natural and spoken — no stage directions, no emojis, no hashtags, no markdown. " +
      "Ground it ONLY in the agent's brand profile and the topic; never invent stats, awards, or claims they didn't make. " +
      "Return ONLY the words they should say.",
    messages: [
      {
        role: "user",
        content:
          `Agent name: ${name ?? "(unknown)"}\n` +
          `Brand profile: ${profile ? JSON.stringify(profile) : "(none yet)"}\n` +
          `Topic for this video: ${topic?.trim() || "a warm general introduction to who I am and how I help clients"}`,
      },
    ],
  });
  const text = (res.content.find((b) => b.type === "text") as { text?: string } | undefined)?.text ?? "";
  const script = text.trim().slice(0, 1200);
  if (script) await setAgent(agentId, { dt_avatar_script: script });
  return script;
}

/**
 * Speak `text` in the agent's cloned voice (ElevenLabs). Uploads the mp3 to the
 * PRIVATE bucket and returns both a signed preview URL and the storage path
 * (so a later render can reuse the exact audio the agent approved).
 */
export async function previewAvatarVoice(
  agentId: string,
  text: string,
): Promise<{ audioUrl: string; audioPath: string }> {
  const voiceId = await clonedVoiceId(agentId);
  const clean = text.trim();
  if (!clean) throw new Error("Nothing to say — draft or write a script first.");

  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const res = await fetch(`${ELEVEN_TTS}/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: clean.slice(0, 2500),
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Voice synth failed (${res.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());

  const audioPath = `digital-twin/${agentId}/tts-${crypto.randomUUID()}.mp3`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(PRIVATE_BUCKET)
    .upload(audioPath, bytes, { contentType: "audio/mpeg", upsert: false });
  if (upErr) throw new Error("Could not store the preview audio.");

  const { data, error } = await supabaseAdmin.storage.from(PRIVATE_BUCKET).createSignedUrl(audioPath, 3600);
  if (error || !data?.signedUrl) throw new Error("Could not read the preview audio.");
  return { audioUrl: data.signedUrl, audioPath };
}

async function pollFal(statusUrl: string, responseUrl: string, headers: Record<string, string>): Promise<unknown> {
  const started = Date.now();
  for (;;) {
    const r = await fetch(statusUrl, { headers });
    const s = (await r.json().catch(() => ({}))) as { status?: string };
    if (s.status === "COMPLETED") break;
    if (s.status === "FAILED" || s.status === "ERROR") throw new Error("Avatar render failed.");
    if (Date.now() - started > 280_000) throw new Error("Avatar render timed out.");
    await new Promise((res) => setTimeout(res, 3000));
  }
  const rr = await fetch(responseUrl, { headers });
  return rr.json().catch(() => ({}));
}

/**
 * Paid step: render the talking-avatar clip. Synthesizes the audio if a
 * previously-approved `audioPath` isn't supplied, then fal-lipsyncs it onto the
 * agent's intro video. Persists the finished clip to the public social bucket.
 */
export async function renderAvatarVideo(
  agentId: string,
  text: string,
  audioPath: string | null,
): Promise<{ videoUrl: string }> {
  if (!avatarConfigured()) throw new Error("Avatar isn't configured (needs FAL_KEY + ELEVENLABS_API_KEY).");
  await clonedVoiceId(agentId); // consent/ready guard

  const agent = await readAgent(agentId);
  const videoPath = agent?.dt_intro_video_path?.trim();
  if (!videoPath || !videoPath.startsWith("digital-twin/") || !videoPath.includes(`/${agentId}`)) {
    throw new Error("Record your intro video first (Digital Twin).");
  }

  // Reuse the approved preview audio when given (and it's this agent's), else synthesize now.
  let audio = audioPath?.trim() || "";
  if (!audio || !audio.startsWith(`digital-twin/${agentId}/`)) {
    audio = (await previewAvatarVoice(agentId, text)).audioPath;
  }

  const [{ data: v, error: vErr }, { data: a, error: aErr }] = await Promise.all([
    supabaseAdmin.storage.from(PRIVATE_BUCKET).createSignedUrl(videoPath, 900),
    supabaseAdmin.storage.from(PRIVATE_BUCKET).createSignedUrl(audio, 900),
  ]);
  if (vErr || !v?.signedUrl) throw new Error("Could not read your intro video.");
  if (aErr || !a?.signedUrl) throw new Error("Could not read the voice audio.");

  const H = falHeaders();
  const sub = await fetch(`${FAL_QUEUE}/${LIPSYNC}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ video_url: v.signedUrl, audio_url: a.signedUrl, sync_mode: "loop" }),
  });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: string;
  };
  if (!sub.ok) throw new Error(`Render submit ${sub.status}: ${q.detail || ""}`);

  const statusUrl = q.status_url || `${FAL_QUEUE}/${LIPSYNC}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${FAL_QUEUE}/${LIPSYNC}/requests/${q.request_id}`;
  const out = (await pollFal(statusUrl, responseUrl, H)) as { video?: { url?: string } };
  const resultUrl = out.video?.url;
  if (!resultUrl) throw new Error("Render returned no video.");

  // Persist to our public bucket so the URL is durable + shareable.
  const dl = await fetch(resultUrl);
  if (!dl.ok) throw new Error("Could not download the rendered video.");
  const bytes = Buffer.from(await dl.arrayBuffer());
  const outPath = `avatars/${agentId}/${crypto.randomUUID()}.mp4`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(PUBLIC_BUCKET)
    .upload(outPath, bytes, { contentType: "video/mp4", upsert: false });
  if (upErr) throw new Error("Could not store the rendered video.");
  const publicUrl = supabaseAdmin.storage.from(PUBLIC_BUCKET).getPublicUrl(outPath).data.publicUrl;

  await setAgent(agentId, { dt_avatar_video_url: publicUrl, dt_avatar_script: text.trim().slice(0, 1200) });
  return { videoUrl: publicUrl };
}
