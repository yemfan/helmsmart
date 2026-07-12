/**
 * RealtyBoss brand marketing posts — the content the auto-poster publishes to
 * LinkedIn (and any future channel) on a schedule, in order. Single source of
 * truth: add/edit here.
 *
 * Two voices, in one rotation:
 *   1. Founder-voice (first person) — leads the rotation. Personal profiles get
 *      far more organic reach than Company Pages, and story-driven founder posts
 *      outperform brand copy on a personal feed. The auto-poster runs against the
 *      owner's PERSONAL LinkedIn, so these go first.
 *   2. Brand-voice (third person) — follows. Also fine on a personal feed, but
 *      these are the natural set to reshare to the MAXY Investment Company Page.
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
  // ── Founder voice (first person) — leads the personal-feed rotation ──────────
  {
    key: "founder_origin",
    caption:
      "I'm a realtor. Before RealtyBoss, I tried everything to automate my business.\n\nChatGPT, Claude, DeepSeek, Grok. I even built my own AI agent.\n\nAnd it still broke. Automations failed silently. I'd miss a call in the middle of a showing. I was hand-translating messages between my English- and Chinese-speaking clients. I was spending hours on the work that was supposed to save me hours.\n\nThen it hit me: every realtor is fighting this exact battle — and none of us should have to build the tools ourselves.\n\nSo I built the thing I wished existed. An AI team that just works, made for real estate.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "Realtor", "AI"],
  },
  {
    key: "founder_broker_crm",
    caption:
      "I talked to a broker with over 1,000 agents.\n\nThe brokerage had bought every single one of them a CRM license. Six figures a year.\n\nAlmost nobody logged in.\n\nThat's the real problem in real estate tech: the tools exist, but they make YOU do the work. A CRM reminds you to follow up. It doesn't actually follow up.\n\nThat's the whole idea behind RealtyBoss — an AI team that does the work, not another dashboard you'll ignore.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "CRM", "PropTech"],
  },
  {
    key: "founder_missed_call",
    caption:
      "The deal I lost that changed everything:\n\nI was in a showing. My phone rang — a new lead. I couldn't pick up. By the time I called back that evening, they'd already signed with someone else.\n\nA missed call is a missed commission. I never wanted that to happen again.\n\nNow an AI receptionist answers every one of my calls, 24/7 — and texts back the ones it can't get to. That alone paid for itself.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "Realtor", "PropTech"],
  },
  {
    key: "founder_bilingual",
    caption:
      "A lot of my clients speak Chinese. A lot speak English. I speak both — so I became the translator in every transaction.\n\nRewriting texts. Re-explaining disclosures. Twice the work on every deal.\n\nSo I made sure RealtyBoss works natively in English AND Chinese — calls, texts, listings, disclosures. Not google-translated. Actually localized.\n\nIf you serve immigrant buyers and sellers, you know how much this matters.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "Realtor", "PropTech"],
  },
  {
    key: "founder_ai_team",
    caption:
      "I couldn't afford to hire an ISA, a transaction coordinator, and a marketing person.\n\nMost agents can't. So we end up doing all three jobs ourselves, badly, at 10pm.\n\nI built RealtyBoss so I'd have a team without the payroll — a receptionist, a sales assistant, a marketing assistant, a transaction coordinator, and an accountant. All AI. All working while I sleep.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "PropTech", "AI"],
  },
  {
    key: "founder_followup",
    caption:
      "Confession: I was terrible at follow-up.\n\nEveryone says the fortune's in the follow-up. But after a full day of showings and paperwork, the last thing I wanted to do was call 20 leads.\n\nSo I stopped relying on willpower and handed the job to AI. Real calls, real texts, every lead, on cadence — while I focus on the ones ready to move.\n\nMy pipeline stopped leaking.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "LeadGeneration", "AI"],
  },
  {
    key: "founder_build_vs_use",
    caption:
      "I spent months tuning prompts and stitching together AI tools to run my real estate business.\n\nThen I realized: no realtor should have to do this. You should be selling homes, not debugging automations.\n\nSo everything I figured out the hard way is now just… built in. You talk to it like a person, and the work gets done.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "Realtor", "AI"],
  },
  {
    key: "founder_speed",
    caption:
      "I used to think I was fast at responding to leads. Then I looked at the data.\n\nRespond in 5 minutes and your odds of connecting multiply. Respond in an hour and the lead is basically gone.\n\nNo human is glued to their phone 24/7. That's the one thing AI is genuinely better at — so I let it answer and qualify every lead the second it comes in.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "LeadGeneration", "AI"],
  },
  {
    key: "founder_compliance",
    caption:
      "The scariest part of marketing at scale as a realtor? One wrong phrase in a listing and you've got a Fair Housing problem.\n\nI didn't want to hand my clients AI-written content that could get them in trouble. So everything RealtyBoss writes for the public runs through a compliance check first.\n\nMarket aggressively. Sleep at night.\n\nrealtybossai.com",
    hashtags: ["RealEstate", "FairHousing", "Realtor"],
  },
  {
    key: "founder_free_skills",
    caption:
      "I just made our entire 59-skill Realtor AI library free. No signup.\n\nWhy give it away? Because I remember spending nights figuring out the right prompt to write a decent listing description or a CMA. Every realtor is reinventing the same wheel.\n\nHere's the wheel — listing copy, CMAs, objection scripts, farm campaigns, each with a Fair-Housing-safe prompt built in.\n\nrealtybossai.com/skills-library",
    hashtags: ["RealEstate", "Realtor", "AI"],
  },

  // ── Brand voice (third person) — also fine on a personal feed; the natural
  //    set to reshare to the MAXY Investment Company Page ───────────────────────
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
