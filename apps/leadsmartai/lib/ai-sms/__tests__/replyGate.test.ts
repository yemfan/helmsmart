import { describe, it, expect } from "vitest";
import { shouldAiReply, DEFAULT_FLOOR_MS } from "../replyGate";

const T0 = new Date("2026-08-28T12:00:00Z").getTime();
const at = (msAgo: number, role: string) => ({
  role,
  content: "x",
  created_at: new Date(T0 - msAgo).toISOString(),
});

describe("AI SMS reply gate", () => {
  it("answers a person who replied thirty seconds later", () => {
    // The exact case that failed: the AI asked which area, the lead answered
    // "Rowland Heights" half a minute after, and was met with silence.
    const convo = [at(35_000, "assistant"), at(0, "user")];
    expect(shouldAiReply(convo, T0).reply).toBe(true);
  });

  it("still answers ten minutes later — the old rule's entire window", () => {
    expect(shouldAiReply([at(9 * 60_000, "assistant"), at(0, "user")], T0).reply).toBe(true);
  });

  it("holds back inside the floor, so a machine cannot start a hot loop", () => {
    const r = shouldAiReply([at(DEFAULT_FLOOR_MS - 1_000, "assistant"), at(0, "user")], T0);
    expect(r.reply).toBe(false);
    expect(r.reason).toMatch(/loop/i);
  });

  it("stops after a burst and hands over", () => {
    const burst = Array.from({ length: 6 }, (_, i) => at((i + 1) * 60_000, "assistant"));
    const r = shouldAiReply([...burst, at(0, "user")], T0);
    expect(r.reply).toBe(false);
    expect(r.reason).toMatch(/handing to a person/i);
  });

  it("lets the burst budget recover once the window passes", () => {
    const old = Array.from({ length: 6 }, (_, i) => at(11 * 60_000 + i * 1_000, "assistant"));
    expect(shouldAiReply([...old, at(0, "user")], T0).reply).toBe(true);
  });

  it("replies on a brand-new conversation", () => {
    expect(shouldAiReply([at(0, "user")], T0).reply).toBe(true);
    expect(shouldAiReply([], T0).reply).toBe(true);
  });

  it("ignores the human's own messages when counting our replies", () => {
    // Twenty inbound texts in a minute must not throttle our first answer.
    const spam = Array.from({ length: 20 }, (_, i) => at(i * 1_000, "user"));
    expect(shouldAiReply(spam, T0).reply).toBe(true);
  });

  it("survives messages with missing or unparseable timestamps", () => {
    expect(shouldAiReply([{ role: "assistant" }, { role: "user" }], T0).reply).toBe(true);
    expect(
      shouldAiReply([{ role: "assistant", created_at: "not a date" }], T0).reply,
    ).toBe(true);
  });
});
