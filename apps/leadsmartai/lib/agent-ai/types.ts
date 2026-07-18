/**
 * Agent-scoped AI style (tone only). Does not relax compliance, opt-out, or factual constraints.
 */

export type AiPersonality = "friendly" | "professional" | "luxury";

/** Preferred default for assistant replies when the thread language is ambiguous. */
export type AgentAiDefaultLanguage = "en" | "zh" | "auto";

/** Where reusable prompt layers are applied. */
export type AgentAiChannel = "sms" | "email" | "voice_transcript" | "voice_realtime" | "greeting";

export type AgentAiSettings = {
  personality: AiPersonality;
  defaultLanguage: AgentAiDefaultLanguage;
  bilingualEnabled: boolean;
  /** Optional agent-written hints; capped in API/UI (tone/vocabulary only). */
  styleNotes: string | null;
  /** Signature brand-kit accent color (hex, e.g. "#0072ce). NULL = default RealtyBoss blue. */
  brandColor: string | null;
};

export type AgentAiSettingsRow = {
  id: string;
  agent_id: string;
  personality: AiPersonality;
  default_language: AgentAiDefaultLanguage;
  bilingual_enabled: boolean;
  style_notes: string | null;
  brand_color: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonalityProfileLayers = {
  /** Appended after base SMS assistant rules (tone, brevity, warmth). */
  sms: string;
  /** Appended after base email assistant rules. */
  email: string;
  /** Affects CRM call-summary phrasing only; classification schema unchanged. */
  voiceTranscript: string;
  /** For OpenAI Realtime / future media-stream sessions (full assistant rules). */
  voiceRealtime: string;
  /** Hint block for greeting generator user prompt (tone aligns with personality). */
  greeting: string;
};
