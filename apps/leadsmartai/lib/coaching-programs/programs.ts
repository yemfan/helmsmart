/**
 * LeadSmart AI Coaching — program registry.
 *
 * Two programs sit under the umbrella:
 *   - Producer Track       — auto-enrolled on Pro+ (free)
 *   - Top Producer Track   — bundled on Premium and Team
 *
 * Metadata + targets live in code so iterating on copy + numbers
 * doesn't require a migration. The DB only tracks enrollment
 * state (lib/coaching-programs/service.ts + the
 * coaching_enrollments table).
 *
 * Pure module — vitest hits the access logic directly.
 */

import type { AgentPlan } from "@/lib/entitlements/types";

export type ProgramSlug = "producer_track" | "top_producer_track";

/** Plan tiers eligible to enroll in each program. The pricing
 *  table on /agent/pricing must stay in sync with this set. */
const PROGRAM_PLAN_ELIGIBILITY: Record<ProgramSlug, ReadonlyArray<AgentPlan>> = {
  producer_track: ["pro", "premium", "signature", "team"],
  top_producer_track: ["premium", "signature", "team"],
};

/**
 * Programs that bundle automatically (auto-enroll on plan upgrade).
 * Top Producer Track is bundled into Premium, Signature, and Team —
 * all three tiers include it as part of the plan price.
 */
const PROGRAM_AUTO_ENROLL: Record<ProgramSlug, ReadonlyArray<AgentPlan>> = {
  producer_track: ["pro", "premium", "signature", "team"],
  top_producer_track: ["premium", "signature", "team"],
};

export type CoachingProgram = {
  slug: ProgramSlug;
  /** Display name shown in UI + marketing. */
  name: string;
  tagline: string;
  /** Annual transaction target — the agent's North Star. */
  annualTransactionTarget: number;
  /** Lead-to-close conversion-rate target, percent (3 = 3%). */
  conversionRateTargetPct: number;
  /** Bullet list rendered on /agent/pricing and /agent/coaching. */
  bullets: string[];
  /** Plans that can enroll. */
  eligiblePlans: ReadonlyArray<AgentPlan>;
  /** Plans that auto-enroll (subset of eligiblePlans). */
  autoEnrollPlans: ReadonlyArray<AgentPlan>;
};

export const COACHING_PROGRAMS: Record<ProgramSlug, CoachingProgram> = {
  producer_track: {
    slug: "producer_track",
    name: "Producer Track",
    tagline:
      "Daily plans, weekly drills, monthly reviews — built into the dashboard. Free with Pro and above.",
    annualTransactionTarget: 10,
    conversionRateTargetPct: 3,
    bullets: [
      "AI-driven daily action plan tied to your sales model",
      "Weekly playbook drops + drill prompts",
      "Monthly performance review with peer benchmarks",
      "Annual target: 10 transactions, 3% lead-to-close conversion",
    ],
    eligiblePlans: PROGRAM_PLAN_ELIGIBILITY.producer_track,
    autoEnrollPlans: PROGRAM_AUTO_ENROLL.producer_track,
  },
  top_producer_track: {
    slug: "top_producer_track",
    name: "Top Producer Track",
    tagline:
      "Custom playbooks, AI deep-dives, top-10% peer benchmarks — bundled with Premium and Team.",
    annualTransactionTarget: 15,
    conversionRateTargetPct: 5,
    bullets: [
      "Everything in Producer Track, plus:",
      "Custom playbooks generated from YOUR live deals",
      "Monthly AI deep-dive (lead source ROI, drop-off heatmap)",
      "Peer benchmarks against the platform's top 10%",
      "Priority access to new AI features",
      "Annual target: 15 transactions, 5% lead-to-close conversion",
    ],
    eligiblePlans: PROGRAM_PLAN_ELIGIBILITY.top_producer_track,
    autoEnrollPlans: PROGRAM_AUTO_ENROLL.top_producer_track,
  },
};

export function getProgram(slug: ProgramSlug): CoachingProgram {
  return COACHING_PROGRAMS[slug];
}

/** All programs in display order. */
export const PROGRAM_ORDER: ProgramSlug[] = [
  "producer_track",
  "top_producer_track",
];

// ── Access predicates ─────────────────────────────────────────────

/**
 * Does the given plan tier have access to this program? Used by
 * the pricing page (gates the "Enroll" CTA), the dashboard
 * widget (decides what to render), and the service-layer guard
 * (rejects enrollment attempts for ineligible plans).
 */
export function canPlanAccessProgram(args: {
  plan: AgentPlan | null;
  program: ProgramSlug;
}): boolean {
  if (!args.plan) return false;
  return COACHING_PROGRAMS[args.program].eligiblePlans.includes(args.plan);
}

/**
 * Does the agent's plan auto-enroll them in this program? The
 * service-layer hook in `service.ts` reads this when the agent's
 * plan changes — newly-eligible programs auto-add an enrollment
 * row, unless the agent has previously opted out.
 */
export function planAutoEnrollsProgram(args: {
  plan: AgentPlan | null;
  program: ProgramSlug;
}): boolean {
  if (!args.plan) return false;
  return COACHING_PROGRAMS[args.program].autoEnrollPlans.includes(args.plan);
}

/** All programs the given plan is eligible for, in display order. */
export function programsForPlan(plan: AgentPlan | null): CoachingProgram[] {
  if (!plan) return [];
  return PROGRAM_ORDER.map((s) => COACHING_PROGRAMS[s]).filter((p) =>
    p.eligiblePlans.includes(plan),
  );
}
