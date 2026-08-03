import type { AgentVoiceSettings, TwilioVoicePlayback, VoiceSpeakingStyle } from "./types";
import { findPreset } from "./presets";

const DEFAULT_PLAYBACK: TwilioVoicePlayback = {
  voiceEn: "Polly.Joanna",
  voiceZh: "Polly.Zhiyu",
  bilingualEnabled: true,
  defaultLanguage: "en",
};

function speakingStyleToRate(style: VoiceSpeakingStyle): string | undefined {
  if (style === "friendly") return undefined;
  if (style === "professional") return "95%";
  return "88%";
}

/**
 * Cloned voice-line URLs to `<Play>`, or null to keep `<Say>`. Only returns URLs
 * when the agent has the cloned voice ON, the clone is ready, and the cached
 * lines were generated for the CURRENT clone (voiceId match) — so a re-clone or
 * a disabled toggle safely falls back to Polly. Pure (client-safe).
 */
function clonedLinesFor(settings: AgentVoiceSettings): Record<string, string> | null {
  if (!settings.useClonedVoice || settings.voiceCloneStatus !== "ready") return null;
  const voiceId = settings.voiceCloneRemoteId?.trim();
  const lines = settings.voiceLines;
  if (!voiceId || !lines || lines.voiceId !== voiceId) return null;
  const urls = lines.urls ?? {};
  return Object.keys(urls).length > 0 ? urls : null;
}

/**
 * Maps saved agent voice settings to Twilio `<Say>` playback. OpenAI/ElevenLabs providers
 * use preset metadata; actual OpenAI/ElevenLabs audio generation is a future step.
 */
export function resolveTwilioVoicePlayback(settings: AgentVoiceSettings): TwilioVoicePlayback {
  const preset = findPreset(settings.provider, settings.presetVoiceId);
  const voiceEn = preset?.twilioVoiceEn ?? DEFAULT_PLAYBACK.voiceEn;
  const voiceZh = preset?.twilioVoiceZh ?? DEFAULT_PLAYBACK.voiceZh;
  const ratePercent = speakingStyleToRate(settings.speakingStyle);

  const bilingualEnabled = settings.bilingualEnabled;
  const defaultLanguage = settings.defaultLanguage;

  return {
    voiceEn,
    voiceZh,
    bilingualEnabled,
    defaultLanguage,
    ...(ratePercent ? { ratePercent } : {}),
    clonedLines: clonedLinesFor(settings),
  };
}

export function defaultTwilioVoicePlayback(): TwilioVoicePlayback {
  return { ...DEFAULT_PLAYBACK };
}
