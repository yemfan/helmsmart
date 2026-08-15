import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVoiceCloneAdapter } from "./cloneProvider";
import { getAgentVoiceSettings, upsertAgentVoiceSettings } from "./settings";
import { generateClonedCallLines } from "./clonedCallLines";
import type { AgentVoiceSettings } from "./types";

/**
 * Agent digital twin — Phase B (voice). We clone the agent's voice with
 * ElevenLabs from the SAME intro video they recorded for Phase A (ElevenLabs'
 * add-voice accepts mp4/mov and extracts the audio), so one recording powers
 * the whole twin — no second capture.
 *
 * Guardrails match Phase A: the sample is the agent's own private intro video
 * (lead-media, `digital-twin/<agentId>…`), and an explicit, separate
 * voice-clone consent is required before we ever submit audio to the provider.
 * The clone id lives in `agent_voice_settings.voice_clone_remote_id`; nothing
 * plays it on calls until Twilio `<Play>`/streaming TTS is wired (a later step).
 */

const LEAD_MEDIA = "lead-media";

export function voiceCloneConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export type VoiceCloneState = {
  configured: boolean;
  consent: boolean;
  hasIntroVideo: boolean;
  status: AgentVoiceSettings["voiceCloneStatus"];
  hasClone: boolean;
  acknowledged: boolean;
  useClonedVoice: boolean;
  error: string | null;
};

async function agentHasIntroVideo(agentId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("agents")
    .select("dt_intro_video_path")
    .eq("id", agentId)
    .maybeSingle();
  return Boolean((data as { dt_intro_video_path?: string | null } | null)?.dt_intro_video_path?.trim());
}

/** Materialize the agent_voice_settings row so partial `.update()`s have a target. */
async function ensureRow(agentId: string): Promise<void> {
  await upsertAgentVoiceSettings(agentId, {});
}

/** Partial update of the clone/consent columns (leaves preset settings untouched). */
async function patchClone(agentId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin
    .from("agent_voice_settings")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("agent_id", agentId as never);
  if (error) throw error;
}

export async function getVoiceCloneState(agentId: string): Promise<VoiceCloneState> {
  const [s, hasIntroVideo] = await Promise.all([getAgentVoiceSettings(agentId), agentHasIntroVideo(agentId)]);
  return {
    configured: voiceCloneConfigured(),
    consent: s.consentConfirmed,
    hasIntroVideo,
    status: s.voiceCloneStatus,
    hasClone: Boolean(s.voiceCloneRemoteId?.trim()),
    acknowledged: Boolean(s.voiceClonePreviewAcknowledgedAt),
    useClonedVoice: s.useClonedVoice,
    error: s.voiceCloneError,
  };
}

/** Record (or revoke) the agent's explicit voice-clone consent. */
export async function setVoiceCloneConsent(agentId: string, consent: boolean): Promise<VoiceCloneState> {
  await ensureRow(agentId);
  await patchClone(agentId, {
    consent_confirmed: consent,
    consent_confirmed_at: consent ? new Date().toISOString() : null,
    // Revoking consent also stands the clone down from any playback intent.
    ...(consent ? {} : { use_cloned_voice: false }),
  });
  return getVoiceCloneState(agentId);
}

/** Agent confirms the cloned voice is theirs and sounds right (required before activation). */
export async function acknowledgeVoiceClone(agentId: string): Promise<VoiceCloneState> {
  const s = await getAgentVoiceSettings(agentId);
  if (s.voiceCloneStatus !== "ready" || !s.voiceCloneRemoteId?.trim()) {
    throw new Error("Your voice clone isn't ready yet.");
  }
  await patchClone(agentId, { voice_clone_preview_acknowledged_at: new Date().toISOString() });
  return getVoiceCloneState(agentId);
}

/** Turn cloned-voice use on/off. Only allowed once consent + ready clone + acknowledgement are all in place. */
export async function setUseClonedVoice(agentId: string, on: boolean): Promise<VoiceCloneState> {
  let voiceId: string | null = null;
  if (on) {
    const s = await getAgentVoiceSettings(agentId);
    const ready =
      s.consentConfirmed &&
      s.voiceCloneStatus === "ready" &&
      Boolean(s.voiceCloneRemoteId?.trim()) &&
      Boolean(s.voiceClonePreviewAcknowledgedAt);
    if (!ready) throw new Error("Confirm your voice clone before turning it on.");
    voiceId = s.voiceCloneRemoteId?.trim() ?? null;
  }
  await patchClone(agentId, { use_cloned_voice: on });

  // Turning it ON pre-renders the fixed call voice-lines in the cloned voice so
  // the phone webhook can <Play> them. Best-effort — a failure just leaves calls
  // on the preset voice (per-line <Say> fallback) rather than blocking the toggle.
  if (on && voiceId) {
    try {
      await generateClonedCallLines(agentId, voiceId);
    } catch {
      /* fall back to preset on calls */
    }
  }

  return getVoiceCloneState(agentId);
}

/**
 * Clone the agent's voice from their Phase-A intro video. Consent-gated and
 * own-likeness only (the video lives in the agent's private digital-twin
 * prefix). Runs synchronously: download the video, submit to ElevenLabs, and
 * store the returned voice id (or a readable error on failure).
 */
/**
 * Premium "Clean my voice" — ElevenLabs audio isolation to denoise/isolate the
 * voice from the sample before cloning, for a higher-fidelity clone.
 */
/** ElevenLabs rejects uploads above this, per their own error text. */
const MAX_SAMPLE_BYTES = 11 * 1024 * 1024;

/**
 * Delete a voice we no longer reference. Best-effort by design: a re-clone that
 * succeeded must not be reported as failed because housekeeping didn't land.
 *
 * Without this, every re-clone left its predecessor behind — three had piled up
 * for a single agent in one evening. ElevenLabs caps custom voices per plan, so
 * orphans accumulate until cloning fails for EVERY agent, and that failure
 * presents as a cloning bug rather than a quota one.
 */
async function deleteRemoteVoice(voiceId: string): Promise<void> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key || !voiceId.trim()) return;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
      headers: { "xi-api-key": key },
    });
    if (!res.ok) {
      console.warn(`[voice-clone] could not delete superseded voice ${voiceId} (${res.status})`);
    }
  } catch (e) {
    console.warn("[voice-clone] delete superseded voice failed:", e instanceof Error ? e.message : e);
  }
}

/** Bytes → whole MB, for error copy an agent can actually act on. */
function mb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

async function isolateVoiceAudio(bytes: Buffer, mimeType: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set.");
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(bytes)], { type: mimeType || "audio/mpeg" }), "sample");
  const res = await fetch("https://api.elevenlabs.io/v1/audio-isolation", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Audio isolation failed (${res.status})${t ? `: ${t.slice(0, 200)}` : ""}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function startVoiceCloneFromTwin(
  agentId: string,
  opts?: { clean?: boolean },
): Promise<VoiceCloneState> {
  if (!voiceCloneConfigured()) {
    throw new Error("Voice cloning isn't configured yet (needs ELEVENLABS_API_KEY).");
  }

  const settings = await getAgentVoiceSettings(agentId);
  if (!settings.consentConfirmed) {
    throw new Error("Confirm voice-clone consent first.");
  }

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("dt_intro_video_path, dt_intro_audio_path")
    .eq("id", agentId)
    .maybeSingle();
  const row = (agent ?? null) as { dt_intro_video_path?: string | null; dt_intro_audio_path?: string | null } | null;
  const videoPath = row?.dt_intro_video_path?.trim();
  // Own-likeness only: must be this agent's private digital-twin capture.
  if (!videoPath || !videoPath.startsWith("digital-twin/") || !videoPath.includes(`/${agentId}`)) {
    throw new Error("Record your intro video first (My Profile → Digital Twin).");
  }

  /*
   * Prefer the audio track the browser extracted at upload time. Cloning never
   * needed the video, and sending only the audio keeps the sample small AND
   * completely unprocessed — the previous size workaround ran it through a
   * denoiser, which audibly reshaped the cloned voice.
   *
   * Same ownership rule as the video: it has to be this agent's own capture.
   */
  const audioPath = row?.dt_intro_audio_path?.trim();
  const samplePath =
    audioPath && audioPath.startsWith("digital-twin/") && audioPath.includes(`/${agentId}`)
      ? audioPath
      : videoPath;

  await ensureRow(agentId);
  await patchClone(agentId, {
    voice_clone_provider: "elevenlabs",
    voice_clone_status: "processing",
    voice_clone_error: null,
  });

  try {
    const { data: file, error: dlErr } = await supabaseAdmin.storage.from(LEAD_MEDIA).download(samplePath);
    if (dlErr || !file) throw new Error(dlErr?.message || "Could not read your intro recording.");

    const usingExtractedAudio = samplePath !== videoPath;
    const rawBytes = Buffer.from(await file.arrayBuffer());
    let sampleBytes: Buffer = rawBytes;
    let sampleName = samplePath.split("/").pop() || (usingExtractedAudio ? "intro-audio.wav" : "intro.mp4");
    let sampleMime = file.type || (usingExtractedAudio ? "audio/wav" : "video/mp4");

    // Premium "Clean my voice": best-effort isolation before cloning. Falls back
    // to the raw sample on any failure so cloning never breaks on the pass.
    if (opts?.clean) {
      try {
        sampleBytes = await isolateVoiceAudio(rawBytes, sampleMime);
        sampleName = "intro-clean.mp3";
        sampleMime = "audio/mpeg";
      } catch (e) {
        console.warn("[voice-clone] audio isolation failed, using raw sample:", e instanceof Error ? e.message : e);
      }
    }

    /*
     * Last-resort size fallback, for rows with no extracted audio (uploaded
     * before that existed, or a browser that couldn't decode the container).
     *
     * Isolation gets us under ElevenLabs' 11MB cap by stripping the video, but
     * it is a DENOISER — it reshapes the voice, and clones made this way came
     * back sounding processed. So it now only runs when there is no better
     * option, rather than on every oversized upload.
     */
    if (!usingExtractedAudio && sampleBytes.byteLength > MAX_SAMPLE_BYTES) {
      try {
        sampleBytes = await isolateVoiceAudio(rawBytes, sampleMime);
        sampleName = "intro-audio.mp3";
        sampleMime = "audio/mpeg";
      } catch (e) {
        console.warn("[voice-clone] size-fallback isolation failed:", e instanceof Error ? e.message : e);
      }
    }

    // Audio-only and still over the cap means the recording itself is simply too
    // long. Say that, rather than passing ElevenLabs' wording straight through.
    if (sampleBytes.byteLength > MAX_SAMPLE_BYTES) {
      throw new Error(
        `Your intro video is too long to clone from (${mb(sampleBytes.byteLength)}MB of audio, limit ${mb(
          MAX_SAMPLE_BYTES,
        )}MB). Upload a shorter one — 30–60 seconds of clear speech is plenty.`,
      );
    }

    const adapter = getVoiceCloneAdapter("elevenlabs");
    if (!adapter) throw new Error("Voice clone provider unavailable.");

    const result = await adapter.submitFromSample({
      agentId,
      filename: sampleName,
      bytes: sampleBytes,
      mimeType: sampleMime,
    });

    await patchClone(agentId, {
      voice_clone_status: "ready",
      voice_clone_remote_id: result.remoteVoiceId,
      voice_clone_error: null,
      // Never auto-activate — the agent reviews + turns it on explicitly.
      use_cloned_voice: false,
      voice_clone_preview_acknowledged_at: null,
    });

    // Retire the voice this one replaces — only AFTER the new id is safely
    // stored, so a failure here can never leave the agent with no voice at all.
    const superseded = settings.voiceCloneRemoteId?.trim();
    if (superseded && superseded !== result.remoteVoiceId) {
      await deleteRemoteVoice(superseded);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Voice clone failed.";
    await patchClone(agentId, { voice_clone_status: "failed", voice_clone_error: msg.slice(0, 2000) });
    throw e;
  }

  return getVoiceCloneState(agentId);
}
