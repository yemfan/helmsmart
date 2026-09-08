import { describe, expect, it } from "vitest";

import { callWorthAContact, looksLikeRecordedMessage } from "../callWorthAContact";

describe("callWorthAContact", () => {
  it("drops the three calls that were on the Leads tab", () => {
    expect(
      callWorthAContact({
        durationSeconds: 12,
        summary:
          "AI call summary: The agent greeted the caller, but the call was disconnected by the user after 12 seconds without further conversation.",
      }),
    ).toBe(false);
    expect(
      callWorthAContact({
        durationSeconds: 6,
        summary:
          "AI call summary: The agent greeted the caller, but the user hung up almost immediately without engaging in conversation.",
      }),
    ).toBe(false);
    expect(
      callWorthAContact({
        durationSeconds: 48,
        summary:
          "AI call summary: The user called and left a message about a time-sensitive loan approval for $57,000 at a 6% rate, instructing the recipient to press 2 to speak with a specialist or press 9 to cancel.",
      }),
    ).toBe(false);
  });

  it("keeps anyone who identified themselves or their intent, however short", () => {
    expect(callWorthAContact({ name: "Hong Yang", durationSeconds: 9, summary: "Caller gave name and hung up." })).toBe(true);
    expect(callWorthAContact({ partyType: "buyer", durationSeconds: 10, summary: "Wants to buy in Alhambra." })).toBe(true);
    expect(callWorthAContact({ timeline: "this spring", durationSeconds: 10, summary: "Thinking about selling." })).toBe(true);
  });

  it("keeps an unnamed caller who actually talked", () => {
    expect(
      callWorthAContact({
        durationSeconds: 95,
        summary: "The caller asked about open house hours for the Garvey Ave listing and said they would drive by.",
      }),
    ).toBe(true);
  });

  it("treats unknown duration as long enough", () => {
    expect(callWorthAContact({ durationSeconds: null, summary: "The caller asked a question about the area." })).toBe(true);
  });

  it("does not mistake a person mentioning a topic for a robocall", () => {
    expect(looksLikeRecordedMessage("The caller asked whether the seller would consider a loan contingency.")).toBe(false);
    expect(looksLikeRecordedMessage("A recorded message about an extended warranty, press 1 to continue.")).toBe(true);
  });
});
