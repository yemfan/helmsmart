/**
 * RealtyBoss brand marketing posts — the content the auto-poster publishes to
 * LinkedIn (and any future channel) on a schedule, in order. Ordered most
 * value-first / shareable at the top. Single source of truth: add/edit here.
 *
 * `caption` is the post body (plain text; the link is inline for API posting).
 * `hashtags` are inlined by the publisher (LinkedIn renders them clickable).
 */
export type BrandPost = {
  key: string; // stable, unique — used in brand_social_log so a post is never repeated
  caption: string;
  hashtags: string[];
};

export const BRAND_POSTS: BrandPost[] = [
  {
    key: "skills_library",
    caption:
      "We made our entire 59-skill Realtor AI Skills Library free. 🎁\n\nListing descriptions, CMAs, farm campaigns, objection scripts, buyer consults — each with a Fair-Housing-safe prompt built in. No signup.\n\nGrab it → realtybossai.com/skills-library",
    hashtags: ["RealEstateMarketing", "Realtor", "AI"],
  },
  {
    key: "missed_call",
    caption:
      "📞 A missed call is a missed commission.\n\nRealtyBoss's AI Receptionist answers every call 24/7 — and the ones it can't, it texts back and keeps calling until it connects. You never lose a lead to voicemail again.\n\nSee it → realtybossai.com",
    hashtags: ["RealEstate", "Realtor", "PropTech"],
  },
  {
    key: "playbooks",
    caption:
      "What if your listing marketed itself?\n\nSign a listing → RealtyBoss builds the marketing plan, writes the ads, launches, and optimizes weekly. Buyers too: consult → search plan → matches on autopilot. Your AI team runs the whole engagement.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "PropTech", "AI"],
  },
  {
    key: "hire_ai_team",
    caption:
      "You don't need to hire an ISA, a TC, and a marketing coordinator.\n\nRealtyBoss is an AI real estate team — Receptionist, Sales, Marketing, Transaction, and Accounting assistants — for a fraction of one salary. Close more without growing payroll.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "PropTech", "AI"],
  },
  {
    key: "follow_up",
    caption:
      "The fortune's in the follow-up — but who has time to call and text every lead?\n\nRealtyBoss's AI Sales Assistant does it for you: real voice calls + texts to every lead, on cadence, until they book. You just take the appointments.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "LeadGeneration", "AI"],
  },
  {
    key: "compliance_gate",
    caption:
      "Fair Housing violations start with one bad phrase in a listing.\n\nEverything RealtyBoss writes for the public passes a built-in compliance gate — Fair Housing + advertising — before it reaches a client. Market at scale, without the license risk.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "FairHousing", "Realtor"],
  },
  {
    key: "bilingual",
    caption:
      "Serving Chinese-speaking buyers and sellers?\n\nRealtyBoss works in English AND Chinese — calls, texts, listings, and disclosures, localized (not just translated). A moat most tools can't match.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "Realtor", "PropTech"],
  },
  {
    key: "crm_dead",
    caption:
      "Your CRM reminds you to follow up. RealtyBoss actually does it.\n\nReal calls. Real texts. Every lead. That's the difference between a database and a team.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "CRM", "PropTech"],
  },
  {
    key: "cma",
    caption:
      "Winning the listing starts with the price conversation.\n\nRealtyBoss builds a data-backed CMA with real comps — a defensible value range that makes you the expert before you walk in the door.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "Realtor", "CMA"],
  },
  {
    key: "deadlines",
    caption:
      "Missed deadlines kill deals — and create liability.\n\nRealtyBoss's Transaction Assistant tracks every contingency and closing milestone, and flags what's due before it's late. Nothing falls through the cracks.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "TransactionCoordinator", "PropTech"],
  },
  {
    key: "speed_to_lead",
    caption:
      "Respond in 5 minutes and contact rates multiply. Respond in an hour and the lead's gone.\n\nRealtyBoss answers portal leads instantly — day or night — and qualifies them on the spot.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "LeadGeneration", "AI"],
  },
  {
    key: "net_sheet",
    caption:
      "The #1 seller question: \"What do I actually walk away with?\"\n\nRealtyBoss builds a clear net sheet in seconds — gross to net, reconciled to the dollar. Trust, built on transparency.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "Realtor", "HomeSelling"],
  },
];
