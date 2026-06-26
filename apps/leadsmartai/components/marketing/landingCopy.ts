export type UserRole = "agent" | "broker";

export type LandingCopy = {
  hero: {
    eyebrow: string;
    headline: string;
    line1: string;
    /** Optional — brokers often use headline + single line only */
    line2?: string;
    line3?: string;
    primaryCta: string;
    secondaryCta: string;
    /** If set, hero secondary button uses this href (default: demo funnel). */
    secondaryCtaHref?: string;
    /** Tight reassurance line directly under hero buttons */
    microProof: string;
    /** Shown under micro-proof (longer guarantee / social line) */
    trustLine: string;
  };
  /** Slim strip below hero — social proof / trust signals */
  trustBar: {
    items: string[];
  };
  problem: {
    title: string;
    subtitle: string;
    intro: string;
    painLabel: string;
    pains: string[];
    closingLead: string;
    closingEmphasis: string;
  };
  solution: {
    /** e.g. "This is NOT a CRM." — shown above the main title */
    negations?: string[];
    title: string;
    punch1: string;
    punch2Prefix: string;
    punch2Emphasis: string;
    punch2Suffix: string;
    wins: string[];
    closing: string;
  };
  howItWorks: {
    title: string;
    /** Short line under the title — sets up the visual flow */
    subtitle?: string;
    /** Large SVG funnel — top → bottom stages + outcome */
    funnel?: {
      caption?: string;
      stages: [string, string, string];
      hints?: [string, string, string];
      outcome: string;
    };
    steps: { phase: string; body: string; icon?: string }[];
  };
  showcase: {
    title: string;
    /** Optional — omitted when empty */
    subtitle?: string;
    items: { icon: string; title: string; desc: string }[];
  };
  valueStack: {
    title: string;
    /** Optional line under the title */
    subtitle?: string;
    benefits: string[];
    closingLine1: string;
    closingLine2: string;
  };
  /** PropertyTools AI ecosystem — lead-generating tools */
  productEcosystem: {
    title: string;
    /** Competitive angle — e.g. secret weapon vs other vendors */
    tagline?: string;
    line1: string;
    /** Short punch line (often emphasized in UI) */
    line2: string;
    toolsIntro: string;
    tools: { icon: string; name: string }[];
    closing: string;
    /** Optional link to PropertyTools consumer site */
    toolsSiteHref?: string;
    toolsSiteLabel?: string;
  };
  proof: {
    /** Small pill above the title (e.g. “Results”) */
    eyebrow?: string;
    title: string;
    subtitle?: string;
    /** Optional stat tiles — omit for quote-only social proof */
    stats?: { value: string; label: string }[];
    quotes: { text: string; attribution: string }[];
  };
  pricing: {
    title: string;
    subtitle?: string;
    freePlanName: string;
    premiumPlanName: string;
    freeFeatures: string[];
    premiumFeatures: string[];
    /** e.g. Plans starting at $29/month */
    footnote: string;
    /** e.g. pay-per-lead — shown as an optional add-on line */
    optionalOffer?: string;
    freeCta: string;
    premiumCta: string;
  };
  finalCta: {
    /** e.g. “Urgency” — small label above headline */
    eyebrow?: string;
    title: string;
    line1: string;
    line2: string;
    primary: string;
    /** Optional second button (e.g. Talk to sales) */
    secondary?: string;
  };
};

const agentCopy: LandingCopy = {
  hero: {
    eyebrow: "The AI Growth Engine for Real Estate Agents",
    headline: "Turn Online Traffic into Closed Deals — Automatically",
    line1: "Stop chasing cold leads.",
    line2: "Start closing high-intent buyers and sellers with AI.",
    line3: "RealtyBoss captures, qualifies, and follows up with your leads — instantly.",
    primaryCta: "Get My First Leads Now",
    secondaryCta: "See How It Works",
    secondaryCtaHref: "#how-it-works",
    microProof: "No setup required • Works in minutes • Cancel anytime",
    trustLine: "Get your first qualified lead in 24 hours — or it’s free.",
  },
  trustBar: {
    items: [
      "Used by agents in Los Angeles",
      "High-intent buyer & seller leads generated daily",
      "3x faster response time with AI",
    ],
  },
  problem: {
    title: "You don’t have a traffic problem.",
    subtitle: "You have a conversion problem.",
    intro: "You’re already getting visitors…",
    painLabel: "But:",
    pains: [
      "They don’t reply",
      "They’re not serious",
      "You follow up too late",
      "Deals slip away",
    ],
    closingLead: "Every missed follow-up = lost commission.",
    closingEmphasis: "And it’s happening every day.",
  },
  solution: {
    negations: ["This is NOT a CRM.", "This is NOT a lead generator."],
    title: "RealtyBoss is a Deal Conversion Engine.",
    punch1: "We don’t just give you leads.",
    punch2Prefix: "We turn them into ",
    punch2Emphasis: "clients",
    punch2Suffix: " — automatically.",
    wins: [
      "Capture high-intent users from home value & mortgage tools",
      "Automatically qualify and score every lead",
      "Instantly follow up using AI",
      "Prioritize serious buyers and sellers",
      "Route leads to the right agent at the right time",
    ],
    closing: "All on autopilot.",
  },
  howItWorks: {
    title: "Simple flow — from click to client",
    subtitle: "Three steps. No guesswork.",
    funnel: {
      caption: "Your pipeline, visualized",
      stages: ["Traffic & tools", "Qualified leads", "AI nurture & follow-up"],
      hints: ["Widest reach", "Scored & prioritized", "Runs 24/7 automatically"],
      outcome: "Closed clients · more referrals",
    },
    steps: [
      {
        phase: "Attract",
        icon: "🌐",
        body: "Buyers and sellers discover your home value, mortgage, and comparison tools — right on your site.",
      },
      {
        phase: "Capture",
        icon: "🎯",
        body: "We turn visitors into scored, high-intent leads the moment they engage.",
      },
      {
        phase: "Close",
        icon: "🤝",
        body: "AI follows up instantly, nurtures every thread, and helps you book conversations that become deals.",
      },
    ],
  },
  showcase: {
    title: "Everything You Need to Close More Deals",
    subtitle: "Power in your pipeline — not a feature laundry list.",
    items: [
      {
        icon: "📊",
        title: "Smart Lead Dashboard",
        desc: "See who’s serious and ready to act",
      },
      {
        icon: "🧠",
        title: "AI Lead Scoring",
        desc: "Know exactly which leads to prioritize",
      },
      {
        icon: "⚡",
        title: "Instant AI Follow-Up",
        desc: "Respond in seconds — not hours",
      },
      {
        icon: "🏡",
        title: "AI Property Comparison",
        desc: "Help clients decide faster (and trust you more)",
      },
      {
        icon: "🔄",
        title: "Automated Nurturing",
        desc: "Stay top-of-mind without lifting a finger",
      },
      {
        icon: "📞",
        title: "AI Receptionist",
        desc: "Answers every lead’s call 24/7 — and books the showing on the spot",
      },
      {
        icon: "📲",
        title: "AI Concierge",
        desc: "Confirms appointments, follows up with leads, and runs surveys — automatically",
      },
      {
        icon: "🧾",
        title: "Invoicing & Expenses",
        desc: "Bill clients, get paid, and track costs for tax time",
      },
      {
        icon: "📱",
        title: "Mobile App",
        desc: "Run your pipeline — and snap expense receipts — from your pocket",
      },
    ],
  },
  valueStack: {
    title: "Why Agents Choose RealtyBoss",
    benefits: [
      "More qualified leads",
      "Faster response time",
      "Higher close rates",
      "Less manual work",
      "More predictable income",
    ],
    closingLine1: "This isn’t just a tool.",
    closingLine2: "It’s your unfair advantage.",
  },
  productEcosystem: {
    title: "Powered by PropertyToolsAI",
    tagline: "This is your secret weapon vs competitors",
    line1: "We don’t just help you manage leads.",
    line2: "We generate them.",
    toolsIntro: "Our tools attract high-intent users:",
    tools: [
      { icon: "🏡", name: "Home Value" },
      { icon: "💰", name: "Mortgage Calculator" },
      { icon: "📊", name: "Property Comparison" },
    ],
    closing: "Then convert them into leads — for you.",
    toolsSiteHref: "https://www.propertytools.ai",
    toolsSiteLabel: "Explore PropertyTools AI",
  },
  proof: {
    eyebrow: "Results",
    title: "Real Results from Real Users",
    subtitle: "This is your money section.",
    stats: [
      { value: "100+", label: "leads generated" },
      { value: "3×", label: "faster response time" },
      { value: "Higher", label: "close rates" },
    ],
    quotes: [
      {
        text: "Got 12 qualified leads in 7 days",
        attribution: "Real Estate Agent (Arcadia)",
      },
      {
        text: "My response rate doubled overnight",
        attribution: "Loan Broker",
      },
      {
        text: "These are the first leads that actually convert",
        attribution: "Investor",
      },
    ],
  },
  pricing: {
    title: "Start Free. Pay When You Grow.",
    subtitle: "Simple & low friction.",
    freePlanName: "Starter Plan",
    premiumPlanName: "Premium",
    freeFeatures: ["Basic tools", "Limited leads", "Core features"],
    premiumFeatures: ["Unlimited leads", "Full AI automation", "Priority lead routing"],
    footnote: "Starting at $29/month",
    optionalOffer: "Pay per lead available",
    freeCta: "Get Started Free",
    premiumCta: "View plans & upgrade",
  },
  finalCta: {
    eyebrow: "Urgency",
    title: "Stop Losing Deals to Slow Follow-Ups",
    line1: "Your competitors are already responding faster.",
    line2: "Don’t let another lead go cold.",
    primary: "Get My First Leads Now",
  },
};

const brokerCopy: LandingCopy = {
  hero: {
    eyebrow: "The AI Growth Engine for Financing Brokers",
    headline: "Turn Mortgage Traffic into Closed Deals — Fast",
    line1: "Capture and convert high-intent loan clients automatically with AI.",
    primaryCta: "Get Started Free",
    secondaryCta: "Watch How Agents Get Leads in 60 Seconds",
    microProof: "No setup required • Works in minutes • Cancel anytime",
    trustLine: "Trusted by brokers turning mortgage traffic into qualified applications daily",
  },
  trustBar: {
    items: [
      "Used by financing teams in Los Angeles",
      "High-intent borrower leads generated daily",
      "3x faster response time with AI",
    ],
  },
  problem: {
    title: "You don’t have a traffic problem.",
    subtitle: "You have a conversion problem.",
    intro: "Borrowers are already hitting your site and tools…",
    painLabel: "But:",
    pains: [
      "They ghost after the first touch",
      "Too many tire-kickers burn LO time",
      "Follow-up slips when pipelines get busy",
      "Funded deals fall through the cracks",
    ],
    closingLead: "Every day this continues…",
    closingEmphasis: "You’re leaving revenue on the table.",
  },
  solution: {
    negations: ["This is NOT a CRM.", "This is NOT a lead generator."],
    title: "RealtyBoss is a Deal Conversion Engine.",
    punch1: "We don’t just give you applications.",
    punch2Prefix: "We turn them into ",
    punch2Emphasis: "funded clients",
    punch2Suffix: " — automatically.",
    wins: [
      "Capture high-intent borrowers from mortgage & home-financing tools",
      "Automatically qualify and score every opportunity",
      "Instantly follow up using AI",
      "Prioritize serious borrowers and referral partners",
      "Route files to the right LO at the right time",
    ],
    closing: "All on autopilot.",
  },
  howItWorks: {
    title: "Simple flow — from click to funded client",
    subtitle: "Three steps. No guesswork.",
    funnel: {
      caption: "Your pipeline, visualized",
      stages: ["Borrower traffic", "Scored opportunities", "AI follow-up"],
      hints: ["Site & tools", "Ready for LOs", "Compliant & fast"],
      outcome: "More funded loans",
    },
    steps: [
      {
        phase: "Attract",
        icon: "🌐",
        body: "Borrowers land on your rates, pre-qual, home value, and comparison tools.",
      },
      {
        phase: "Capture",
        icon: "🎯",
        body: "We convert engagement into scored, high-intent opportunities for your team.",
      },
      {
        phase: "Close",
        icon: "🤝",
        body: "AI follows up, stays compliant, and helps your LOs move files toward funding.",
      },
    ],
  },
  showcase: {
    title: "Everything You Need to Close More Deals",
    subtitle: "Power in your pipeline — not a feature laundry list.",
    items: [
      {
        icon: "📊",
        title: "Smart Lead Dashboard",
        desc: "See who’s serious and which files are ready to move",
      },
      {
        icon: "🧠",
        title: "AI Lead Scoring",
        desc: "Know exactly which opportunities to prioritize first",
      },
      {
        icon: "⚡",
        title: "Instant AI Follow-Up",
        desc: "Respond in seconds — compliant and on-brand",
      },
      {
        icon: "🏡",
        title: "AI Property Comparison",
        desc: "Help borrowers decide faster (and trust your guidance)",
      },
      {
        icon: "🔄",
        title: "Automated Nurturing",
        desc: "Stay top-of-mind while your LOs focus on funding",
      },
    ],
  },
  valueStack: {
    title: "Why Brokers Choose RealtyBoss",
    benefits: [
      "More qualified opportunities",
      "Faster response time",
      "Higher pull-through & close rates",
      "Less manual work",
      "More predictable income",
    ],
    closingLine1: "This isn’t just a tool.",
    closingLine2: "It’s your unfair advantage.",
  },
  productEcosystem: {
    title: "Powered by PropertyToolsAI",
    tagline: "This is your secret weapon vs competitors",
    line1: "We don’t just help you manage leads.",
    line2: "We generate them.",
    toolsIntro: "Our tools attract high-intent users:",
    tools: [
      { icon: "🏡", name: "Home Value" },
      { icon: "💰", name: "Mortgage Calculator" },
      { icon: "📊", name: "Property Comparison" },
    ],
    closing: "Then convert them into leads — for you.",
    toolsSiteHref: "https://www.propertytools.ai",
    toolsSiteLabel: "Explore PropertyTools AI",
  },
  proof: {
    eyebrow: "Results",
    title: "Real Results from Real Users",
    subtitle: "This is your money section.",
    stats: [
      { value: "100+", label: "leads & opportunities generated" },
      { value: "3×", label: "faster response time" },
      { value: "Higher", label: "pull-through & close rates" },
    ],
    quotes: [
      {
        text: "Got 12 qualified leads in 7 days",
        attribution: "Real Estate Agent (Arcadia)",
      },
      {
        text: "My response rate doubled overnight",
        attribution: "Loan Broker",
      },
      {
        text: "These are the first leads that actually convert",
        attribution: "Investor",
      },
    ],
  },
  pricing: {
    title: "Start Free. Pay When You Grow.",
    subtitle: "Simple & low friction.",
    freePlanName: "Starter Plan",
    premiumPlanName: "Premium",
    freeFeatures: ["Basic tools", "Limited leads", "Core features"],
    premiumFeatures: ["Unlimited leads", "Full AI automation", "Priority lead routing"],
    footnote: "Starting at $29/month",
    optionalOffer: "Pay per lead available",
    freeCta: "Get Started Free",
    premiumCta: "View plans & upgrade",
  },
  finalCta: {
    eyebrow: "Urgency",
    title: "Stop Losing Deals to Slow Follow-Ups",
    line1: "Your competitors are already responding faster.",
    line2: "Don’t let another opportunity go cold.",
    primary: "Get Started Free",
  },
};

export function getLandingCopy(role: UserRole): LandingCopy {
  return role === "broker" ? brokerCopy : agentCopy;
}

export const ROLE_STORAGE_KEY = "leadsmart_landing_role";
