export type VoiceProvider = "openai" | "elevenlabs";

export type VoiceSpeakingStyle = "friendly" | "professional" | "luxury";

/** Default assistant language when bilingual inbound is disabled. */
export type VoiceDefaultLanguage = "en" | "zh";

/** Provider-side clone job lifecycle (null = no clone attempt). */
export type VoiceCloneStatus =
  | "uploaded"
  | "processing"
  | "pending"
  | "ready"
  | "failed";

export type AgentVoiceSettings = {
  provider: VoiceProvider;
  presetVoiceId: string;
  speakingStyle: VoiceSpeakingStyle;
  defaultLanguage: VoiceDefaultLanguage;
  bilingualEnabled: boolean;
  /** Integration target for clone jobs (e.g. elevenlabs). */
  voiceCloneProvider: string | null;
  /** Provider-returned voice id when clone succeeds. */
  voiceCloneRemoteId: string | null;
  voiceCloneStatus: VoiceCloneStatus | null;
  /** Explicit consent before upload/processing. */
  consentConfirmed: boolean;
  consentConfirmedAt: string | null;
  /** Supabase Storage path for uploaded sample audio. */
  voiceCloneSampleStoragePath: string | null;
  /** Optional path to generated preview audio (e.g. provider TTS sample). */
  voiceClonePreviewStoragePath: string | null;
  voiceCloneError: string | null;
  /** When true (and clone ready + consent + review), calls play the cloned voice-lines. */
  useClonedVoice: boolean;
  /** User confirmed they listened to preview; required before activation. */
  voiceClonePreviewAcknowledgedAt: string | null;
  /** Pre-rendered cloned voice-lines for TwiML `<Play>` (null until generated). */
  voiceLines: ClonedVoiceLines | null;
};

/** Cached cloned-voice TwiML lines: only valid while `voiceId` matches the current clone. */
export type ClonedVoiceLines = {
  voiceId: string;
  urls: Record<string, string>;
};

export type AgentVoiceSettingsRow = {
  id: string;
  agent_id: string;
  provider: VoiceProvider;
  preset_voice_id: string;
  speaking_style: VoiceSpeakingStyle;
  default_language: VoiceDefaultLanguage;
  bilingual_enabled: boolean;
  voice_clone_provider: string | null;
  voice_clone_remote_id: string | null;
  voice_clone_status: VoiceCloneStatus | null;
  consent_confirmed: boolean;
  consent_confirmed_at: string | null;
  voice_clone_sample_storage_path: string | null;
  voice_clone_preview_storage_path: string | null;
  voice_clone_error: string | null;
  use_cloned_voice: boolean;
  voice_clone_preview_acknowledged_at: string | null;
  voice_lines: ClonedVoiceLines | null;
  created_at: string;
  updated_at: string;
};

export type VoicePresetOption = {
  id: string;
  label: string;
  /** Shown in dashboard UI. */
  description: string;
  /** Amazon Polly voice for English Twilio `<Say>` (current production path). */
  twilioVoiceEn: string;
  /** Amazon Polly voice for Chinese Twilio `<Say>`. */
  twilioVoiceZh: string;
  /** OpenAI Realtime / TTS voice id when that path is enabled. */
  openaiVoiceId: string;
  /** ElevenLabs built-in voice id for future `<Play>` or API TTS. */
  elevenLabsVoiceId: string;
};

/**
 * Resolved playback for Twilio VoiceResponse (disclosure scripts unchanged; only voice + rate vary).
 * Always uses preset Polly voices until `<Play>` or streaming TTS uses a cloned id.
 */
export type TwilioVoicePlayback = {
  voiceEn: string;
  voiceZh: string;
  bilingualEnabled: boolean;
  defaultLanguage: VoiceDefaultLanguage;
  /** Twilio Say speech rate (20%–200%). Omitted for friendly default. */
  ratePercent?: string;
  /** When set, `<Play>` these cloned voice-line mp3s (by line key) instead of `<Say>`. */
  clonedLines?: Record<string, string> | null;
};

/** How inbound call audio is sourced (preset is always available as fallback). */
export type VoicePlaybackSource = "preset" | "clone_configured_not_wired";
