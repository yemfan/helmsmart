/**
 * CloseBoss AI team roster — the four-member AI real estate team.
 * Mirrors the HelmSmart `CORE_ROSTER` blueprint shape; apps seed their
 * per-tenant `ai_assistants` rows from this.
 */

export type AssistantType =
  | "boss_assistant"
  | "receptionist"
  | "sales_assistant"
  | "marketing_assistant"
  | "transaction_assistant"
  | "accountant";

export type AssistantDef = {
  type: AssistantType;
  name: string;
  role: string;
  mission: string;
  href: string;
  /** Skill keys from ./skills.ts */
  skills: readonly string[];
  kpis: readonly string[];
};

export const AI_TEAM: readonly AssistantDef[] = [
  {
    type: "boss_assistant",
    name: "Boss Assistant",
    role: "AI Chief of Staff",
    mission: "Help you focus on the most important actions today.",
    href: "/dashboard/boss",
    skills: [],
    kpis: ["Priorities surfaced", "Briefings delivered", "Risks flagged"],
  },
  {
    type: "receptionist",
    name: "AI Receptionist",
    role: "Inbound communication",
    mission: "Never miss a call.",
    href: "/dashboard/ai-receptionist",
    skills: [
      "lead_capture",
      "faq",
      "buyer_qualification",
      "seller_qualification",
      "appointment_scheduling",
      "transfer",
    ],
    kpis: [
      "Calls answered",
      "Leads captured",
      "Appointments booked",
      "Missed calls recovered",
    ],
  },
  {
    type: "sales_assistant",
    name: "AI Sales Assistant",
    role: "Outbound lead conversion",
    mission: "Never miss a lead.",
    href: "/dashboard/ai-sales-assistant",
    skills: [
      "speed_to_lead",
      "follow_up",
      "reactivation",
      "objection_handling",
      "appointment_scheduling",
      "lead_capture",
    ],
    kpis: [
      "Leads contacted",
      "Follow-ups completed",
      "Appointments booked",
      "Hot leads identified",
    ],
  },
  {
    // Took over demand generation from the Sales Assistant: the Sales
    // Assistant CONVERTS leads (speed-to-lead, follow-up, queue); the
    // Marketing Assistant CREATES them and keeps the Realtor visible —
    // social posts, marketing plans, templates, sphere nurture.
    type: "marketing_assistant",
    name: "AI Marketing Assistant",
    role: "Demand generation",
    mission: "Keep your pipeline full.",
    href: "/dashboard/ai-marketing-assistant",
    skills: [
      "social_content",
      "marketing_plans",
      "sphere_nurture",
      "lead_generation",
    ],
    kpis: [
      "Posts published",
      "Plans running",
      "Sphere touches",
      "New leads this month",
    ],
  },
  {
    type: "transaction_assistant",
    name: "AI Transaction Assistant",
    role: "Transaction coordination",
    mission: "Never miss a deadline.",
    href: "/dashboard/ai-transaction-assistant",
    skills: ["transaction_deadlines", "document_reminders"],
    kpis: [
      "Active transactions",
      "Upcoming deadlines",
      "Overdue items",
      "Risk alerts",
    ],
  },
  {
    // Modeled on HelmSmart's Alex (AI Finance Director). A Realtor's
    // paycheck is COMMISSION at closing — that's the headline; expenses
    // (1099 deductions) second; invoices (referral fees, vendor
    // rebills) are the edge case, not the lead.
    type: "accountant",
    name: "AI Accountant",
    role: "Money & books",
    mission: "Know what you'll make — and keep more of it.",
    href: "/dashboard/ai-accountant",
    skills: [
      "commission_tracking",
      "expense_tracking",
      "invoice_tracking",
      "payment_reminders",
    ],
    kpis: [
      "Commission pipeline",
      "Closed this year",
      "Expenses this month",
      "Next payout",
    ],
  },
] as const;

export function getAssistant(type: AssistantType): AssistantDef {
  const def = AI_TEAM.find((a) => a.type === type);
  if (!def) throw new Error(`Unknown assistant type: ${type}`);
  return def;
}
