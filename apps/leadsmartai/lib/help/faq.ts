/**
 * Canonical FAQ for /help/faq.
 *
 * Lives in code (not a CMS) for two reasons:
 *   1. The FAQPage JSON-LD on /help/faq reads this same array, so
 *      the schema and the rendered Q&A can never drift.
 *   2. It's tiny and changes rarely — a CMS would be overkill.
 *
 * When adding a new entry: keep `q` short (matches Google's
 * preferred FAQ snippet length) and `a` under ~600 characters.
 */

export type HelpFaqCategory =
  | "getting_started"
  | "ai_followup"
  | "coaching"
  | "billing"
  | "integrations"
  | "privacy";

export type HelpFaqEntry = {
  category: HelpFaqCategory;
  q: string;
  a: string;
};

export const HELP_FAQ_CATEGORIES: ReadonlyArray<{
  id: HelpFaqCategory;
  label: string;
}> = [
  { id: "getting_started", label: "Getting started" },
  { id: "ai_followup", label: "AI follow-up" },
  { id: "coaching", label: "LeadSmart AI Coaching" },
  { id: "billing", label: "Billing & plans" },
  { id: "integrations", label: "Integrations" },
  { id: "privacy", label: "Privacy & data" },
];

export const HELP_FAQ: ReadonlyArray<HelpFaqEntry> = [
  // ── Getting started ───────────────────────────────────────────
  {
    category: "getting_started",
    q: "How do I set up my first AI follow-up sequence?",
    a: "From your dashboard, open Settings → Messages and pick a Review Policy (auto-send vs require approval). Then open Templates and either edit one of the prebuilt sequences or create a new one. New leads start receiving the sequence within 60 seconds of capture. See the step-by-step guide at /help/guides/ai-followup-setup.",
  },
  {
    category: "getting_started",
    q: "How do I import contacts from another CRM?",
    a: "Go to Settings → Data & Tools → MLS Data Import (the same panel handles general contact imports via CSV). Map your CSV columns to LeadSmart fields and run the import. Imports respect duplicate detection by email + phone, so re-importing won't double up your contacts.",
  },

  // ── AI follow-up ──────────────────────────────────────────────
  {
    category: "ai_followup",
    q: "Will leads know they're talking to AI?",
    a: "Messages send in your name and from your number. AI is transparent about being a digital assistant when asked, but the goal is a fast, helpful first response — not deception. You decide how much AI handles before looping you in (configured in Settings → Voice & Style).",
  },
  {
    category: "ai_followup",
    q: "What happens when a lead replies to AI?",
    a: "AI continues the conversation, asking qualifying questions tailored to the lead's source (Zillow, Facebook, your site). When intent crosses your threshold — they ask about a tour, mention a price range, or request to talk — you're notified immediately and AI hands off the thread.",
  },

  // ── Coaching ─────────────────────────────────────────────────
  {
    category: "coaching",
    q: "What is LeadSmart AI Coaching?",
    a: "Coaching is a producer-development program built into the dashboard. Producer Track (Pro and above) targets 10 transactions / 3% conversion; Top Producer Track (Premium and Team) targets 15 transactions / 5% conversion. Daily plans, weekly playbooks, monthly AI deep-dives, peer benchmarks. No add-on fee.",
  },
  {
    category: "coaching",
    q: "How do I opt out of coaching, or re-enroll later?",
    a: "Open Settings → Coaching. Each program your plan can access has Enroll / Re-enroll / Opt out controls. Auto-enrollment runs on plan upgrades but always respects prior opt-outs — once you opt out, we won't re-enroll you without an explicit choice here.",
  },

  // ── Billing ──────────────────────────────────────────────────
  {
    category: "billing",
    q: "Can I cancel my subscription anytime?",
    a: "Yes. Cancel from Settings → Billing or directly from your Stripe Customer Portal. There's no minimum term and no cancellation fee. Your plan stays active through the end of the current billing period, then drops to Starter automatically.",
  },
  {
    category: "billing",
    q: "What happens to my data after I cancel?",
    a: "Your contacts, pipeline, and conversations stay in your account. You can keep using Starter (up to 5 leads / 50 contacts) or export everything via Settings → Data & Tools. We don't delete data automatically — request deletion via /contact if you want a full wipe.",
  },

  // ── Integrations ─────────────────────────────────────────────
  {
    category: "integrations",
    q: "Which CRMs and lead sources do you integrate with?",
    a: "Native and Zapier integrations with Follow Up Boss, kvCORE, Sierra Interactive, Lofty, BoomTown, and LionDesk. Lead-source connectors for Zillow Premier Agent, Facebook Lead Ads, your website lead forms, and Google Lead Form Ads. Setup typically takes under 15 minutes.",
  },
  {
    category: "integrations",
    q: "How do I record and send video email?",
    a: "Open any contact, click Message → Video. Record in the browser (no extension needed), trim if you want, and send. The recipient sees an inline player; you get notified when they watch and how much of it. See /help/guides/video-email for a step-by-step walkthrough.",
  },

  // ── Privacy ──────────────────────────────────────────────────
  {
    category: "privacy",
    q: "Where is my data stored?",
    a: "Customer data is stored in Supabase Postgres (US region) with row-level security. Audio for voice features is processed by Twilio. We never sell or share data with advertisers. Full details in our /privacy page.",
  },
  {
    category: "privacy",
    q: "How do I get help from a real person?",
    a: "Open the chat bubble in your dashboard or email contact@helmsmart.ai. Premium and Team plans include priority support with same-business-day response. We're agents-helping-agents — no offshore tier-1 script-readers.",
  },

  // ── AI team & voice ───────────────────────────────────────────
  {
    category: "ai_followup",
    q: "What is the RealtorBoss AI team — and who does what?",
    a: "You're the boss. You give one command to your Boss Assistant and it delegates to the right teammate: the Receptionist answers calls, the Sales Assistant follows up, Marketing fills the pipeline, the Transaction Assistant coordinates the deal, and the Accountant keeps the books. You finally own a team — without the payroll.",
  },
  {
    category: "ai_followup",
    q: "Does RealtorBoss actually make phone calls, or just send texts?",
    a: "Both — and that's what sets it apart. Your AI Receptionist answers inbound calls live, 24/7, and texts back the moment a call goes unanswered. Your AI also places real outbound voice calls to follow up with your sphere and leads — not just another SMS like every other CRM.",
  },
  {
    category: "ai_followup",
    q: "How is this different from other real estate CRMs?",
    a: "Most CRMs stop at SMS and email drips and leave the work to you. RealtorBoss is an AI team you command: it answers the phone, calls your sphere by real voice, and runs whole jobs — open houses, presentations, showings, closings — from a single instruction, handing you finished reports.",
  },
  {
    category: "ai_followup",
    q: "What reports can the AI generate for me?",
    a: "From one address it produces an AI CMA (live web comps + value range), a branded Seller Presentation, a Property Deep Report (loan affordability, deal rating, investment ROI, schools, neighborhood, location map), an AI House Search for buyers, a side-by-side Comparison Report, and a Net-to-Seller sheet — each share-ready with your branding.",
  },
  {
    category: "getting_started",
    q: "What can I get done with one command?",
    a: "Tell the Boss Assistant what you want — \"set up Saturday's open house,\" \"build a seller presentation for 123 Main St,\" or \"find and show homes to the Garcias\" — and the team does the research and every step, then hands back the finished deliverables. You review and send.",
  },
  {
    category: "ai_followup",
    q: "Can the AI cold-call and qualify my leads?",
    a: "Yes. Hand the Sales Assistant a lead list and it places outbound calls in a natural voice, qualifies each prospect on budget, timeline, and motivation — buyer or seller — then scores intent, books the hot ones, and logs notes to every contact. You work only the leads that are ready.",
  },
  {
    category: "ai_followup",
    q: "Is this just generic AI, or is it trained for real estate?",
    a: "It's built for real estate. The assistants are modeled on the playbooks of top-producing agents — how they qualify buyers and sellers, handle common objections, time their follow-up, and talk pricing and negotiation. Every call and message reflects proven agent best practices, not generic chatbot answers.",
  },
];

/** Convenience: group entries by category in the canonical category order. */
export function groupedFaq(): Array<{
  category: HelpFaqCategory;
  label: string;
  entries: HelpFaqEntry[];
}> {
  return HELP_FAQ_CATEGORIES.map((c) => ({
    category: c.id,
    label: c.label,
    entries: HELP_FAQ.filter((e) => e.category === c.id),
  }));
}
