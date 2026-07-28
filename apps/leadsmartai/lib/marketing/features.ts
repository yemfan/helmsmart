/**
 * Per-feature marketing landing pages (programmatic SEO).
 *
 * Each product pillar (AI Receptionist, Sales Assistant, Marketing Assistant,
 * Transaction Coordinator, CMA) gets its own indexable `/features/{slug}` page.
 * Before this, the ONLY indexable feature surface was the `/features` hub — the
 * individual products lived only as noindex `/dashboard/*` app screens, so Google
 * had nothing to rank for high-intent queries like "AI receptionist for realtors"
 * or "AI transaction coordinator". These pages fix that.
 *
 * English-only on purpose: this is the SEO-target locale (same decision as the
 * homepage FAQ + JSON-LD). Copy is capability-accurate — no invented stats,
 * ratings, or testimonials, which Google penalizes and which we can't substantiate.
 */

export type FeatureIcon =
  | "receptionist"
  | "sales"
  | "marketing"
  | "transaction"
  | "cma";

export type FeatureFaq = { q: string; a: string };

export type FeatureStep = { title: string; body: string };

export type FeaturePage = {
  slug: string;
  /** Product name as it appears in the team. */
  name: string;
  icon: FeatureIcon;
  /** <title> — leads with the high-intent query, brand suffix added by template. */
  metaTitle: string;
  metaDescription: string;
  /** Search terms this page targets (page-level metadata keywords). */
  keywords: string[];
  /** Small eyebrow label above the H1. */
  eyebrow: string;
  /** H1 — the plain-language promise. */
  h1: string;
  /** One-paragraph lede under the H1. */
  intro: string;
  /** Benefit bullets — what the agent gets. */
  benefits: string[];
  /** "How it works" — 3 concrete steps. */
  steps: FeatureStep[];
  /** FAQ — mirrored into FAQPage JSON-LD for rich results. */
  faqs: FeatureFaq[];
  /** Slugs of sibling feature pages to cross-link (internal linking). */
  related: string[];
};

export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: "ai-receptionist",
    name: "AI Receptionist",
    icon: "receptionist",
    metaTitle: "AI Receptionist for Real Estate Agents — Answer Every Call 24/7",
    metaDescription:
      "CloseBoss's AI receptionist answers every call and text 24/7, texts back missed calls in seconds, qualifies leads, books appointments, and greets returning callers by name — so you never lose a lead to voicemail.",
    keywords: [
      "AI receptionist for real estate",
      "AI receptionist for realtors",
      "missed call text back real estate",
      "24/7 answering service for agents",
      "AI phone answering real estate",
      "real estate virtual receptionist",
    ],
    eyebrow: "Never miss another call",
    h1: "An AI receptionist that answers every call, 24/7",
    intro:
      "Most leads call once. If they hit voicemail, they call the next agent. CloseBoss answers every inbound call and text the moment it arrives — day or night, weekends, while you're in a showing — qualifies the caller, books the appointment, and hands you a warm lead instead of a missed-call notification.",
    benefits: [
      "Answers live 24/7, so after-hours and weekend leads never reach voicemail.",
      "Texts back missed calls within seconds while the caller is still interested.",
      "Qualifies buyers and sellers with natural conversation, then routes hot leads to you.",
      "Books appointments straight onto your calendar without the back-and-forth.",
      "Recognizes returning callers and greets them by name, remembering their area, budget, and language.",
      "Speaks the caller's language, so you capture leads you'd otherwise lose.",
    ],
    steps: [
      {
        title: "A call or text comes in",
        body: "Every inbound call and SMS is answered instantly — no menus, no hold music, no voicemail dead-end. Missed calls trigger an automatic text-back in seconds.",
      },
      {
        title: "The receptionist qualifies and books",
        body: "It has a natural conversation, captures the lead's intent, budget, and timeline, answers common questions, and books a meeting on your calendar when there's fit.",
      },
      {
        title: "You get a warm hand-off",
        body: "The lead lands in your CRM with a full transcript and a rating, and returning callers are recognized automatically — so every follow-up starts with context.",
      },
    ],
    faqs: [
      {
        q: "Does the AI receptionist really answer live phone calls?",
        a: "Yes. It answers inbound calls with a natural voice 24/7, holds a real conversation, qualifies the caller, and books appointments — not just a chatbot on your website.",
      },
      {
        q: "What happens when I miss a call?",
        a: "CloseBoss texts the caller back automatically within seconds, so the conversation continues before they move on to another agent.",
      },
      {
        q: "Can it handle callers who speak another language?",
        a: "Yes. The receptionist can converse in the caller's language, helping you capture and serve leads you'd otherwise lose at hello.",
      },
      {
        q: "Does it recognize repeat callers?",
        a: "It remembers returning callers, greets them by name, and recalls their area, budget, and preferred language, so every call picks up where the last one left off.",
      },
    ],
    related: ["ai-sales-assistant", "transaction-coordinator", "cma"],
  },
  {
    slug: "ai-sales-assistant",
    name: "AI Sales Assistant",
    icon: "sales",
    metaTitle: "AI Sales Assistant (ISA) for Realtors — Follow Up With Every Lead",
    metaDescription:
      "CloseBoss's AI inside sales assistant follows up with every lead by call, text, and email, runs multi-step nurture sequences, and books appointments — the tireless ISA that never lets a lead go cold.",
    keywords: [
      "AI ISA for real estate",
      "real estate lead follow-up automation",
      "AI inside sales agent real estate",
      "real estate lead nurture",
      "automated lead follow up realtor",
      "AI sales assistant realtor",
    ],
    eyebrow: "No lead left behind",
    h1: "An AI sales assistant that follows up with every lead",
    intro:
      "Speed-to-lead and relentless follow-up win deals — and both are exactly what a busy agent runs out of. CloseBoss's AI sales assistant reaches every new lead in minutes, keeps nurturing across call, text, and email until they're ready, and books the appointment when they are, so no lead ever slips through the cracks.",
    benefits: [
      "Responds to new leads in minutes, not hours — when they're most likely to convert.",
      "Runs multi-step nurture sequences across call, text, and email automatically.",
      "Re-engages your old database and dormant leads without you lifting a finger.",
      "Composes and sends personalized outreach — send now or schedule for later.",
      "Books qualified appointments onto your calendar and hands you the context.",
      "Rates and prioritizes leads so your time goes to the ones ready to move.",
    ],
    steps: [
      {
        title: "A new lead arrives",
        body: "From your site, a portal, a call, or an import, the assistant picks it up immediately and reaches out while interest is highest.",
      },
      {
        title: "It nurtures until they're ready",
        body: "Personalized, multi-channel follow-up continues on a smart cadence — no more leads forgotten after the first touch — adapting to how the lead responds.",
      },
      {
        title: "It books the appointment",
        body: "When a lead is ready, the assistant sets the meeting on your calendar and hands you a qualified, primed conversation.",
      },
    ],
    faqs: [
      {
        q: "What is an AI ISA?",
        a: "An AI inside sales assistant handles the follow-up work a human ISA would — contacting new leads fast, nurturing them across channels, and booking appointments — without the salary or the burnout.",
      },
      {
        q: "How fast does it respond to new leads?",
        a: "Within minutes of a lead arriving, which is the window where contact rates and conversions are dramatically higher.",
      },
      {
        q: "Can it revive my old database?",
        a: "Yes. It can systematically re-engage dormant leads and past contacts with relevant outreach, surfacing opportunities already sitting in your CRM.",
      },
      {
        q: "Which channels does it use?",
        a: "Call, text, and email — composed for each lead, sent immediately or scheduled, and consolidated so your follow-up is consistent everywhere.",
      },
    ],
    related: ["ai-receptionist", "ai-marketing-assistant", "cma"],
  },
  {
    slug: "ai-marketing-assistant",
    name: "AI Marketing Assistant",
    icon: "marketing",
    metaTitle: "AI Marketing Assistant for Realtors — Social Media & Content on Autopilot",
    metaDescription:
      "CloseBoss's AI marketing assistant writes and posts your social content across Facebook, Instagram, LinkedIn, Threads, and Pinterest, and generates branded market reports and newsletters — a full marketing team on autopilot.",
    keywords: [
      "real estate social media automation",
      "AI marketing for realtors",
      "real estate content generator",
      "automated social media posting real estate",
      "real estate marketing assistant",
      "AI social media real estate agent",
    ],
    eyebrow: "Stay visible without the busywork",
    h1: "An AI marketing assistant that keeps you visible everywhere",
    intro:
      "Consistent marketing builds a pipeline, but it's the first thing that falls off a busy agent's plate. CloseBoss's AI marketing assistant plans, writes, and publishes your social content across every major platform, and turns local market data into branded reports and newsletters clients actually open — so you stay top-of-mind without spending nights on Canva.",
    benefits: [
      "Generates on-brand social posts and carousels written to earn reach, not just fill a feed.",
      "Publishes automatically to Facebook, Instagram, LinkedIn, Threads, and Pinterest.",
      "Turns live local market data into branded market reports you can send to clients.",
      "Produces a regional newsletter that positions you as the local expert.",
      "Schedules everything on a steady cadence so your presence never goes dark.",
      "Keeps your voice and branding consistent across every channel.",
    ],
    steps: [
      {
        title: "It plans the content",
        body: "The assistant proposes a weekly slate of posts and topics grounded in your market and the moment — you approve or let it run on autopilot.",
      },
      {
        title: "It writes and formats",
        body: "Captions, multi-image carousels, market reports, and newsletters are generated on-brand and structured to be recommended by each platform's algorithm.",
      },
      {
        title: "It publishes and schedules",
        body: "Approved content posts automatically to your connected accounts on a consistent cadence, and market reports are ready to share with clients in a click.",
      },
    ],
    faqs: [
      {
        q: "Which social platforms does it post to?",
        a: "Facebook, Instagram, LinkedIn, Threads, and Pinterest — connected once, then published to automatically on a schedule you control.",
      },
      {
        q: "Do I have to approve posts before they go out?",
        a: "Your choice. Review and approve each post, or switch on autopilot and let the marketing assistant publish on a steady cadence.",
      },
      {
        q: "Can it create market reports for my clients?",
        a: "Yes. It turns live local market data into branded, shareable market reports and a regional newsletter that position you as the neighborhood expert.",
      },
      {
        q: "Will the content match my branding?",
        a: "Yes. Posts, carousels, and reports carry your voice and branding so your presence stays consistent across every channel.",
      },
    ],
    related: ["ai-sales-assistant", "cma", "ai-receptionist"],
  },
  {
    slug: "transaction-coordinator",
    name: "AI Transaction Coordinator",
    icon: "transaction",
    metaTitle: "AI Transaction Coordinator for Real Estate — Never Miss a Deadline",
    metaDescription:
      "CloseBoss's AI transaction coordinator tracks every contract deadline, keeps documents and tasks organized, and keeps deals moving from contract to close — so nothing falls through the cracks.",
    keywords: [
      "AI transaction coordinator",
      "real estate transaction coordination software",
      "contract to close checklist",
      "real estate deadline tracking",
      "transaction coordinator for realtors",
      "AI TC real estate",
    ],
    eyebrow: "From contract to close, handled",
    h1: "An AI transaction coordinator that keeps every deal on track",
    intro:
      "Between contract and close, one missed deadline can cost the deal — or your commission. CloseBoss's AI transaction coordinator keeps every date, document, and task in order, flags what's due, and keeps the deal moving, so you can list and sell instead of living in a checklist.",
    benefits: [
      "Tracks every contractual deadline and flags what's coming due before it's a problem.",
      "Keeps documents, tasks, and next steps organized for every active deal.",
      "Gives you a clear at-a-glance status on where each transaction stands.",
      "Keeps deals moving from contract to close without dropped hand-offs.",
      "Frees you from the admin so you can focus on clients and new business.",
    ],
    steps: [
      {
        title: "A deal goes under contract",
        body: "The coordinator lays out the full contract-to-close timeline — key dates, contingencies, and the tasks each one depends on.",
      },
      {
        title: "It tracks every deadline",
        body: "Inspection, appraisal, financing, and closing dates are monitored, with the next action surfaced before anything slips.",
      },
      {
        title: "It keeps the deal moving",
        body: "Documents and tasks stay organized and the status stays current, so hand-offs are clean and nothing falls through the cracks.",
      },
    ],
    faqs: [
      {
        q: "What does an AI transaction coordinator do?",
        a: "It manages the contract-to-close process — tracking deadlines, organizing documents and tasks, and keeping the deal moving — so you don't miss a critical date.",
      },
      {
        q: "Will it keep me from missing deadlines?",
        a: "Yes. It monitors every contractual date and surfaces what's due next, so inspection, appraisal, financing, and closing deadlines stay on your radar.",
      },
      {
        q: "Does it replace my human TC?",
        a: "It handles the repetitive coordination and tracking so a solo agent can run more deals cleanly, and it makes any human TC dramatically more leveraged.",
      },
    ],
    related: ["ai-receptionist", "ai-sales-assistant", "cma"],
  },
  {
    slug: "cma",
    name: "Instant CMA",
    icon: "cma",
    metaTitle: "AI CMA & Home Valuation for Agents — Instant, Comp-Backed Reports",
    metaDescription:
      "CloseBoss generates instant, comp-backed CMAs and home valuations grounded in real market data — branded reports you can share with sellers in minutes to win the listing.",
    keywords: [
      "AI CMA real estate",
      "instant CMA for agents",
      "comparative market analysis software",
      "home valuation for realtors",
      "AI home value estimate agent",
      "listing presentation CMA",
    ],
    eyebrow: "Win the listing appointment",
    h1: "Instant, comp-backed CMAs that win listings",
    intro:
      "The agent who shows up with a sharp, credible price wins the listing. CloseBoss generates an instant comparative market analysis grounded in real, current comps and market data, packaged as a branded report you can share with a seller in minutes — no more late nights pulling comps by hand.",
    benefits: [
      "Produces a comparative market analysis in minutes, grounded in real current comps.",
      "Backs the number with cited market data instead of a black-box estimate.",
      "Delivers a clean, branded report you can share or present on the spot.",
      "Doubles as a home-valuation lead magnet that converts curious owners into sellers.",
      "Pairs with a deep report and seller strategy so you walk in ready to close.",
    ],
    steps: [
      {
        title: "Enter the property",
        body: "Give CloseBoss the address and the essentials — it does the comp research for you against live market data.",
      },
      {
        title: "Get a comp-backed valuation",
        body: "It returns a defensible price range supported by real, current comparable sales and cited market context — not a guess.",
      },
      {
        title: "Share a branded report",
        body: "Package the analysis into a branded, shareable report for the seller and walk into the listing appointment with credibility.",
      },
    ],
    faqs: [
      {
        q: "How is this CMA different from a portal estimate?",
        a: "It's grounded in real, current comparable sales and cited market data and packaged as an agent-branded report — not an anonymous automated guess.",
      },
      {
        q: "How fast can I generate a CMA?",
        a: "In minutes. Enter the property and CloseBoss does the comp research and produces a shareable, branded report on the spot.",
      },
      {
        q: "Can I use it to capture seller leads?",
        a: "Yes. The home-valuation flow works as a lead magnet that turns owners checking their home's worth into listing conversations.",
      },
    ],
    related: ["ai-marketing-assistant", "ai-sales-assistant", "ai-receptionist"],
  },
];

export function getFeaturePageBySlug(slug: string): FeaturePage | null {
  return FEATURE_PAGES.find((f) => f.slug === slug) ?? null;
}
