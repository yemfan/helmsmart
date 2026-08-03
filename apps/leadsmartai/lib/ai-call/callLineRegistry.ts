/**
 * The fixed set of TwiML-spoken lines the inbound receptionist uses (greeting,
 * language prompt, gather reprompt, closings, fallback). Because they're static,
 * we can pre-render each in the agent's cloned voice once and `<Play>` them on
 * calls (see lib/agent-voice/clonedCallLines). Pure module — no server deps — so
 * both the generator (server) and the TwiML builders can share the keys.
 *
 * Keys here MUST match the keys used in lib/ai-call/twilio.ts `speak(...)` calls.
 */

import {
  VOICE_BILINGUAL_GREETING_EN,
  VOICE_BILINGUAL_GREETING_ZH,
  VOICE_CLOSING_SAVED,
  VOICE_CLOSING_SAVED_ZH,
  VOICE_CLOSING_SHORT,
  VOICE_CLOSING_SHORT_ZH,
  VOICE_GATHER_REPROMPT,
  VOICE_GATHER_REPROMPT_BILINGUAL_EN,
  VOICE_GATHER_REPROMPT_BILINGUAL_ZH,
  VOICE_GATHER_REPROMPT_ZH,
  VOICE_LANGUAGE_PROMPT_EN,
  VOICE_LANGUAGE_PROMPT_ZH,
  VOICE_SAFE_FALLBACK_SCRIPT,
} from "./voice-scripts";

export type CallLineKey =
  | "greeting_en"
  | "greeting_zh"
  | "langprompt_en"
  | "langprompt_zh"
  | "reprompt_en"
  | "reprompt_zh"
  | "reprompt_bi_en"
  | "reprompt_bi_zh"
  | "closing_short_en"
  | "closing_short_zh"
  | "closing_saved_en"
  | "closing_saved_zh"
  | "fallback_en";

export type CallLine = { key: CallLineKey; lang: "en" | "zh"; text: string };

export const CALL_LINES: readonly CallLine[] = [
  { key: "greeting_en", lang: "en", text: VOICE_BILINGUAL_GREETING_EN },
  { key: "greeting_zh", lang: "zh", text: VOICE_BILINGUAL_GREETING_ZH },
  { key: "langprompt_en", lang: "en", text: VOICE_LANGUAGE_PROMPT_EN },
  { key: "langprompt_zh", lang: "zh", text: VOICE_LANGUAGE_PROMPT_ZH },
  { key: "reprompt_en", lang: "en", text: VOICE_GATHER_REPROMPT },
  { key: "reprompt_zh", lang: "zh", text: VOICE_GATHER_REPROMPT_ZH },
  { key: "reprompt_bi_en", lang: "en", text: VOICE_GATHER_REPROMPT_BILINGUAL_EN },
  { key: "reprompt_bi_zh", lang: "zh", text: VOICE_GATHER_REPROMPT_BILINGUAL_ZH },
  { key: "closing_short_en", lang: "en", text: VOICE_CLOSING_SHORT },
  { key: "closing_short_zh", lang: "zh", text: VOICE_CLOSING_SHORT_ZH },
  { key: "closing_saved_en", lang: "en", text: VOICE_CLOSING_SAVED },
  { key: "closing_saved_zh", lang: "zh", text: VOICE_CLOSING_SAVED_ZH },
  { key: "fallback_en", lang: "en", text: VOICE_SAFE_FALLBACK_SCRIPT },
] as const;
