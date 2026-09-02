import { describe, it, expect } from "vitest";
import { buildSystemPrompt, type ReceptionistContext } from "../prompt";
import {
  GENERAL_BUSINESS_PROFILE,
  REAL_ESTATE_PROFILE,
  verticalProfile,
} from "../vertical";

const base: ReceptionistContext = {
  orgId: "org1",
  orgName: "Acme",
  orgNameZh: "Acme",
  agentName: "Emma",
  twilioNumber: "+16265551234",
  timezone: "America/Los_Angeles",
  todayISO: "2026-09-01",
  todayLabel: "Tuesday, September 1",
  hoursText: "Monday: 09:00–17:00",
  typesText: "- Consultation (30 min)",
  knowledgeText: "We do things.",
  extraNotes: "",
  greeting: "",
};

/** Wording that is true of a brokerage and false of a plumber or a clinic. */
const REAL_ESTATE_ONLY = [
  "brokerage",
  "licensed agent",
  "what a home is worth",
  "buying or selling",
  "days on market",
  "the Realtor",
  "buyer or seller",
];

describe("vertical profiles", () => {
  it("keeps the real-estate wording when that profile is named", () => {
    const prompt = buildSystemPrompt({ ...base, profile: REAL_ESTATE_PROFILE });
    for (const phrase of REAL_ESTATE_ONLY) {
      expect(prompt, `expected the real-estate prompt to contain "${phrase}"`).toContain(phrase);
    }
  });

  it("says nothing about real estate under the general profile", () => {
    // The bug this exists to prevent: HelmSmart's only voice tenant is a plumbing
    // business, and it was telling callers it could not say what a home is worth.
    const prompt = buildSystemPrompt({ ...base, profile: GENERAL_BUSINESS_PROFILE });
    for (const phrase of REAL_ESTATE_ONLY) {
      expect(prompt, `general prompt should not mention "${phrase}"`).not.toContain(phrase);
    }
  });

  it("defaults to neutral, so a context that names no trade never wears another's", () => {
    expect(buildSystemPrompt(base)).toBe(buildSystemPrompt({ ...base, profile: GENERAL_BUSINESS_PROFILE }));
  });

  it("still refuses to invent facts under the general profile", () => {
    // Neutral must not mean toothless — the restraint is the point, only the
    // examples change.
    const prompt = buildSystemPrompt({ ...base, profile: GENERAL_BUSINESS_PROFILE });
    expect(prompt).toContain("You are the assistant, NOT the professional");
    expect(prompt).toContain("what the work will cost");
    expect(prompt).toContain("Route every one of them.");
    expect(prompt).toContain("never from you");
  });

  it("keeps the shared machinery identical across profiles", () => {
    const re = buildSystemPrompt({ ...base, profile: REAL_ESTATE_PROFILE });
    const gen = buildSystemPrompt({ ...base, profile: GENERAL_BUSINESS_PROFILE });
    for (const shared of [
      "call check_availability first",
      "call lookup_appointment FIRST",
      "A phone number is DIGITS, never a quantity.",
      "Business hours:",
      "- Consultation (30 min)",
    ]) {
      expect(re).toContain(shared);
      expect(gen).toContain(shared);
    }
  });

  it("resolves a profile by id and falls back to neutral, not to real estate", () => {
    expect(verticalProfile("real_estate")).toBe(REAL_ESTATE_PROFILE);
    expect(verticalProfile("general_business")).toBe(GENERAL_BUSINESS_PROFILE);
    expect(verticalProfile("dental")).toBe(GENERAL_BUSINESS_PROFILE);
    expect(verticalProfile(null)).toBe(GENERAL_BUSINESS_PROFILE);
    expect(verticalProfile("")).toBe(GENERAL_BUSINESS_PROFILE);
  });
});
