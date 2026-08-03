import twilio from "twilio";
import type { TwilioVoicePlayback } from "@/lib/agent-voice/types";
import { defaultTwilioVoicePlayback } from "@/lib/agent-voice/resolvePlayback";
import type { VoiceSessionLanguage } from "./voice-language";
import {
  VOICE_BILINGUAL_GREETING_EN,
  VOICE_BILINGUAL_GREETING_ZH,
  VOICE_CLOSING_SHORT,
  VOICE_CLOSING_SHORT_ZH,
  VOICE_GATHER_REPROMPT,
  VOICE_GATHER_REPROMPT_BILINGUAL_EN,
  VOICE_GATHER_REPROMPT_BILINGUAL_ZH,
  VOICE_GATHER_REPROMPT_ZH,
  VOICE_LANGUAGE_PROMPT_EN,
  VOICE_LANGUAGE_PROMPT_ZH,
  VOICE_SAFE_FALLBACK_SCRIPT,
  VOICE_VOICEMAIL_SCRIPT,
  voiceClosingSavedForLanguage,
} from "./prompts";

export type { TwilioVoicePlayback } from "@/lib/agent-voice/types";
export { defaultTwilioVoicePlayback } from "@/lib/agent-voice/resolvePlayback";

export function validateTwilioSignature(params: {
  authToken: string;
  signature: string;
  url: string;
  formParams: Record<string, string>;
}) {
  return twilio.validateRequest(
    params.authToken,
    params.signature,
    params.url,
    params.formParams
  );
}

export function xmlResponse(xml: string) {
  return new Response(xml, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

type TwilioSayAttrs = Parameters<typeof twilio.twiml.VoiceResponse.prototype.say>[0];

/** Any TwiML node that can hold speech/audio (VoiceResponse or a Gather). */
type SpeechNode = {
  say: (attrs: TwilioSayAttrs, message: string) => unknown;
  play: (attrs: Record<string, unknown>, url: string) => unknown;
};

function sayAttributes(playback: TwilioVoicePlayback, lang: "en" | "zh"): TwilioSayAttrs {
  const voice = (lang === "zh" ? playback.voiceZh : playback.voiceEn) as NonNullable<TwilioSayAttrs["voice"]>;
  return { voice };
}

/**
 * Emit one spoken line. When the agent has a cached cloned voice-line for `key`,
 * `<Play>` it (their own voice); otherwise `<Say>` the text with the preset voice.
 * The per-line fallback means a missing clip never breaks a live call.
 */
function speak(node: SpeechNode, playback: TwilioVoicePlayback, lang: "en" | "zh", key: string, text: string): void {
  const url = playback.clonedLines?.[key];
  if (url) node.play({}, url);
  else node.say(sayAttributes(playback, lang), text);
}

/**
 * Inbound: greeting + language preference (if bilingual) + speech gather + timeout.
 * Language is resolved in `processGatheredSpeech`; closing uses `buildClosingTwiml(lang)`.
 */
export function buildInboundGatherTwiml(actionUrl: string, playback: TwilioVoicePlayback = defaultTwilioVoicePlayback()) {
  const vr = new twilio.twiml.VoiceResponse();

  if (playback.bilingualEnabled) {
    speak(vr, playback, "en", "greeting_en", VOICE_BILINGUAL_GREETING_EN);
    speak(vr, playback, "zh", "greeting_zh", VOICE_BILINGUAL_GREETING_ZH);
    speak(vr, playback, "en", "langprompt_en", VOICE_LANGUAGE_PROMPT_EN);
    speak(vr, playback, "zh", "langprompt_zh", VOICE_LANGUAGE_PROMPT_ZH);

    const gather = vr.gather({
      input: ["speech"],
      action: actionUrl,
      method: "POST",
      speechTimeout: "auto",
      language: "en-US",
      speechModel: "phone_call",
      enhanced: true,
      timeout: 12,
      hints: "english,chinese,中文,英文,buying,selling",
    });
    speak(gather, playback, "en", "reprompt_bi_en", VOICE_GATHER_REPROMPT_BILINGUAL_EN);
    speak(gather, playback, "zh", "reprompt_bi_zh", VOICE_GATHER_REPROMPT_BILINGUAL_ZH);

    speak(vr, playback, "en", "closing_short_en", VOICE_CLOSING_SHORT);
    speak(vr, playback, "zh", "closing_short_zh", VOICE_CLOSING_SHORT_ZH);
  } else if (playback.defaultLanguage === "en") {
    speak(vr, playback, "en", "greeting_en", VOICE_BILINGUAL_GREETING_EN);
    const gather = vr.gather({
      input: ["speech"],
      action: actionUrl,
      method: "POST",
      speechTimeout: "auto",
      language: "en-US",
      speechModel: "phone_call",
      enhanced: true,
      timeout: 12,
      hints: "english,buying,selling,loan,schedule",
    });
    speak(gather, playback, "en", "reprompt_en", VOICE_GATHER_REPROMPT);
    speak(vr, playback, "en", "closing_short_en", VOICE_CLOSING_SHORT);
  } else {
    speak(vr, playback, "zh", "greeting_zh", VOICE_BILINGUAL_GREETING_ZH);
    const gather = vr.gather({
      input: ["speech"],
      action: actionUrl,
      method: "POST",
      speechTimeout: "auto",
      language: "cmn-Hans-CN",
      speechModel: "phone_call",
      enhanced: true,
      timeout: 12,
      hints: "买房,卖房,贷款,中文,英文",
    });
    speak(gather, playback, "zh", "reprompt_zh", VOICE_GATHER_REPROMPT_ZH);
    speak(vr, playback, "zh", "closing_short_zh", VOICE_CLOSING_SHORT_ZH);
  }

  vr.hangup();
  return vr.toString();
}

/** Monolingual closing after `voice_session.language` is locked (English or Chinese only). */
export function buildClosingTwiml(
  lang: VoiceSessionLanguage = "en",
  playback: TwilioVoicePlayback = defaultTwilioVoicePlayback()
) {
  const vr = new twilio.twiml.VoiceResponse();
  const text = voiceClosingSavedForLanguage(lang);
  const L: "en" | "zh" = lang === "zh" ? "zh" : "en";
  speak(vr, playback, L, L === "zh" ? "closing_saved_zh" : "closing_saved_en", text);
  vr.hangup();
  return vr.toString();
}

export function buildSafeFallbackTwiml(playback: TwilioVoicePlayback = defaultTwilioVoicePlayback()) {
  const vr = new twilio.twiml.VoiceResponse();
  speak(vr, playback, "en", "fallback_en", VOICE_SAFE_FALLBACK_SCRIPT);
  vr.hangup();
  return vr.toString();
}

/**
 * Voicemail / mailbox drop (e.g. when wired to a voicemail TwiML branch or dial status).
 * Not used by default inbound route — for future IVR or carrier handoff.
 */
export function buildVoicemailFallbackTwiml(playback: TwilioVoicePlayback = defaultTwilioVoicePlayback()) {
  const vr = new twilio.twiml.VoiceResponse();
  vr.say(sayAttributes(playback, "en"), VOICE_VOICEMAIL_SCRIPT);
  vr.record({ maxLength: 120, playBeep: true });
  vr.say(sayAttributes(playback, "en"), VOICE_CLOSING_SHORT);
  vr.say(sayAttributes(playback, "zh"), VOICE_CLOSING_SHORT_ZH);
  vr.hangup();
  return vr.toString();
}

/** Future: Twilio Media Streams → OpenAI Realtime (WebSocket bridge, not Next Route Handler). */
export function buildMediaStreamConnectTwiML(streamWssUrl: string) {
  const vr = new twilio.twiml.VoiceResponse();
  const connect = vr.connect();
  connect.stream({ url: streamWssUrl, track: "inbound_track" });
  return vr.toString();
}
