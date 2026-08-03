import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getVoiceCloneAdapter } from "./cloneProvider";
import { getAgentVoiceSettings, upsertAgentVoiceSettings } from "./settings";
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
  if (on) {
    const s = await getAgentVoiceSettings(agentId);
    const ready =
      s.consentConfirmed &&
      s.voiceCloneStatus === "ready" &&
      Boolean(s.voiceCloneRemoteId?.trim()) &&
      Boolean(s.voiceClonePreviewAcknowledgedAt);
    if (!ready) throw new Error("Confirm your voice clone before turning it on.");
  }
  await patchClone(agentId, { use_cloned_voice: on });
  return getVoiceCloneState(agentId);
}

/**
 * Clone the agent's voice from their Phase-A intro video. Consent-gated and
 * own-likeness only (the video lives in the agent's private digital-twin
 * prefix). Runs synchronously: download the video, submit to ElevenLabs, and
 * store the returned voice id (or a readable error on failure).
 */
export async function startVoiceCloneFromTwin(agentId: string): Promise<VoiceCloneState> {
  if (!voiceCloneConfigured()) {
    throw new Error("Voice cloning isn't configured yet (needs ELEVENLABS_API_KEY).");
  }

  const settings = await getAgentVoiceSettings(agentId);
  if (!settings.consentConfirmed) {
    throw new Error("Confirm voice-clone consent first.");
  }

  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("dt_intro_video_path")
    .eq("id", agentId)
    .maybeSingle();
  const videoPath = (agent as { dt_intro_video_path?: string | null } | null)?.dt_intro_video_path?.trim();
  // Own-likeness only: must be this agent's private digital-twin capture.
  if (!videoPath || !videoPath.startsWith("digital-twin/") || !videoPath.includes(`/${agentId}`)) {
    throw new Error("Record your intro video first (My Profile → Digital Twin).");
  }

  await ensureRow(agentId);
  await patchClone(agentId, {
    voice_clone_provider: "elevenlabs",
    voice_clone_status: "processing",
    voice_clone_error: null,
  });

  try {
    const { data: file, error: dlErr } = await supabaseAdmin.storage.from(LEAD_MEDIA).download(videoPath);
    if (dlErr || !file) throw new Error(dlErr?.message || "Could not read your intro video.");

    const bytes = Buffer.from(await file.arrayBuffer());
    const filename = videoPath.split("/").pop() || "intro.mp4";
    const mimeType = file.type || "video/mp4";

    const adapter = getVoiceCloneAdapter("elevenlabs");
    if (!adapter) throw new Error("Voice clone provider unavailable.");

    const result = await adapter.submitFromSample({ agentId, filename, bytes, mimeType });

    await patchClone(agentId, {
      voice_clone_status: "ready",
      voice_clone_remote_id: result.remoteVoiceId,
      voice_clone_error: null,
      // Never auto-activate — the agent reviews + turns it on explicitly.
      use_cloned_voice: false,
      voice_clone_preview_acknowledged_at: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Voice clone failed.";
    await patchClone(agentId, { voice_clone_status: "failed", voice_clone_error: msg.slice(0, 2000) });
    throw e;
  }

  return getVoiceCloneState(agentId);
}
