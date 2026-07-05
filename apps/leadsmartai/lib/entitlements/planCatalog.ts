import type { AgentPlan } from "./types";

/** Per-minute overage rate (USD) billed on AI voice minutes past the plan's
 *  monthly cap, on tiers where `allowsVoiceOverage` is true. */
export const VOICE_OVERAGE_RATE_USD = 0.25;

/** Canonical plan ids stored in product_entitlements.plan */
export const AGENT_PLANS = [
  "starter",
  "growth",
  "elite",
  "signature",
  "team",
] as const;

export type PlanCatalogEntry = {
  label: string;
  cmaReportsPerDay: number;
  /** null = unlimited (Elite); negative kept for legacy parity */
  maxLeads: number | null;
  maxContacts: number | null;
  alertsLevel: "basic" | "full" | "advanced";
  reportsDownloadLevel: "limited" | "full" | "unlimited";
  teamAccess: boolean;
  /** Maximum members on a team (including owner). Null = unlimited.
   *  0 means the plan can't run a team — paired with teamAccess=false.
   *  Owner counts as one seat; pending invites also occupy a seat so
   *  the owner can't oversubscribe by inviting many emails at once. */
  teamSeatCap: number | null;
  /**
   * Monthly cap on AI-bearing actions (deal review, growth opps,
   * AI SMS draft, AI deal commentary, etc.). NULL = unlimited.
   * CMA reports are NOT counted here — they have their own daily
   * cap via `cmaReportsPerDay`.
   */
  aiActionsPerMonth: number | null;
  /**
   * Monthly cap on AI **voice** minutes (Retell receptionist + AI
   * sales calls). Metered per call, rounded up to whole minutes.
   * NULL = unlimited. For `team` this is the pooled base for the
   * minimum roster; per-seat scaling is applied at enforcement time.
   */
  voiceMinutesPerMonth: number | null;
  /**
   * Whether the plan may exceed `voiceMinutesPerMonth` and bill overage
   * (paid tiers, at `VOICE_OVERAGE_RATE_USD`/min) instead of hard-stopping
   * at the cap (free Starter).
   */
  allowsVoiceOverage: boolean;
  /**
   * LeadSmart AI Coaching programs bundled with this tier. Slugs
   * match `lib/coaching-programs/programs.ts:ProgramSlug`. Empty
   * array means no coaching access — the dashboard widget hides;
   * the pricing page surfaces an "Upgrade for coaching" CTA.
   */
  coachingPrograms: string[];
  /** Marketing bullets for comparison UI */
  bullets: string[];
};

/** -1 = unlimited for numeric caps */
export const PLAN_CATALOG: Record<AgentPlan, PlanCatalogEntry> = {
  starter: {
    label: "Starter",
    cmaReportsPerDay: 2,
    maxLeads: 5,
    maxContacts: 50,
    alertsLevel: "basic",
    reportsDownloadLevel: "limited",
    teamAccess: false,
    teamSeatCap: 0,
    aiActionsPerMonth: 100,
    voiceMinutesPerMonth: 15,
    allowsVoiceOverage: false,
    coachingPrograms: [],
    bullets: [
      "Up to 5 leads · 50 contacts",
      "2 CMA reports / day",
      "AI SMS + email responder (basic)",
      "Click-to-call (Twilio bridge)",
      "Custom fields on contacts",
      "Reviews & testimonial capture",
      "Mobile app",
      "100 AI actions / month",
      "15 AI voice minutes / month",
    ],
  },
  growth: {
    label: "Pro",
    cmaReportsPerDay: 5,
    maxLeads: 500,
    maxContacts: 500,
    alertsLevel: "full",
    reportsDownloadLevel: "full",
    teamAccess: false,
    teamSeatCap: 0,
    aiActionsPerMonth: 5000,
    voiceMinutesPerMonth: 100,
    allowsVoiceOverage: true,
    coachingPrograms: ["producer_track"],
    bullets: [
      "Everything in Starter, plus:",
      "Up to 500 leads · 500 contacts",
      "5 CMA reports / day",
      "Email open / click tracking",
      "Video email (record & send)",
      "Newsletter / mass-email composer",
      "Listing presentation builder",
      "Vanity / call-tracking numbers",
      "Sphere prediction + equity signals",
      "Buyer Broker Agreement (BBA) workflow",
      "5,000 AI actions / month",
      "100 AI voice minutes / month",
    ],
  },
  elite: {
    label: "Elite",
    cmaReportsPerDay: 10,
    maxLeads: null,
    maxContacts: null,
    alertsLevel: "advanced",
    reportsDownloadLevel: "unlimited",
    teamAccess: true,
    teamSeatCap: 10,
    aiActionsPerMonth: null,
    voiceMinutesPerMonth: 300,
    allowsVoiceOverage: true,
    coachingPrograms: ["producer_track", "top_producer_track"],
    bullets: [
      "Everything in Pro, plus:",
      "Unlimited leads & contacts",
      "Top Producer Track coaching included",
      "ISA workflow + qualified handoff",
      "E-signature workflow (Dotloop / DocuSign)",
      "Advanced AI coaching + peer benchmarks",
      "Unlimited AI actions",
      "300 AI voice minutes / month",
      "Priority support",
    ],
  },
  signature: {
    // For relationship-driven agents serving high-value and bilingual
    // clients. Inherits everything from Premium (`elite`) and adds the
    // five Signature-only features. Display copy refinements + the
    // dark-navy/gold visual treatment live in the pricing-page work
    // (PR 3); this entry is the data spine.
    label: "Signature",
    cmaReportsPerDay: 10,
    maxLeads: null,
    maxContacts: null,
    alertsLevel: "advanced",
    reportsDownloadLevel: "unlimited",
    teamAccess: true,
    teamSeatCap: 10,
    aiActionsPerMonth: null,
    voiceMinutesPerMonth: 600,
    allowsVoiceOverage: true,
    coachingPrograms: ["producer_track", "top_producer_track"],
    bullets: [
      "Everything in Premium, plus:",
      "600 AI voice minutes / month",
      "Sphere Intelligence Pro — equity tracking, life-event signals, referral mapping",
      "White-glove onboarding — 1:1 setup with a specialist, sphere import included",
      "Concierge support — priority response, named account contact",
      "Cultural calendar automations — Chinese New Year, Mid-Autumn, Lunar holidays auto-pause / auto-greet",
      "Custom voice tuning — AI trained on your past conversations for tone match",
    ],
  },
  team: {
    label: "Team",
    cmaReportsPerDay: 10,
    maxLeads: null,
    maxContacts: null,
    alertsLevel: "advanced",
    reportsDownloadLevel: "unlimited",
    teamAccess: true,
    teamSeatCap: 5,
    aiActionsPerMonth: null,
    voiceMinutesPerMonth: 900,
    allowsVoiceOverage: true,
    coachingPrograms: ["producer_track", "top_producer_track"],
    bullets: [
      "Everything in Premium, plus:",
      "900 AI voice minutes / month (pooled across seats)",
      "Up to 5 team seats (contact sales for more)",
      "Round-robin lead routing across the roster",
      "Per-member breakdown reporting",
      "Roster-wide dashboard rollups",
      "Top Producer Track for every team member",
      "Team owner controls + seat invites",
    ],
  },
};

/**
 * Dollar overage owed for a month's voice usage on a plan. Zero when the
 * plan doesn't allow overage (Starter), has no finite cap, or usage is within
 * the cap. Consumed by the billing job / usage UI.
 */
export function voiceOverageUsd(plan: AgentPlan, minutesUsed: number): number {
  const p = PLAN_CATALOG[plan];
  if (!p || !p.allowsVoiceOverage || p.voiceMinutesPerMonth == null) return 0;
  const over = Math.max(0, minutesUsed - p.voiceMinutesPerMonth);
  return Number((over * VOICE_OVERAGE_RATE_USD).toFixed(2));
}

/**
 * Map a leadsmart_users.plan billing slug to the canonical AgentPlan used
 * by product_entitlements. The user row uses the marketing dialect
 * (free / pro / premium / signature / team — "free" stands in for starter);
 * entitlements use starter / growth / elite / signature / team.
 */
export function planSlugToAgentPlan(slug: string | null | undefined): AgentPlan {
  switch ((slug ?? "").toLowerCase()) {
    case "pro":
      return "growth";
    case "premium":
      return "elite";
    case "signature":
      return "signature";
    case "team":
      return "team";
    case "free":
    case "starter":
    default:
      return "starter";
  }
}

/**
 * Inverse of planSlugToAgentPlan: AgentPlan → the leadsmart_users.plan
 * billing slug ("free" for starter). Use when writing the user row so its
 * dialect stays consistent.
 */
export function agentPlanToUserSlug(plan: AgentPlan): string {
  switch (plan) {
    case "growth":
      return "pro";
    case "elite":
      return "premium";
    case "signature":
      return "signature";
    case "team":
      return "team";
    case "starter":
    default:
      return "free";
  }
}

export function planRowFromCatalog(plan: AgentPlan): {
  plan: string;
  cma_reports_per_day: number;
  max_leads: number | null;
  max_contacts: number | null;
  alerts_level: string;
  reports_download_level: string;
  team_access: boolean;
  ai_actions_per_month: number | null;
  voice_minutes_per_month: number | null;
} {
  const p = PLAN_CATALOG[plan];
  return {
    plan,
    cma_reports_per_day: p.cmaReportsPerDay,
    max_leads: p.maxLeads,
    max_contacts: p.maxContacts,
    alerts_level: p.alertsLevel,
    reports_download_level: p.reportsDownloadLevel,
    team_access: p.teamAccess,
    ai_actions_per_month: p.aiActionsPerMonth,
    voice_minutes_per_month: p.voiceMinutesPerMonth,
  };
}
