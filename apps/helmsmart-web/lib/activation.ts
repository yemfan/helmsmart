/**
 * How far a new owner has got, derived from what the database actually holds.
 *
 * There is no `onboarding_completed` flag anywhere in this app, and adding one
 * would be the wrong shape: a flag records that someone pressed Next, not that
 * the receptionist can answer a call. Every step below is decided by reading
 * the row the step writes, so a setup abandoned halfway resumes exactly where
 * it stopped, a setting changed later in Settings moves the checklist with it,
 * and nothing can report "set up" over an org that is not.
 *
 * The definitions are the ones `components/receptionist-setup.tsx` already
 * uses for the same facts — number, hours, appointment types — so the two
 * screens cannot disagree about what "ready" means.
 *
 * Pure module. No Supabase, no cookies, no i18n: the page loads the facts, this
 * decides what they mean, and `lib/activation.test.ts` pins the decisions.
 */
import type { BusinessHours } from "@/lib/receptionist";

/** In the order the owner walks them. */
export const ACTIVATION_STEP_IDS = ["basics", "script", "hours", "number", "call"] as const;

export type ActivationStepId = (typeof ACTIVATION_STEP_IDS)[number];

/** Everything the state depends on, read straight off the org's own rows. */
export type ActivationFacts = {
  /** organizations.business_description */
  businessDescription: string | null;
  /** organizations.business_category */
  businessCategory: string | null;
  /** organizations.voice_agent_greeting */
  greeting: string | null;
  /** organizations.voice_agent_prompt — Emma's business context */
  prompt: string | null;
  /** organizations.business_hours */
  businessHours: BusinessHours | null;
  /** rows in appointment_types for this org */
  appointmentTypeCount: number;
  /** organizations.twilio_number */
  twilioNumber: string | null;
  /**
   * The first inbound `voice_sessions` row for this org, if there is one. A
   * call that actually arrived is the only evidence of activation this app can
   * honestly produce, so it is the one it uses.
   */
  firstInboundCallAt: string | null;
};

export type ActivationStep = { id: ActivationStepId; done: boolean };

export type ActivationState = {
  steps: ActivationStep[];
  /** How many of the five are done. */
  done: number;
  total: number;
  complete: boolean;
  /** The first step still outstanding — where "Continue setup" points. */
  next: ActivationStepId | null;
};

function filled(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/** At least one day the business is open. Same test as the Settings checklist. */
export function hasOpenDay(hours: BusinessHours | null): boolean {
  return hours ? Object.values(hours).some(Boolean) : false;
}

/** Whether each step's own rows are in place. */
export function activationStepDone(step: ActivationStepId, f: ActivationFacts): boolean {
  switch (step) {
    // Something beyond the business name for Emma to be briefed from. The name
    // alone is not it: `createOrg` always has one, so counting it would tick
    // this box for every account the moment it existed.
    case "basics":
      return filled(f.businessDescription) || filled(f.businessCategory);
    // What Emma opens with and what she knows. Both, because a greeting over an
    // empty context is a receptionist who can say hello and nothing else.
    case "script":
      return filled(f.greeting) && filled(f.prompt);
    // When to book and what to book. One without the other books nothing.
    case "hours":
      return hasOpenDay(f.businessHours) && f.appointmentTypeCount > 0;
    case "number":
      return filled(f.twilioNumber);
    case "call":
      return Boolean(f.firstInboundCallAt);
  }
}

export function activationState(f: ActivationFacts): ActivationState {
  const steps = ACTIVATION_STEP_IDS.map((id) => ({ id, done: activationStepDone(id, f) }));
  const done = steps.filter((s) => s.done).length;
  return {
    steps,
    done,
    total: steps.length,
    complete: done === steps.length,
    next: steps.find((s) => !s.done)?.id ?? null,
  };
}

/** The step a `?step=` query param names, or null when it names nothing real. */
export function parseStepId(value: string | string[] | undefined): ActivationStepId | null {
  const v = Array.isArray(value) ? value[0] : value;
  return ACTIVATION_STEP_IDS.includes(v as ActivationStepId) ? (v as ActivationStepId) : null;
}
