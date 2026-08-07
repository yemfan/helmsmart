import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/anthropic";
import { getAgentVoiceSettings } from "@/lib/agent-voice/settings";
import { scheduleReel } from "@/lib/social/scheduleReel";
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
// Premium "Sharper video" pass — RealESRGAN per-frame video upscale/restore.
const FAL_UPSCALE = "fal-ai/video-upscaler";
// Premium "Lifelike avatar" — a portrait frame from the intro video (extract-frame)
// driven by the voice into a talking avatar (Fabric), vs lipsync onto the clip.
const FAL_EXTRACT_FRAME = "fal-ai/ffmpeg-api/extract-frame";
const FAL_FABRIC = "veed/fabric-1.0";
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
      // Model is overridable so the newest ElevenLabs model (e.g. eleven_v3) can
      // be switched on with an env change, no redeploy of logic. Default stays a
      // GA model so a missing/misset var can never break synthesis.
      model_id: process.env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_multilingual_v2",
      // More expressive delivery: a touch of style + speaker boost, slightly
      // looser stability, higher similarity for fidelity to the cloned voice.
      voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.35, use_speaker_boost: true },
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
/**
 * Premium "Sharper video" pass: upscale/restore the finished clip via fal
 * video-upscaler. Best-effort — the caller falls back to the base video on any
 * failure, so this never blocks a render.
 */
async function upscaleVideo(url: string): Promise<string> {
  const H = falHeaders();
  const sub = await fetch(`${FAL_QUEUE}/${FAL_UPSCALE}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ video_url: url }),
  });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: string;
  };
  if (!sub.ok) throw new Error(`Upscale submit ${sub.status}: ${q.detail || ""}`);
  const statusUrl = q.status_url || `${FAL_QUEUE}/${FAL_UPSCALE}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${FAL_QUEUE}/${FAL_UPSCALE}/requests/${q.request_id}`;
  const out = (await pollFal(statusUrl, responseUrl, H)) as { video?: { url?: string }; url?: string };
  const outUrl = out.video?.url || out.url;
  if (!outUrl) throw new Error("Upscale returned no video.");
  return outUrl;
}

/** Extract a still portrait frame from the intro video (fal ffmpeg extract-frame). */
async function extractPortrait(videoUrl: string): Promise<string> {
  const H = falHeaders();
  const sub = await fetch(`${FAL_QUEUE}/${FAL_EXTRACT_FRAME}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ video_url: videoUrl, frame_type: "middle" }),
  });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: string;
  };
  if (!sub.ok) throw new Error(`Frame extract ${sub.status}: ${q.detail || ""}`);
  const statusUrl = q.status_url || `${FAL_QUEUE}/${FAL_EXTRACT_FRAME}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${FAL_QUEUE}/${FAL_EXTRACT_FRAME}/requests/${q.request_id}`;
  const out = (await pollFal(statusUrl, responseUrl, H)) as {
    images?: { url?: string }[];
    image?: { url?: string };
  };
  const url = out.images?.find((i) => i?.url)?.url || out.image?.url;
  if (!url) throw new Error("Frame extraction returned no image.");
  return url;
}

/** Photo-to-avatar: portrait + voice → a lifelike talking video (fal Fabric). */
async function fabricAvatar(imageUrl: string, audioUrl: string): Promise<string> {
  const H = falHeaders();
  const sub = await fetch(`${FAL_QUEUE}/${FAL_FABRIC}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ image_url: imageUrl, audio_url: audioUrl, resolution: "720p" }),
  });
  const q = (await sub.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: string;
  };
  if (!sub.ok) throw new Error(`Avatar render ${sub.status}: ${q.detail || ""}`);
  const statusUrl = q.status_url || `${FAL_QUEUE}/${FAL_FABRIC}/requests/${q.request_id}/status`;
  const responseUrl = q.response_url || `${FAL_QUEUE}/${FAL_FABRIC}/requests/${q.request_id}`;
  const out = (await pollFal(statusUrl, responseUrl, H)) as { video?: { url?: string } };
  const url = out.video?.url;
  if (!url) throw new Error("Avatar render returned no video.");
  return url;
}

export async function renderAvatarVideo(
  agentId: string,
  text: string,
  audioPath: string | null,
  options?: { sharpen?: boolean; photoAvatar?: boolean },
): Promise<{ videoUrl: string; sharpened?: boolean; photoAvatar?: boolean }> {
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

  let resultUrl: string;
  const photoAvatar = Boolean(options?.photoAvatar);
  if (photoAvatar) {
    // Lifelike avatar: a portrait frame from the intro video + the voice →
    // a talking avatar with head motion (Fabric), instead of lipsync-on-clip.
    const portrait = await extractPortrait(v.signedUrl);
    resultUrl = await fabricAvatar(portrait, a.signedUrl);
  } else {
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
    const url = out.video?.url;
    if (!url) throw new Error("Render returned no video.");
    resultUrl = url;
  }

  // Premium "Sharper video": best-effort upscale/restore; fall back to the base
  // clip if it fails so a render never breaks on the enhancement.
  let finalUrl = resultUrl;
  let sharpened = false;
  if (options?.sharpen) {
    try {
      finalUrl = await upscaleVideo(resultUrl);
      sharpened = true;
    } catch (e) {
      console.warn("[avatar] sharpen/upscale failed, using base video:", e instanceof Error ? e.message : e);
    }
  }

  // Persist to our public bucket so the URL is durable + shareable.
  const dl = await fetch(finalUrl);
  if (!dl.ok) throw new Error("Could not download the rendered video.");
  const bytes = Buffer.from(await dl.arrayBuffer());
  const outPath = `avatars/${agentId}/${crypto.randomUUID()}.mp4`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(PUBLIC_BUCKET)
    .upload(outPath, bytes, { contentType: "video/mp4", upsert: false });
  if (upErr) throw new Error("Could not store the rendered video.");
  const publicUrl = supabaseAdmin.storage.from(PUBLIC_BUCKET).getPublicUrl(outPath).data.publicUrl;

  await setAgent(agentId, { dt_avatar_video_url: publicUrl, dt_avatar_script: text.trim().slice(0, 1200) });
  return { videoUrl: publicUrl, sharpened, photoAvatar };
}

/** Claude writes a social caption for the talking-head clip from its script. */
async function draftAvatarCaption(script: string, name: string | null): Promise<string> {
  try {
    const client = getAnthropicClient();
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system:
        "You write ONE social caption for a short talking-head video where a real-estate agent speaks to camera. " +
        "1-2 punchy sentences that hook the viewer, a light call to action, then 3-5 relevant hashtags. " +
        "Use only what the script implies — don't invent stats or claims. Return ONLY the caption text.",
      messages: [{ role: "user", content: `Agent: ${name ?? "(unknown)"}\nVideo script:\n${script.slice(0, 1200)}` }],
    });
    const text = (res.content.find((b) => b.type === "text") as { text?: string } | undefined)?.text?.trim();
    if (text) return text.slice(0, 800);
  } catch {
    /* fall through */
  }
  // Fallback: first sentence of the script.
  return (script.split(/(?<=[.!?])\s/)[0] || script).slice(0, 280);
}

/**
 * Publish the finished avatar clip to the agent's connected FB/IG/LinkedIn.
 * Reuses the reel publish pipeline: a social_reels row carrying the MP4 +
 * caption, then scheduleReel fans it out to scheduled_posts (drained by the
 * publish cron). Returns how many accounts it queued (0 + error if none
 * connected). Caption can be overridden by the UI.
 */
export async function publishAvatarVideo(
  agentId: string,
  captionOverride?: string,
): Promise<{ scheduled: number; error?: string }> {
  const agent = await readAgent(agentId);
  const videoUrl = agent?.dt_avatar_video_url?.trim();
  if (!videoUrl) throw new Error("Generate your avatar video first.");

  const caption = (
    captionOverride?.trim() ||
    (await draftAvatarCaption(agent?.dt_avatar_script ?? "", agent?.brand_name ?? null))
  ).slice(0, 800);

  const { data: reelRow, error } = await supabaseAdmin
    .from("social_reels")
    .insert({ agent_id: Number(agentId), slides: [], caption, hashtags: [], mp4_url: videoUrl, status: "rendered" } as never)
    .select("id")
    .single();
  if (error || !reelRow) throw new Error(error?.message ?? "Could not queue the video for posting.");

  return scheduleReel({ agentId, reelId: (reelRow as { id: string }).id, queueStatus: "scheduled" });
}
