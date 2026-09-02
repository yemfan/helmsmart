import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { twilioSender } from "./twilio-sender";

const SAVED = { ...process.env };

beforeEach(() => {
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  delete process.env.TWILIO_FROM_NUMBER;
});
afterEach(() => {
  process.env = { ...SAVED };
});

describe("twilioSender", () => {
  it("prefers the Messaging Service over the number it was handed", () => {
    // The whole point: the org answers on a voice-only number, but only the
    // registered Messaging Service may send. Passing a number must NOT win.
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG0123456789abcdef";
    expect(twilioSender("+16268888685")).toEqual({ messagingServiceSid: "MG0123456789abcdef" });
  });

  it("uses the Messaging Service even when no number is available at all", () => {
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG0123456789abcdef";
    expect(twilioSender(null)).toEqual({ messagingServiceSid: "MG0123456789abcdef" });
  });

  it("falls back to the given number when no Messaging Service is configured", () => {
    expect(twilioSender("+16268888685")).toEqual({ from: "+16268888685" });
  });

  it("falls back to TWILIO_FROM_NUMBER when the caller has no number", () => {
    process.env.TWILIO_FROM_NUMBER = "+16268887170";
    expect(twilioSender(null)).toEqual({ from: "+16268887170" });
    expect(twilioSender("")).toEqual({ from: "+16268887170" });
  });

  it("returns null when nothing is configured, so the caller can skip the send", () => {
    expect(twilioSender(null)).toBeNull();
    expect(twilioSender(undefined)).toBeNull();
    expect(twilioSender("")).toBeNull();
  });

  it("trims whitespace, which otherwise fails silently", () => {
    // A trailing newline pasted into a Vercel env var is invisible in the UI and
    // makes Twilio reject the SID — the same class of bug as the untrimmed
    // META_APP_SECRET.
    process.env.TWILIO_MESSAGING_SERVICE_SID = "  MG0123456789abcdef\n";
    expect(twilioSender(null)).toEqual({ messagingServiceSid: "MG0123456789abcdef" });
  });

  it("ignores an empty Messaging Service value rather than sending with nothing", () => {
    process.env.TWILIO_MESSAGING_SERVICE_SID = "   ";
    expect(twilioSender("+16268888685")).toEqual({ from: "+16268888685" });
  });
});
