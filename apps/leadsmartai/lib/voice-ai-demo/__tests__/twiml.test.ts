import { describe, expect, it } from "vitest";

import {
  buildOutboundDemoTwiml,
  OUTBOUND_DEMO_PROMPTS,
} from "@/lib/voice-ai-demo/twiml";

describe("buildOutboundDemoTwiml", () => {
  const baseArgs = {
    gatherActionUrl: "https://example.com/api/twilio/voice/inbound",
  };

  it("emits a valid TwiML <Response> envelope", () => {
    const xml = buildOutboundDemoTwiml(baseArgs);
    expect(xml.startsWith("<?xml")).toBe(true);
    expect(xml).toContain("<Response>");
    expect(xml).toContain("</Response>");
  });

  it("includes the demo-specific greeting (not the inbound 'thanks for calling' copy)", () => {
    const xml = buildOutboundDemoTwiml(baseArgs);
    expect(xml).toContain(OUTBOUND_DEMO_PROMPTS.greeting);
    // Inbound flow's greeting must NOT appear here — confirms we built the
    // outbound-specific TwiML, not just borrowed the inbound builder.
    expect(xml).not.toContain("thanks for calling");
  });

  it("forwards speech to the supplied gatherActionUrl", () => {
    const xml = buildOutboundDemoTwiml({
      gatherActionUrl: "https://demo.app/inbound",
    });
    expect(xml).toContain('action="https://demo.app/inbound"');
  });

  it("uses speech-only input (no DTMF capture)", () => {
    const xml = buildOutboundDemoTwiml(baseArgs);
    expect(xml).toContain('input="speech"');
    expect(xml).not.toMatch(/input="dtmf"/);
  });

  it("includes the gather reprompt as a graceful no-input fallback", () => {
    const xml = buildOutboundDemoTwiml(baseArgs);
    expect(xml).toContain(OUTBOUND_DEMO_PROMPTS.gatherReprompt);
  });

  it("hangs up cleanly at the end", () => {
    const xml = buildOutboundDemoTwiml(baseArgs);
    expect(xml).toContain("<Hangup");
  });

  it("includes a 'hand me to a human' speech hint so the AI doesn't dig in", () => {
    const xml = buildOutboundDemoTwiml(baseArgs);
    // The demo absolutely must not pressure — verify the hint is there.
    expect(xml).toMatch(/hand off|human/i);
  });

  it("mentions 'demo' in the greeting so the prospect knows the context", () => {
    expect(OUTBOUND_DEMO_PROMPTS.greeting.toLowerCase()).toContain("demo");
  });

  // These pin the fix for "she hung up the phone too quick". The suite passed
  // before that fix and after it, which is precisely why it never caught this:
  // nothing asserted how many chances the caller got, or whether the reprompt
  // was spoken over the pause the greeting had just asked for.
  it("gives the caller two chances to speak, not one", () => {
    const xml = buildOutboundDemoTwiml(baseArgs);
    expect(xml.split("<Gather").length - 1).toBe(2);
  });

  it("does not speak the reprompt while it is listening", () => {
    // Twilio plays a <Say> nested inside <Gather> WHILE it listens, so nesting
    // the reprompt talked over the caller a beat after asking them a question.
    // Every <Gather> is therefore self-closing now: no children, nothing said
    // over the pause. A closing tag anywhere would mean something is nested.
    const xml = buildOutboundDemoTwiml(baseArgs);
    expect(xml).not.toContain("</Gather>");

    // It is still said — just after the first listen has actually finished.
    expect(xml).toContain(OUTBOUND_DEMO_PROMPTS.gatherReprompt);
    expect(xml.indexOf(OUTBOUND_DEMO_PROMPTS.gatherReprompt)).toBeGreaterThan(
      xml.indexOf("<Gather"),
    );
  });

  it("waits longer on the first ask than the old single attempt did", () => {
    const xml = buildOutboundDemoTwiml(baseArgs);
    const timeouts = [...xml.matchAll(/timeout="(\d+)"/g)].map((m) => Number(m[1]));
    expect(timeouts.length).toBeGreaterThanOrEqual(2);
    expect(timeouts[0]).toBeGreaterThanOrEqual(15);
  });

  it("only hangs up after both attempts and the goodbye", () => {
    const xml = buildOutboundDemoTwiml(baseArgs);
    const hangupAt = xml.indexOf("<Hangup");
    const closingAt = xml.indexOf(OUTBOUND_DEMO_PROMPTS.closingFallback);
    const lastGatherAt = xml.lastIndexOf("<Gather");
    expect(hangupAt).toBeGreaterThan(closingAt);
    expect(closingAt).toBeGreaterThan(lastGatherAt);
  });
});
