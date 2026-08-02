/**
 * Sales Model System — central config.
 *
 * The whole feature is data-driven from this object. Adding a new model
 * means adding one entry here; every screen (onboarding, dashboard,
 * identity block, daily plan, tools grid, script generator, pipeline)
 * reads from `salesModels[id]` so the UI stays single-sourced.
 *
 * Why this lives in `lib/` (not `data/`):
 *   - Imported by both server pages (onboarding fetcher, validation)
 *     and client components (dashboard, dropdown). Keeping it framework-
 *     agnostic and free of `"server-only"` lets both sides share it.
 *
 * Validation rule: `SalesModelId` is the source of truth for legal
 * values. The Supabase `agent_profiles.sales_model` column gets a
 * matching CHECK constraint so a bad client write fails at the DB.
 */

export type SalesModelId = "influencer" | "closer" | "advisor" | "custom";

export type ScriptKind =
  | "dm_reply"
  | "follow_up"
  | "objection_handling"
  | "appointment_setting"
  | "consultation_opening";

export type SalesModel = {
  id: SalesModelId;
  name: string;
  /** One-line tagline, ~3-5 words. Used on cards as a subtitle. */
  label: string;
  /** Pulled-out attribution. "Inspired by …" copy. */
  inspiredBy: string;
  emoji: string;
  /** Marketing one-liner. Ends with a period. */
  description: string;
  bestFor: string[];
  strengths: string[];
  /** Hero block headline on the dashboard. */
  identityTitle: string;
  /** One-sentence philosophy shown under the identity title. */
  philosophy: string;
  tone: string;
  leadTypes: string[];
  /** 4-6 daily tasks. Order matters — top is the most important. */
  tasks: string[];
  /** Tool card titles. The tool grid renders one card per entry. */
  tools: string[];
  /** Pipeline stages, left → right. */
  pipeline: string[];
  /**
   * Marks the recommended default. Exactly one model should set this
   * to true (currently `advisor`). The onboarding card surfaces a
   * "Recommended" badge.
   */
  recommended?: boolean;
};

export const salesModels: Record<SalesModelId, SalesModel> = {
  // Internal key kept as "influencer" (was the "Influencer Model") so we
  // avoid a DB CHECK-constraint migration + agent_profiles data migration
  // and don't disturb the id-keyed branches (tone rules, pipeline stages).
  // Displayed everywhere as "Friendly Connector" to match the marketing
  // Sales Style Engine (i18n web_landing styles.connector). CB-BFD-002 U2-6.
  influencer: {
    id: "influencer",
    name: "Friendly Connector",
    label: "Relationship-First",
    inspiredBy: "warm, personable agents who win on relationships and referrals",
    emoji: "🤝",
    description:
      "Win through warmth, real relationships, and staying genuinely in touch.",
    bestFor: ["First-time buyers", "Social-media leads", "Sphere & referrals"],
    strengths: ["Rapport building", "DM & text conversion", "Staying top-of-mind"],
    identityTitle: "You are operating as a Friendly Connector",
    philosophy:
      "Lead with relationships — be warm, human, and consistently in touch so people actually reply.",
    tone: "Warm, casual, personable, relationship-first",
    leadTypes: ["First-time buyers", "Social media leads", "Sphere & referrals", "Warm inbound leads"],
    tasks: [
      "Check in with 5 sphere or past clients",
      "Reply to every social DM and text",
      "Follow up with 3 warm leads",
      "Send one helpful, personal note — no ask",
      "Invite one warm contact to a friendly consult",
    ],
    tools: [
      "Instagram Caption Generator",
      "DM Reply Assistant",
      "Message Composer",
      "Content Calendar",
      "Contact Manager",
    ],
    pipeline: ["Audience", "DM Lead", "Qualified", "Consultation", "Client", "Closed"],
  },

  closer: {
    id: "closer",
    name: "Closer Model",
    label: "Scripted Prospecting",
    inspiredBy: "Mike Ferry-style discipline, scripts, and follow-up",
    emoji: "📞",
    description:
      "Win through prospecting, structure, objection handling, and daily discipline.",
    bestFor: ["Seller leads", "Expired listings", "High-volume prospecting"],
    strengths: ["Scripts", "Follow-up", "Appointment setting"],
    identityTitle: "You are operating as a High-Performance Closer",
    philosophy:
      "Control your pipeline through daily action, strong scripts, and confident follow-up.",
    tone: "Direct, structured, confident, action-oriented",
    leadTypes: ["Expired listings", "FSBO", "Seller leads", "Cold prospects"],
    tasks: [
      "Make 20 prospecting calls",
      "Follow up with 10 previous leads",
      "Practice one objection script",
      "Book one appointment",
      "Update all active pipeline statuses",
    ],
    tools: [
      "Cold Call Script Generator",
      "Objection Handler",
      "Follow-up Script Generator",
      "Appointment Setter",
      "Daily Prospecting Plan",
    ],
    pipeline: ["Prospect", "Contacted", "Qualified", "Appointment", "Agreement", "Closed"],
  },

  advisor: {
    id: "advisor",
    name: "Advisor Model",
    label: "Trust-Based Strategy",
    inspiredBy: "Strategic advisor style for high-trust client relationships",
    emoji: "🧠",
    recommended: true,
    description:
      "Win through trust, analysis, education, and risk reduction.",
    bestFor: ["Buyers", "Investors", "Chinese-speaking clients", "High-trust sales"],
    strengths: ["Client analysis", "Decision frameworks", "Risk reduction"],
    identityTitle: "You are operating as a Strategic Real Estate Advisor",
    philosophy:
      "Help clients think clearly, reduce risk, and make confident real estate decisions.",
    tone: "Calm, analytical, trustworthy, client-first",
    leadTypes: ["Buyer leads", "Investor leads", "Relocation clients", "Referral clients"],
    tasks: [
      "Review 3 new leads",
      "Run 2 client analyses",
      "Send 2 strategic follow-ups",
      "Prepare one market insight",
      "Schedule one consultation",
    ],
    tools: [
      "Client Analyzer",
      "Buyer Strategy Generator",
      "Property Risk Assessment",
      "Market Insight Generator",
      "Consultation Script Builder",
    ],
    pipeline: ["Lead", "Discovery", "Analysis", "Strategy", "Decision", "Agreement", "Closed"],
  },

  /**
   * Custom — escape hatch for agents who don't want to be boxed into one
   * style. Uses the standard LeadSmart workflow + neutral defaults so
   * everything still renders, but the tone the script generator picks is
   * deliberately model-agnostic and the daily plan / tools / pipeline are
   * the generic LeadSmart CRM defaults the agent can later override from
   * Settings. (The override surface is post-MVP — this commit just lets
   * agents pick "Custom" without forcing them to live with a tone that
   * doesn't fit.)
   */
  custom: {
    id: "custom",
    name: "Custom Model",
    label: "Your Own Playbook",
    inspiredBy: "Your own workflow — LeadSmart's standard CRM, your tone",
    emoji: "⚙️",
    description:
      "Use the standard LeadSmart workflow and define your own tone, tasks, and pipeline.",
    bestFor: [
      "Established agents with their own process",
      "Hybrid styles",
      "Teams with custom workflows",
    ],
    strengths: ["Flexibility", "No imposed tone", "Bring your own playbook"],
    identityTitle: "You are operating in Custom Mode",
    philosophy:
      "Use LeadSmart's standard CRM and shape every screen, script, and pipeline stage to your own approach.",
    tone: "Neutral — define your own voice in Settings",
    leadTypes: ["Any lead type", "Mixed sources", "Custom segments"],
    tasks: [
      "Review new leads",
      "Follow up with active conversations",
      "Update your pipeline",
      "Send one piece of personal outreach",
      "Plan tomorrow's priorities",
    ],
    tools: [
      "Contact Manager",
      "Lead Inbox",
      "Message Composer",
      "Property Tools",
      "Marketing Plans",
    ],
    pipeline: ["Lead", "Contacted", "Qualified", "Negotiation", "Closed"],
  },
};

/** All models in canonical display order (recommended first on cards). */
export const SALES_MODEL_ORDER: SalesModelId[] = [
  "advisor",
  "influencer",
  "closer",
  "custom",
];

export const DEFAULT_SALES_MODEL: SalesModelId = "advisor";

export function isSalesModelId(value: unknown): value is SalesModelId {
  return (
    value === "influencer" ||
    value === "closer" ||
    value === "advisor" ||
    value === "custom"
  );
}

/** Throws on an unknown id — use after `isSalesModelId` validation. */
export function getSalesModel(id: SalesModelId): SalesModel {
  return salesModels[id];
}

/**
 * Script kinds available in the dropdown. Order = display order.
 */
export const SCRIPT_KINDS: Array<{ value: ScriptKind; label: string }> = [
  { value: "dm_reply", label: "DM Reply" },
  { value: "follow_up", label: "Follow-up" },
  { value: "objection_handling", label: "Objection Handling" },
  { value: "appointment_setting", label: "Appointment Setting" },
  { value: "consultation_opening", label: "Consultation Opening" },
];
