/**
 * Real-estate voice copy — TwiML (`twilio.ts`), CRM metadata, and future OpenAI Realtime.
 * One useful question per line where possible; natural, concise US English.
 */

import type { VoiceSessionLanguage } from "./voice-language";
import type { VoiceCallIntent } from "./types";

// --- Bilingual inbound (English + Chinese) — single language preference ask ---

export const VOICE_BILINGUAL_GREETING_EN =
  "Hi, thanks for calling CloseBoss. I'm your agent's phone assistant.";

export const VOICE_BILINGUAL_GREETING_ZH =
  "您好，欢迎使用 CloseBoss，我是您房产经纪的电话助手。";

/** Ask preferred language once; do not repeat on later TwiML turns. */
export const VOICE_LANGUAGE_PROMPT_EN =
  "You can speak in English or Chinese. For this call, do you prefer English, or Chinese?";

export const VOICE_LANGUAGE_PROMPT_ZH =
  "您可以用英文或中文交流。请问接下来您希望使用英文还是中文？";

// --- TwiML (current single-gather MVP) ----------------------------------------

/** Legacy single-language greeting (prefer bilingual inbound in `twilio.ts`). */
export const VOICE_GREETING_SCRIPT =
  "Hi — thanks for calling. I'm the CloseBoss assistant for your agent. Are you mainly calling about selling a home, buying, getting financing help, or scheduling a time to talk?";

export const VOICE_GATHER_REPROMPT =
  "Sorry, I didn't catch that. In a few words — is this about selling, buying, a loan or pre-approval, or scheduling a callback?";

/** Monolingual Chinese gather reprompt (when bilingual inbound is off and default language is Chinese). */
export const VOICE_GATHER_REPROMPT_ZH =
  "没听清。请简单说明——买房、卖房、贷款或预约回电？";

export const VOICE_GATHER_REPROMPT_BILINGUAL_EN =
  "Sorry, I didn't catch that. Say English or Chinese for your preference, or briefly say what you need.";

export const VOICE_GATHER_REPROMPT_BILINGUAL_ZH =
  "没听清。请说英文或中文表示您的偏好，或简单说明您的需求。";

export const VOICE_CLOSING_SHORT =
  "Thanks for calling. We'll have someone from the team follow up. Goodbye.";

export const VOICE_CLOSING_SHORT_ZH =
  "感谢来电，我们会安排同事尽快回复您。再见。";

export const VOICE_CLOSING_SAVED =
  "Got it — I've saved that for your agent. They'll reach out soon. Goodbye.";

export const VOICE_CLOSING_SAVED_ZH =
  "好的，已经为您记录，您的经纪人会尽快与您联系。感谢来电，再见。";

/** Technical / error path (TwiML). */
export const VOICE_SAFE_FALLBACK_SCRIPT =
  "We're having a quick issue with the line. Please try again in a moment, or text this number and we'll get back to you. Goodbye.";

// --- Voicemail / unanswered ---------------------------------------------------

/** When the call routes to voicemail or no live pickup (future TwiML / carrier). */
export const VOICE_VOICEMAIL_SCRIPT =
  "Hi, you've reached the team through CloseBoss. Please leave your name, number, and whether you're buying or selling — and the best time to call you back. Thanks, and we'll talk soon.";

// --- Flow-specific lines (Realtime / multi-turn TwiML) ------------------------

export const VOICE_FLOW_SELLER = {
  open:
    "Thanks — I’ll note you’re focused on selling. What’s the address or neighborhood we’re talking about?",
  timeline: "Got it. What’s your timeline — are you looking to list in the next few weeks, or more exploring for now?",
  callback:
    "What’s the best number for your agent to reach you, if this one isn’t ideal?",
} as const;

export const VOICE_FLOW_BUYER = {
  open:
    "Thanks — I’ll note you’re looking to buy. What area or type of home are you focused on?",
  step: "Are you already working with a lender, or still getting pre-approved?",
  callback: "What’s the best callback number for your agent?",
} as const;

export const VOICE_FLOW_FINANCING = {
  open:
    "Thanks — I’ll flag this for financing. Are you mainly asking about rates and pre-approval, or a specific loan situation?",
  step:
    "I can’t give loan advice on this line, but I can connect you with the team. What’s the best number to call you back?",
} as const;

export const VOICE_FLOW_APPOINTMENT = {
  open:
    "Sure — what kind of appointment: a showing, a listing consultation, or a general call back?",
  time: "Do you have a day or time window that works best?",
  callback: "What’s the best number to confirm, if needed?",
} as const;

// --- Urgency & priority -------------------------------------------------------

export const VOICE_URGENCY_ACK =
  "I hear the urgency — I’ll mark this as priority for the team so someone gets back to you as soon as possible.";

export const VOICE_URGENCY_QUESTION =
  "Is there a specific deadline or event I should mention — like an offer date or closing?";

// --- Escalation (upset / legal / fraud / safety) ------------------------------

export const VOICE_ESCALATION_CALM =
  "I’m sorry you’re dealing with that. I’m going to flag this for a manager on our team to follow up directly — one moment while I make sure that’s noted.";

export const VOICE_ESCALATION_LEGAL =
    "I can’t give legal advice on this call. I’m escalating you to someone on the team who can review this properly.";

export const VOICE_ESCALATION_STOP_QUALIFY =
  "Let’s pause the questions here — I want the right person from the team to take this with you.";

// --- Closing variants ---------------------------------------------------------

export const VOICE_CLOSING_WARM =
  "Thanks for your time today. Your agent has what they need to follow up. Goodbye.";

export const VOICE_CLOSING_PRIORITY =
  "Thanks — I’ve marked this as priority. You should hear from the team shortly. Goodbye.";

export const VOICE_CLOSING_ESCALATION =
  "Someone from the team will reach out to help with this. Take care, and goodbye.";

/** All scripted closings for selection / A-B testing. */
export const VOICE_CLOSING_LINES = [
  VOICE_CLOSING_SAVED,
  VOICE_CLOSING_WARM,
  VOICE_CLOSING_SHORT,
  VOICE_CLOSING_PRIORITY,
  VOICE_CLOSING_ESCALATION,
] as const;

// --- Bundled export (docs / Realtime session injection) -----------------------

export const VOICE_SCRIPTS = {
  greeting: { main: VOICE_GREETING_SCRIPT },
  gatherReprompt: VOICE_GATHER_REPROMPT,
  closings: {
    saved: VOICE_CLOSING_SAVED,
    short: VOICE_CLOSING_SHORT,
    warm: VOICE_CLOSING_WARM,
    priority: VOICE_CLOSING_PRIORITY,
    escalation: VOICE_CLOSING_ESCALATION,
  },
  seller: VOICE_FLOW_SELLER,
  buyer: VOICE_FLOW_BUYER,
  financing: VOICE_FLOW_FINANCING,
  appointment: VOICE_FLOW_APPOINTMENT,
  urgency: { acknowledge: VOICE_URGENCY_ACK, question: VOICE_URGENCY_QUESTION },
  escalation: {
    calm: VOICE_ESCALATION_CALM,
    legal: VOICE_ESCALATION_LEGAL,
    stopQualify: VOICE_ESCALATION_STOP_QUALIFY,
  },
  voicemail: VOICE_VOICEMAIL_SCRIPT,
  safeFallback: VOICE_SAFE_FALLBACK_SCRIPT,
} as const;

export type VoiceScriptFlowKey = keyof typeof VOICE_SCRIPTS;

// --- Helpers ------------------------------------------------------------------

/** Map CRM transcript intent to the script bucket for Realtime / analytics. */
export function voiceFlowKeyFromIntent(intent: VoiceCallIntent): "seller" | "buyer" | "financing" | "appointment" | "general" {
  switch (intent) {
    case "seller_home_value":
    case "seller_list_home":
      return "seller";
    case "buyer_listing_inquiry":
      return "buyer";
    case "buyer_financing":
      return "financing";
    case "appointment":
      return "appointment";
    default:
      return "general";
  }
}

/** First follow-up line for a flow (one question). */
export function voiceOpeningLineForFlow(
  flow: "seller" | "buyer" | "financing" | "appointment"
): string {
  switch (flow) {
    case "seller":
      return VOICE_FLOW_SELLER.open;
    case "buyer":
      return VOICE_FLOW_BUYER.open;
    case "financing":
      return VOICE_FLOW_FINANCING.open;
    case "appointment":
      return VOICE_FLOW_APPOINTMENT.open;
  }
}

/** Monolingual closing after language is locked (TwiML `say`). */
export function voiceClosingSavedForLanguage(lang: VoiceSessionLanguage): string {
  return lang === "zh" ? VOICE_CLOSING_SAVED_ZH : VOICE_CLOSING_SAVED;
}

/** Timeout / no-speech closing — match session language. */
export function voiceClosingShortForLanguage(lang: VoiceSessionLanguage): string {
  return lang === "zh" ? VOICE_CLOSING_SHORT_ZH : VOICE_CLOSING_SHORT;
}

/** Closing line by situation (default: saved). */
export function voiceClosingLine(kind: "saved" | "warm" | "short" | "priority" | "escalation" = "saved"): string {
  switch (kind) {
    case "warm":
      return VOICE_CLOSING_WARM;
    case "short":
      return VOICE_CLOSING_SHORT;
    case "priority":
      return VOICE_CLOSING_PRIORITY;
    case "escalation":
      return VOICE_CLOSING_ESCALATION;
    default:
      return VOICE_CLOSING_SAVED;
  }
}

/** Flatten flow scripts for injection into an LLM system prompt (Realtime). */
export function voiceScriptsPromptBlock(): string {
  return [
    "## Seller",
    `- open: ${VOICE_FLOW_SELLER.open}`,
    `- timeline: ${VOICE_FLOW_SELLER.timeline}`,
    `- callback: ${VOICE_FLOW_SELLER.callback}`,
    "## Buyer",
    `- open: ${VOICE_FLOW_BUYER.open}`,
    `- step: ${VOICE_FLOW_BUYER.step}`,
    `- callback: ${VOICE_FLOW_BUYER.callback}`,
    "## Financing",
    `- open: ${VOICE_FLOW_FINANCING.open}`,
    `- step: ${VOICE_FLOW_FINANCING.step}`,
    "## Appointment",
    `- open: ${VOICE_FLOW_APPOINTMENT.open}`,
    `- time: ${VOICE_FLOW_APPOINTMENT.time}`,
    "## Urgency",
    `- ${VOICE_URGENCY_ACK}`,
    `- ${VOICE_URGENCY_QUESTION}`,
    "## Escalation",
    `- ${VOICE_ESCALATION_STOP_QUALIFY}`,
    "## Voicemail",
    `- ${VOICE_VOICEMAIL_SCRIPT}`,
  ].join("\n");
}
