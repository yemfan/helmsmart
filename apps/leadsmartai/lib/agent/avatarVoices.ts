import { ELEVENLABS_VOICE_PRESETS } from "@/lib/agent-voice/presets";

/**
 * Voices the avatar studio can speak in: the agent's own clone, or a stock
 * ElevenLabs preset.
 *
 * The preset ids are shared with the phone-call voice picker
 * (`lib/agent-voice/presets.ts`) so an agent hears the same name meaning the
 * same voice in both places — but the descriptions there are written for the
 * Twilio/Polly call path, so content-flavoured hints are used here instead.
 *
 * Deliberately client-safe (no `server-only`, no secrets): the picker imports
 * this list directly rather than round-tripping the catalog through the API.
 */

/** Sentinel for "speak in my own cloned voice" — never an ElevenLabs voice id. */
export const CLONE_VOICE_ID = "clone";

export type AvatarVoiceOption = { id: string; label: string; hint: string };

const HINTS: Record<string, string> = {
  elevenlabs_rachel: "Calm, warm narration",
  elevenlabs_domi: "Strong and confident",
  elevenlabs_bella: "Soft, friendly female",
  elevenlabs_antoni: "Well-rounded male",
  elevenlabs_elli: "Bright, expressive female",
  elevenlabs_josh: "Younger male",
};

/**
 * Only presets that carry a real ElevenLabs voice id — the OpenAI-named catalog
 * maps to Polly stand-ins on calls and has no ElevenLabs voice to synthesize
 * with, so offering it here would produce a confusing failure.
 */
export const AVATAR_PRESET_VOICES: AvatarVoiceOption[] = ELEVENLABS_VOICE_PRESETS.filter((p) =>
  p.elevenLabsVoiceId.trim(),
).map((p) => ({ id: p.id, label: p.label, hint: HINTS[p.id] ?? p.description }));

export function isPresetVoiceId(id: string): boolean {
  return AVATAR_PRESET_VOICES.some((v) => v.id === id);
}
