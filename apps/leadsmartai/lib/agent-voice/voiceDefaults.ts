import type { AgentVoiceSettings } from "./types";

/** Safe to import from client components (no server / Supabase). */
export const DEFAULT_AGENT_VOICE_SETTINGS: AgentVoiceSettings = {
  provider: "openai",
  presetVoiceId: "openai_alloy",
  speakingStyle: "friendly",
  defaultLanguage: "en",
  bilingualEnabled: true,
  voiceCloneProvider: null,
  voiceCloneRemoteId: null,
  voiceCloneStatus: null,
  consentConfirmed: false,
  consentConfirmedAt: null,
  voiceCloneSampleStoragePath: null,
  voiceClonePreviewStoragePath: null,
  voiceCloneError: null,
  useClonedVoice: false,
  voiceClonePreviewAcknowledgedAt: null,
  voiceLines: null,
};
