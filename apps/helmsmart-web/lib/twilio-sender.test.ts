import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { twilioSender, twilioStatusCallback } from "./twilio-sender";

const SAVED = { ...process.env };

beforeEach(() => {
  delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  delete process.env.TWILIO_FROM_NUMBER;
  delete process.env.NEXT_PUBLIC_APP_URL;
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

  it("falls back to the given number when nothing else is configured", () => {
    expect(twilioSender("+16268888685")).toEqual({ from: "+16268888685" });
  });

  it("falls back to TWILIO_FROM_NUMBER when the caller has no number", () => {
    process.env.TWILIO_FROM_NUMBER = "+16268887170";
    expect(twilioSender(null)).toEqual({ from: "+16268887170" });
    expect(twilioSender("")).toEqual({ from: "+16268887170" });
  });

  it("prefers TWILIO_FROM_NUMBER over the org's own receiving number", () => {
    // The org number is the line the receptionist ANSWERS on. Being able to
    // receive says nothing about being allowed to send: it must belong to this
    // Twilio account and be A2P-registered. +16268888685 was neither, so every
    // text from it returned 30034 while the account's approved sender sat
    // unused in the env.
    process.env.TWILIO_FROM_NUMBER = "+16268887170";
    expect(twilioSender("+16268888685")).toEqual({ from: "+16268887170" });
  });

  it("still ignores a blank TWILIO_FROM_NUMBER", () => {
    // An env var present but empty must not beat a usable org number, or a
    // stray blank in Vercel silently stops every message.
    process.env.TWILIO_FROM_NUMBER = "   ";
    expect(twilioSender("+16268888685")).toEqual({ from: "+16268888685" });
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

describe("twilioStatusCallback", () => {
  it("points Twilio at the status webhook", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.helmsmart.ai";
    expect(twilioStatusCallback()).toEqual({
      statusCallback: "https://www.helmsmart.ai/api/twilio/sms/status",
    });
  });

  it("does not double the slash when the app URL has a trailing one", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.helmsmart.ai/";
    expect(twilioStatusCallback()).toEqual({
      statusCallback: "https://www.helmsmart.ai/api/twilio/sms/status",
    });
  });

  it("omits the callback on a non-https URL rather than failing the send", () => {
    // Twilio rejects a callback it cannot reach and fails the WHOLE message.
    // On localhost that would mean no texts at all in development — better to
    // lose the delivery receipt than the message.
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3005";
    expect(twilioStatusCallback()).toEqual({});
  });

  it("omits the callback when no app URL is configured", () => {
    expect(twilioStatusCallback()).toEqual({});
    process.env.NEXT_PUBLIC_APP_URL = "   ";
    expect(twilioStatusCallback()).toEqual({});
  });

  it("spreads into a message payload without disturbing it", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.helmsmart.ai";
    const payload = { ...twilioSender("+16268887170"), ...twilioStatusCallback(), to: "+15551234567", body: "hi" };
    expect(payload).toEqual({
      from: "+16268887170",
      statusCallback: "https://www.helmsmart.ai/api/twilio/sms/status",
      to: "+15551234567",
      body: "hi",
    });
  });
});
