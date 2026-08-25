/**
 * CloseBoss skill library — modular skills attachable to assistants.
 *
 * Keys are stable identifiers: they're seeded into the `ai_skills`
 * table and stored in `ai_assistants.enabled_skills`, so renaming a
 * key is a data migration, not a refactor.
 */

export type SkillCategory =
  | "reception"
  | "qualification"
  | "scheduling"
  | "conversion"
  | "marketing"
  | "transaction"
  | "finance";

export type Skill = {
  key: string;
  name: string;
  description: string;
  category: SkillCategory;
  /** Prompt fragment appended to the owning assistant's system prompt. */
  prompt: string;
  /** One-line variant for the live voice channel (kept short — it rides
   *  inside the per-call system prompt). Omitted = skill is not
   *  voice-relevant (e.g. transaction checklist skills). */
  voiceLine?: string;
};

export const SKILLS: readonly Skill[] = [
  {
    key: "lead_capture",
    name: "Lead Capture",
    description: "Capture required contact info and create/update the lead record.",
    category: "reception",
    prompt: `When speaking with a new contact, capture: name, phone, email, source, and buyer/seller intent. Create or update the lead record with everything you learn.`,
    voiceLine: "Always collect the caller's name, phone, email, and whether they're looking to buy or sell.",
  },
  {
    key: "buyer_qualification",
    name: "Buyer Qualification",
    description: "Determine buyer readiness and lead temperature.",
    category: "qualification",
    prompt: `For buyers, learn: desired area, budget, property type, timeline, pre-approval status, and current housing situation. Classify lead temperature as hot, warm, or cold based on timeline and financing readiness.`,
    voiceLine: "For buyers, ask about desired area, budget, timeline, and whether they're pre-approved for financing.",
  },
  {
    key: "seller_qualification",
    name: "Seller Qualification",
    description: "Determine seller opportunity and lead temperature.",
    category: "qualification",
    prompt: `For sellers, learn: property address, property type, timeline, motivation, desired price if offered, and whether they want a home valuation. Classify lead temperature as hot, warm, or cold.`,
    voiceLine: "For sellers, ask for the property address, their selling timeline, and whether they'd like a home valuation.",
  },
  {
    key: "appointment_scheduling",
    name: "Appointment Scheduling",
    description: "Book consultations, showings, listing appointments, or demos.",
    category: "scheduling",
    prompt: `When booking an appointment, confirm: appointment type, date and time, timezone, attendees, and location or meeting method. Repeat the details back to confirm before booking.`,
    voiceLine:
      "OFFER the appointment — don't wait to be asked, and don't settle for \"the Realtor will call you back\". Once a caller shows real interest in buying or selling, propose a specific time (\"Thursday at 2, or Friday morning — which suits you?\") instead of asking whether they'd like to schedule something. A booked appointment is the result; a promised call-back is what you fall back to only if they won't commit to a time.",
  },
  {
    key: "faq",
    voiceLine:
      "Answer what you actually know from the business information you were given — hours, areas served, how the process works, what the Realtor does. Say plainly when something isn't yours to answer, and offer to have it answered properly rather than guessing.",
    name: "FAQ",
    description: "Answer approved business FAQs from the knowledge base.",
    category: "reception",
    prompt: `Answer questions only from the approved business knowledge base. If the answer is not in the knowledge base, say you will have the Realtor follow up, and log the question.`,
  },
  {
    key: "transfer",
    name: "Transfer / Escalation",
    description: "Transfer or escalate urgent calls to the Realtor.",
    category: "reception",
    prompt: `Escalate to the Realtor when: the caller asks for a human, there is a transaction emergency, a legal or contract issue, a complaint, an active client issue, a ready-to-list seller, or a ready-to-offer buyer.`,
    voiceLine: "Treat a ready-to-list seller, ready-to-offer buyer, active-client issue, complaint, or legal/contract question as urgent: take their details and promise a prompt call-back from the Realtor.",
  },
  {
    key: "buyer_motivation",
    name: "Buyer Motivation",
    description: "Understand WHY the caller is moving, not just what they want to buy.",
    category: "qualification",
    prompt: `Find out what is actually driving the move: a growing family, a commute, schools, a lease ending, an investment, a relocation. Motivation is what tells you whether a "6 to 12 months" timeline is real or soft, and it is what the Realtor needs before the first meeting. Ask it the way a person would, not the way a form would.`,
    voiceLine:
      "Ask what's behind the move — family, schools, commute, a lease ending, investment — and listen. The reason tells you more about their timeline than the timeline does.",
  },
  {
    key: "buy_sell_contingency",
    name: "Buy / Sell Contingency",
    description: "Find out whether the buyer has to sell an existing home first.",
    category: "qualification",
    prompt: `Ask every buyer whether they own now, and if so whether that home has to sell before they can close. A buyer with a house to sell is two transactions, a different timeline, and often a listing the Realtor would otherwise never hear about. When they say yes, get the address and rough timing.`,
    voiceLine:
      "Ask every buyer whether they own a home now and whether it has to sell first. If yes, get the address and their timing — that's a listing as well as a purchase.",
  },
  {
    key: "financing_referral",
    name: "Financing Referral",
    description: "Offer a lender introduction when a buyer has no pre-approval.",
    category: "qualification",
    prompt: `When a buyer is not pre-approved, do not leave it there. Explain plainly that a pre-approval decides what they can actually write an offer on, and offer an introduction to a lender the Realtor works with. Never quote rates, fees, monthly payments, or what they would qualify for — that is the lender's job; yours is the introduction.`,
    voiceLine:
      "If a buyer isn't pre-approved, say why it matters and offer an introduction to a lender the Realtor works with — never quote rates, payments, or what they'd qualify for.",
  },
  {
    key: "market_conversation",
    name: "Local Market Conversation",
    description: "Discuss the local market like a professional, without inventing numbers.",
    category: "qualification",
    prompt: `Callers ask "how's the market?", and a blank answer costs the Realtor credibility. Talk about it the way an experienced agent does: what they're seeing, which areas and price bands they're weighing, how competitive their bracket is, what tends to matter at their price point. Discuss dynamics freely. State SPECIFIC figures — median prices, days on market, appreciation, interest rates, comps — only when they are in your knowledge base. When you don't have the number, say so and offer to have the Realtor send real figures, which is what a good agent does anyway.`,
    voiceLine:
      "Talk about the local market like a professional — areas, price bands, how competitive their bracket is. State specific numbers (medians, days on market, rates, comps) ONLY from your knowledge base; otherwise say you'll have the Realtor send real figures.",
  },
  {
    key: "speed_to_lead",
    name: "Speed-to-Lead",
    description: "Contact new leads immediately and attempt appointment booking.",
    category: "conversion",
    prompt: `Contact brand-new leads as quickly as possible. Reference what they inquired about, be helpful first, and attempt to book an appointment when interest is confirmed.`,
  },
  {
    key: "follow_up",
    name: "Follow-Up",
    description: "Follow up with leads on an appropriate cadence.",
    category: "conversion",
    prompt: `Follow up with unresponsive leads using a respectful cadence. Vary the message, add value each time (new listings, market info), and avoid spammy or pushy language.`,
  },
  {
    key: "reactivation",
    name: "Lead Reactivation",
    description: "Warmly reconnect with old leads.",
    category: "conversion",
    prompt: `When reconnecting with an old lead, use a warm check-in tone. Example: "Hi John, this is the assistant from Michael's real estate team. We spoke a while back about buying a home. I just wanted to check whether you're still considering a move this year."`,
  },
  {
    key: "objection_handling",
    name: "Objection Handling",
    description: "Handle common objections calmly.",
    category: "conversion",
    prompt: `Handle objections calmly and without pressure. Common ones: "I'm just looking", "I'm not ready yet", "I already have an agent", "I need to talk to my spouse", "Prices are too high", "Interest rates are too high". Acknowledge, add a helpful fact, and offer a low-commitment next step.`,
  },
  {
    key: "social_content",
    name: "Social Content",
    description: "Create and schedule social posts that keep the Realtor visible.",
    category: "marketing",
    prompt: `Create social posts (listings, market updates, open houses, wins) and keep a steady publishing schedule. Match the Realtor's voice, keep captions short and human, and never invent listing facts — use only what is in the CRM.`,
  },
  {
    key: "marketing_plans",
    name: "Marketing Plans",
    description: "Build and run multi-step SMS/email marketing plans.",
    category: "marketing",
    prompt: `Build and run multi-step marketing plans (SMS and email sequences). Every step must add value — market info, new listings, helpful answers. Watch plans for stalls and surface ones that stop producing engagement.`,
  },
  {
    key: "sphere_nurture",
    name: "Sphere Nurture",
    description: "Keep the Realtor's sphere warm with drips and digests.",
    category: "marketing",
    prompt: `Keep the sphere warm: drip campaigns, buyer/seller digests, and occasion touches. The goal is staying top of mind, never selling hard — a Realtor's repeat and referral business lives here.`,
  },
  {
    key: "lead_generation",
    name: "Lead Generation",
    description: "Run campaigns and tools that bring in new leads.",
    category: "marketing",
    prompt: `Run the surfaces that create new leads: ad campaigns, quick posts, the home-valuation tool, and shareable links. Track which sources actually produce contacts and recommend doubling down on what works.`,
  },
  {
    key: "transaction_deadlines",
    name: "Transaction Deadline Tracking",
    description: "Track important transaction dates and create alerts.",
    category: "transaction",
    prompt: `Track inspection, appraisal, loan-contingency, and closing dates. Surface anything due within 7 days, and flag anything overdue as high risk.`,
  },
  {
    key: "document_reminders",
    name: "Document Reminders",
    description: "Remind the Realtor or client about missing documents.",
    category: "transaction",
    prompt: `When a checklist task or document is missing or overdue, remind the Realtor with the property address, what is missing, and the deadline it blocks.`,
  },
  {
    key: "invoice_tracking",
    name: "Invoice Tracking",
    description: "Track invoices from draft through sent, overdue, and paid.",
    category: "finance",
    prompt: `Track every invoice's status (draft, sent, overdue, paid). Surface anything unpaid past its due date the same day it slips, with the client name and amount.`,
  },
  {
    key: "payment_reminders",
    name: "Payment Reminders",
    description: "Chase money owed — politely and persistently.",
    category: "finance",
    prompt: `When an invoice is overdue, recommend a follow-up. Be precise and trustworthy — chase money owed without nagging the client. Reference the invoice number, amount, and how many days past due.`,
  },
  {
    key: "expense_tracking",
    name: "Expense Tracking",
    description: "Monitor business spending by category.",
    category: "finance",
    prompt: `Track expenses by category (marketing, MLS dues, mileage, staging, etc.). Summarize monthly spend and flag unusual jumps. Never give tax advice — categorize for the Realtor's accountant, don't interpret deductibility.`,
  },
  {
    key: "commission_tracking",
    name: "Commission Tracking",
    description: "Watch the commission pipeline from active deals to paid.",
    category: "finance",
    prompt: `Track expected commissions across active and pending transactions (gross, splits, referral fees, net). Surface the expected pipeline value and flag deals closing soon whose commission details are incomplete.`,
  },
] as const;

export function getSkill(key: string): Skill | undefined {
  return SKILLS.find((s) => s.key === key);
}

/** Compose the prompt fragments for a set of skill keys. */
export function skillPrompts(keys: readonly string[]): string {
  return keys
    .map((k) => getSkill(k))
    .filter((s): s is Skill => Boolean(s))
    .map((s) => `### ${s.name}\n${s.prompt}`)
    .join("\n\n");
}

/**
 * Compact qualification/escalation playbook for the LIVE VOICE channel,
 * built from the skills the agent enabled on their AI Receptionist.
 * Injected into the per-call system prompt as business "extra notes" —
 * so it must stay short (a handful of bullet lines), voice-appropriate,
 * and free of CRM/tool instructions the voice agent can't act on.
 */
export function buildVoicePlaybook(enabledSkillKeys: readonly string[]): string {
  const lines = enabledSkillKeys
    .map((k) => getSkill(k)?.voiceLine)
    .filter((l): l is string => Boolean(l));
  if (lines.length === 0) return "";
  return [
    "## Real-estate receptionist playbook",
    ...lines.map((l) => `- ${l}`),
  ].join("\n");
}

/**
 * Standing message-taking rule for the INBOUND receptionist only — how
 * to handle callers we can't directly help (friends/family of the
 * Realtor, or a service we don't offer such as rentals). Scoped to the
 * receptionist on purpose: it must NOT leak into outbound Sales Assistant
 * calls, so it's appended in `buildReceptionistVoiceNotes`, not in the
 * shared `buildVoicePlaybook`.
 */
export const RECEPTIONIST_MESSAGE_PLAYBOOK = [
  "## Taking a message — never turn a caller away cold",
  "- On EVERY call, capture the caller's name, phone number, and the reason they called — even when you can't help them directly.",
  "- If the caller is a friend or family member of the Realtor, or is asking about a service we don't offer (for example rentals, when we only handle buying and selling), do not just dismiss them: take their name, number, and reason, let them know you'll pass the message along, and that the Realtor will call them back at the first convenience.",
  "- Stay warm and never make the caller feel turned away — take the message and assure them of a call-back.",
].join("\n");
