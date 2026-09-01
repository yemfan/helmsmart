import { describe, it, expect } from "vitest";
import { callerSpokenScript } from "../callerScript";

/**
 * Regression: a call conducted almost entirely in Chinese was saved as
 * preferred_language "en", which made the NEXT call open in English and look
 * like the preference had never been stored at all.
 *
 * The receptionist mirrors the caller, so her turns roughly double whatever the
 * caller said — and her English greeting and sign-off bracket every call. Only
 * the caller's own lines carry evidence.
 */
describe("callerSpokenScript", () => {
  it("reads the caller, not the agent, when the agent opens in English", () => {
    const transcript = [
      "Agent: Hello, 您好, Hola",
      "User: 你好，我想买房子，在阿罕布拉附近找找看",
      "Agent: 感谢您致电！您是想买房还是卖房呢",
      "User: 买房，预算大概一百万左右，我还有一套房子要卖",
    ].join("\n");
    expect(callerSpokenScript(transcript)).toBe("zh");
  });

  it("still says en when the caller genuinely spoke English", () => {
    const transcript = [
      "Agent: Hello, 您好, Hola",
      "User: Hi there, I'm looking to buy a house in Alhambra sometime this year",
      "Agent: Great — what's your budget?",
      "User: Around a million dollars, and I have a place to sell first",
    ].join("\n");
    expect(callerSpokenScript(transcript)).toBe("en");
  });

  it("declines to guess when the caller barely spoke", () => {
    // A 20-second wrong number must not overwrite a real preference on file.
    const transcript = ["Agent: Hello, 您好, Hola", "User: Sorry, wrong number."].join("\n");
    expect(callerSpokenScript(transcript)).toBe("");
  });

  it("declines to guess on a genuinely mixed reply", () => {
    const transcript = [
      "Agent: Hello, 您好, Hola",
      "User: Hi 你好 I am looking for a house okay thanks very much indeed",
    ].join("\n");
    expect(callerSpokenScript(transcript)).toBe("");
  });

  it("ignores agent turns entirely", () => {
    const transcript = [
      "Agent: Thank you for calling, this is Emma, how can I help you today?",
      "Agent: Are you thinking about buying or selling a home?",
      "User: 我想卖房子，房子在洛杉矶",
    ].join("\n");
    expect(callerSpokenScript(transcript)).toBe("zh");
  });
});
