import { describe, expect, it } from "vitest";

import {
  ACTIVATION_STEP_IDS,
  activationState,
  activationStepDone,
  hasOpenDay,
  parseStepId,
  type ActivationFacts,
} from "@/lib/activation";
import { defaultBusinessHours } from "@/lib/receptionist";

/**
 * The setup checklist has no stored "completed" flag, so these rules ARE the
 * feature: they decide what the wizard opens on, which lines /home shows
 * struck through, and when the card stops appearing at all. Getting one wrong
 * is not a cosmetic bug — it either strands an owner on a step they finished
 * or reports an account as set up when the phone would ring out.
 */

const EMPTY: ActivationFacts = {
  businessDescription: null,
  businessCategory: null,
  greeting: null,
  prompt: null,
  businessHours: null,
  appointmentTypeCount: 0,
  twilioNumber: null,
  firstInboundCallAt: null,
};

const FULL: ActivationFacts = {
  businessDescription: "We fix boilers.",
  businessCategory: "Plumbing",
  greeting: "Thanks for calling Acme!",
  prompt: "## BUSINESS\nName: Acme",
  businessHours: defaultBusinessHours(),
  appointmentTypeCount: 2,
  twilioNumber: "+16265550100",
  firstInboundCallAt: "2026-09-12T10:00:00.000Z",
};

describe("activationState", () => {
  it("starts a brand-new org on the first step with nothing done", () => {
    const state = activationState(EMPTY);
    expect(state.done).toBe(0);
    expect(state.complete).toBe(false);
    expect(state.next).toBe("basics");
    expect(state.steps.map((s) => s.id)).toEqual([...ACTIVATION_STEP_IDS]);
  });

  it("is complete only once a call has actually arrived", () => {
    expect(activationState(FULL).complete).toBe(true);
    expect(activationState({ ...FULL, firstInboundCallAt: null }).complete).toBe(false);
    expect(activationState({ ...FULL, firstInboundCallAt: null }).next).toBe("call");
  });

  it("points at the FIRST outstanding step, not the last", () => {
    // A number saved before the hours were — the order the wizard walks is not
    // the order an owner necessarily fills things in.
    const state = activationState({ ...EMPTY, businessCategory: "Plumbing", twilioNumber: "+16265550100" });
    expect(state.next).toBe("script");
    expect(state.done).toBe(2);
  });
});

describe("each step reads its own rows", () => {
  it("does not count the business name as knowing the business", () => {
    // createOrg always has a name, so counting it would tick this for every
    // account the instant it existed.
    expect(activationStepDone("basics", EMPTY)).toBe(false);
    expect(activationStepDone("basics", { ...EMPTY, businessCategory: "Plumbing" })).toBe(true);
    expect(activationStepDone("basics", { ...EMPTY, businessDescription: "We fix boilers." })).toBe(true);
  });

  it("needs both a greeting and a briefing before the script is done", () => {
    expect(activationStepDone("script", { ...EMPTY, greeting: "Hi!" })).toBe(false);
    expect(activationStepDone("script", { ...EMPTY, prompt: "## BUSINESS" })).toBe(false);
    expect(activationStepDone("script", { ...EMPTY, greeting: "Hi!", prompt: "## BUSINESS" })).toBe(true);
  });

  it("needs both open hours and something to book", () => {
    const hours = defaultBusinessHours();
    expect(activationStepDone("hours", { ...EMPTY, businessHours: hours })).toBe(false);
    expect(activationStepDone("hours", { ...EMPTY, appointmentTypeCount: 1 })).toBe(false);
    expect(activationStepDone("hours", { ...EMPTY, businessHours: hours, appointmentTypeCount: 1 })).toBe(true);
  });

  it("treats whitespace as empty", () => {
    expect(activationStepDone("basics", { ...EMPTY, businessDescription: "   " })).toBe(false);
    expect(activationStepDone("number", { ...EMPTY, twilioNumber: " " })).toBe(false);
  });
});

describe("hasOpenDay", () => {
  it("is false for no hours at all, and for a week of closed days", () => {
    expect(hasOpenDay(null)).toBe(false);
    expect(
      hasOpenDay({ mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }),
    ).toBe(false);
  });

  it("is true when even one day is open", () => {
    expect(
      hasOpenDay({
        mon: null,
        tue: null,
        wed: null,
        thu: null,
        fri: null,
        sat: { open: "10:00", close: "14:00" },
        sun: null,
      }),
    ).toBe(true);
  });
});

describe("parseStepId", () => {
  it("accepts only the steps that exist", () => {
    expect(parseStepId("script")).toBe("script");
    expect(parseStepId(["number"])).toBe("number");
    expect(parseStepId("nonsense")).toBeNull();
    expect(parseStepId(undefined)).toBeNull();
    // A query param is whatever the browser sends; nothing here trusts it.
    expect(parseStepId("__proto__")).toBeNull();
  });
});
