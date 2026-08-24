import twilio from "twilio";

import { defaultTwilioVoicePlayback } from "@/lib/agent-voice/resolvePlayback";
import type { TwilioVoicePlayback } from "@/lib/agent-voice/types";

/**
 * TwiML for the OUTBOUND voice-AI demo call. Structurally similar to the
 * inbound greeting flow in `lib/ai-call/twilio.ts`, but with a demo-specific
 * opening ("Hi, this is the CloseBoss assistant — calling because you
 * requested a demo") so the recipient understands the context.
 *
 * Once the prospect speaks, Twilio POSTs the SpeechResult to the
 * `gatherActionUrl` — which should be the existing inbound speech-handler
 * route. That reuse means the demo conversation runs through the same
 * processGatheredSpeech engine the production CRM uses, so what the
 * prospect hears is exactly what their leads would hear.
 */

const DEMO_GREETING_EN =
  "Hi, this is the CloseBoss voice assistant. I'm calling because you requested a demo on our website. " +
  "I'll behave exactly like I would on a real lead's call. Mind if I ask you a few quick qualifying questions?";

const DEMO_GATHER_REPROMPT =
  "I didn't catch that. Take your time — just tell me what kind of property you're thinking about, " +
  "or say 'hand me to a human' if you'd rather skip the demo.";

const DEMO_CLOSING_FALLBACK =
  "Sounds like we got cut off. I'll have a real person from CloseBoss reach out — " +
  "thanks for the interest, and have a great rest of your day.";

type SayAttrs = Parameters<typeof twilio.twiml.VoiceResponse.prototype.say>[0];

function sayAttributes(playback: TwilioVoicePlayback): SayAttrs {
  return { voice: playback.voiceEn as NonNullable<SayAttrs["voice"]> };
}

export type BuildOutboundDemoTwimlArgs = {
  /**
   * Absolute URL Twilio will POST to with `SpeechResult` once the prospect
   * speaks. Should be the existing inbound speech-handler route so the
   * demo reuses the production AI engine.
   */
  gatherActionUrl: string;
  playback?: TwilioVoicePlayback;
};

/**
 * Build the TwiML XML for the demo call. Pure — no I/O, deterministic given
 * the inputs. Tests assert structural shape rather than exact byte equality
 * because the underlying `twilio.twiml` library may emit attributes in a
 * different order across versions.
 */
export function buildOutboundDemoTwiml(args: BuildOutboundDemoTwimlArgs): string {
  const playback = args.playback ?? defaultTwilioVoicePlayback();
  const vr = new twilio.twiml.VoiceResponse();

  vr.say(sayAttributes(playback), DEMO_GREETING_EN);

  const gather = vr.gather({
    input: ["speech"],
    action: args.gatherActionUrl,
    method: "POST",
    speechTimeout: "auto",
    language: "en-US",
    speechModel: "phone_call",
    enhanced: true,
    timeout: 12,
    hints: "buying,selling,tour,schedule,human,hand off",
  });
  gather.say(sayAttributes(playback), DEMO_GATHER_REPROMPT);

  vr.say(sayAttributes(playback), DEMO_CLOSING_FALLBACK);
  vr.hangup();

  return vr.toString();
}

/** Exposed for tests so we can assert prompt copy without hard-coding strings twice. */
export const OUTBOUND_DEMO_PROMPTS = {
  greeting: DEMO_GREETING_EN,
  gatherReprompt: DEMO_GATHER_REPROMPT,
  closingFallback: DEMO_CLOSING_FALLBACK,
} as const;
