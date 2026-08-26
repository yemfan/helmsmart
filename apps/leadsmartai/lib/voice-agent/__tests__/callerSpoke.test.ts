import { describe, it, expect } from "vitest";
import { callerSpoke } from "../callerTextBackCopy";

/**
 * The receptionist always speaks — she opens every call — so her turns say
 * nothing about whether a human engaged. Only the caller's lines count.
 */
describe("callerSpoke", () => {
  it("is false when the caller hung up during the greeting", () => {
    expect(callerSpoke("Agent: Hello, 您好, Hola")).toBe(false);
  });

  it("is false for an empty or missing transcript", () => {
    expect(callerSpoke("")).toBe(false);
    expect(callerSpoke(null)).toBe(false);
    expect(callerSpoke(undefined)).toBe(false);
  });

  it("is false when the agent talks at length and the caller never answers", () => {
    const t = [
      "Agent: Hello, 您好, Hola",
      "Agent: Thank you for calling Michael Ye Real Estate!",
      "Agent: Are you still there?",
    ].join("\n");
    expect(callerSpoke(t)).toBe(false);
  });

  it("is true on a single caller word", () => {
    expect(callerSpoke("Agent: Hello, 您好, Hola\nUser: 你好")).toBe(true);
  });

  it("treats an empty caller turn as silence", () => {
    // Retell emits a bare "User:" line for a turn that carried no speech.
    expect(callerSpoke("Agent: Hello\nUser: ")).toBe(false);
  });

  it("accepts the Caller: label as well as User:", () => {
    expect(callerSpoke("Agent: Hello\nCaller: yes hi")).toBe(true);
  });
});
