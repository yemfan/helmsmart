/**
 * Blog post registry — drives the public /blog index and feeds
 * sitemap.ts. Each entry is a self-describing record so a new post
 * is one append-only change plus (optionally) a new route folder.
 *
 * Posts come in two flavors:
 *   - "article" — a hand-written narrative piece living at its own
 *     route (e.g. /blog/liondesk-shutdown-what-agents-should-do-next).
 *     We render a teaser card on the index and let the route file
 *     carry the full content + JSON-LD.
 *   - "evergreen" — an existing SEO content page (the cap-rate
 *     library) that already had a /blog/<slug> re-export folder.
 *     Listing them here keeps the index complete without forcing a
 *     content rewrite.
 */

export type BlogPostKind = "article" | "evergreen";

export type BlogCategory = "industry-news" | "ai-and-automation" | "investing";

export type BlogPost = {
  slug: string;
  /** Full URL path relative to site root, e.g. /blog/foo. */
  href: string;
  title: string;
  /** ~160 char description for meta + card body. */
  description: string;
  /** ISO date (YYYY-MM-DD). Used for sort + display + JSON-LD. */
  publishedAt: string;
  author: string;
  readTime: string;
  category: BlogCategory;
  kind: BlogPostKind;
  /** Optional: pin to top of the index regardless of date. */
  featured?: boolean;
};

const CATEGORY_LABELS: Record<BlogCategory, string> = {
  "industry-news": "Industry news",
  "ai-and-automation": "AI & automation",
  investing: "Investing",
};

export function categoryLabel(c: BlogCategory): string {
  return CATEGORY_LABELS[c];
}

export const BLOG_POSTS: ReadonlyArray<BlogPost> = [
  {
    slug: "your-crm-should-call-your-sphere-not-just-text-it",
    href: "/blog/your-crm-should-call-your-sphere-not-just-text-it",
    title: "Your CRM Should Call Your Sphere — Not Just Text It",
    description:
      "Every CRM sends SMS and email drips. None of them pick up the phone. Here's why outbound AI voice calls to your sphere — plus an AI team you command from one instruction — is the real upgrade for 2026.",
    publishedAt: "2026-06-23",
    author: "Michael Ye",
    readTime: "5 min",
    category: "ai-and-automation",
    kind: "article",
    featured: true,
  },
  {
    slug: "why-real-estate-crms-keep-failing-solo-agents",
    href: "/blog/why-real-estate-crms-keep-failing-solo-agents",
    title: "Why Real Estate CRMs Keep Failing Solo Agents (and What LionDesk's Shutdown Reveals)",
    description:
      "LionDesk's shutdown isn't a one-off — it's the symptom of a CRM market that was never built for solo agents. A breakdown of the real problems with Follow Up Boss, kvCORE, Lofty, BoomTown, and Sierra, and what a CRM should look like in 2026.",
    publishedAt: "2026-05-23",
    author: "Michael Ye",
    readTime: "8 min",
    category: "ai-and-automation",
    kind: "article",
    featured: true,
  },
  {
    slug: "liondesk-shutdown-what-agents-should-do-next",
    href: "/blog/liondesk-shutdown-what-agents-should-do-next",
    title: "LionDesk Is Shutting Down: What Solo Agents Should Do Next",
    description:
      "LionDesk is winding down. Here's why a forced CRM migration is the best thing that could happen to your business — and how to pick a replacement built for speed.",
    publishedAt: "2026-05-22",
    author: "Michael Ye",
    readTime: "5 min",
    category: "industry-news",
    kind: "article",
  },
  {
    slug: "what-is-cap-rate",
    href: "/blog/what-is-cap-rate",
    title: "What Is Cap Rate in Real Estate?",
    description:
      "A clear explanation of capitalization rate, the formula, and why it matters for evaluating rental property income.",
    publishedAt: "2025-09-04",
    author: "LeadSmart AI",
    readTime: "7 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "how-to-calculate-cap-rate",
    href: "/blog/how-to-calculate-cap-rate",
    title: "How to Calculate Cap Rate Step by Step",
    description:
      "Walk through the cap rate formula with a concrete rental example — gross rent, vacancy, operating expenses, NOI, and final yield.",
    publishedAt: "2025-09-11",
    author: "LeadSmart AI",
    readTime: "6 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "what-is-a-good-cap-rate-for-rental-property",
    href: "/blog/what-is-a-good-cap-rate-for-rental-property",
    title: "What Is a Good Cap Rate for Rental Property?",
    description:
      "Typical cap rate ranges by market tier, how to benchmark against comps, and why the highest cap rate isn't always the best deal.",
    publishedAt: "2025-09-18",
    author: "LeadSmart AI",
    readTime: "5 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "cap-rate-vs-roi",
    href: "/blog/cap-rate-vs-roi",
    title: "Cap Rate vs. ROI: What's the Difference?",
    description:
      "Cap rate measures the property; ROI measures your investment. When to use each and how leverage changes the answer.",
    publishedAt: "2025-09-25",
    author: "LeadSmart AI",
    readTime: "6 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "cap-rate-vs-cash-on-cash-return",
    href: "/blog/cap-rate-vs-cash-on-cash-return",
    title: "Cap Rate vs. Cash-on-Cash Return",
    description:
      "How financing transforms your real return, why cash-on-cash is the metric leveraged investors track, and how it complements cap rate.",
    publishedAt: "2025-10-02",
    author: "LeadSmart AI",
    readTime: "5 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "cap-rate-vs-internal-rate-of-return-irr",
    href: "/blog/cap-rate-vs-internal-rate-of-return-irr",
    title: "Cap Rate vs. Internal Rate of Return (IRR)",
    description:
      "IRR captures the full lifecycle — buy, hold, sell. Where cap rate fits in a fund-style analysis vs. a quick screen.",
    publishedAt: "2025-10-09",
    author: "LeadSmart AI",
    readTime: "6 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "cap-rate-vs-gross-rent-multiplier",
    href: "/blog/cap-rate-vs-gross-rent-multiplier",
    title: "Cap Rate vs. Gross Rent Multiplier (GRM)",
    description:
      "Why GRM is a faster but coarser screen than cap rate, and how to use both at different stages of underwriting.",
    publishedAt: "2025-10-16",
    author: "LeadSmart AI",
    readTime: "4 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "how-cap-rate-affects-property-value",
    href: "/blog/how-cap-rate-affects-property-value",
    title: "How Cap Rate Affects Property Value",
    description:
      "The income approach to valuation in plain English — and why even a 0.5% cap rate move can swing value by tens of thousands.",
    publishedAt: "2025-10-23",
    author: "LeadSmart AI",
    readTime: "5 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "how-banks-use-cap-rate-to-value-property",
    href: "/blog/how-banks-use-cap-rate-to-value-property",
    title: "How Banks Use Cap Rate to Value Property",
    description:
      "What lenders look at when sizing a commercial real estate loan, and how appraisers translate cap rates into LTV decisions.",
    publishedAt: "2025-10-30",
    author: "LeadSmart AI",
    readTime: "5 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "how-cap-rate-changes-in-different-markets",
    href: "/blog/how-cap-rate-changes-in-different-markets",
    title: "How Cap Rate Changes in Different Markets",
    description:
      "Why prime metros trade at 3–4% cap rates and tertiary markets at 8%+ — the supply, demand, and risk story behind the spread.",
    publishedAt: "2025-11-06",
    author: "LeadSmart AI",
    readTime: "6 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "how-to-analyze-a-property-using-cap-rate",
    href: "/blog/how-to-analyze-a-property-using-cap-rate",
    title: "How to Analyze a Property Using Cap Rate",
    description:
      "A practical walkthrough — gather comps, verify NOI, stress-test expenses, and decide whether to make the offer.",
    publishedAt: "2025-11-13",
    author: "LeadSmart AI",
    readTime: "7 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "how-to-increase-cap-rate-on-rental-property",
    href: "/blog/how-to-increase-cap-rate-on-rental-property",
    title: "How to Increase Cap Rate on Rental Property",
    description:
      "Practical levers to lift NOI — rent optimization, expense control, value-add improvements — and how they translate to property value.",
    publishedAt: "2025-11-20",
    author: "LeadSmart AI",
    readTime: "6 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "cap-rate-for-multifamily-investments",
    href: "/blog/cap-rate-for-multifamily-investments",
    title: "Cap Rate for Multifamily Investments",
    description:
      "How multifamily cap rates differ from single-family, what professional investors expect by class (A/B/C), and where the opportunities are.",
    publishedAt: "2025-11-27",
    author: "LeadSmart AI",
    readTime: "6 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "cap-rate-formula-explained-for-beginners",
    href: "/blog/cap-rate-formula-explained-for-beginners",
    title: "Cap Rate Formula Explained for Beginners",
    description:
      "The cap rate formula broken down for first-time investors, with worked examples and a free calculator to try it yourself.",
    publishedAt: "2025-12-04",
    author: "LeadSmart AI",
    readTime: "5 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "cap-rate-example-for-rental-property",
    href: "/blog/cap-rate-example-for-rental-property",
    title: "Cap Rate Example for Rental Property",
    description:
      "A fully worked rental cap rate example — purchase price, gross rent, vacancy, expenses, NOI, and the final yield calculation.",
    publishedAt: "2025-12-11",
    author: "LeadSmart AI",
    readTime: "5 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "cap-rate-calculator-how-to-use-it",
    href: "/blog/cap-rate-calculator-how-to-use-it",
    title: "Cap Rate Calculator: How to Use It",
    description:
      "Step-by-step guide to the LeadSmart AI Cap Rate Calculator — inputs, outputs, and the assumptions that matter most.",
    publishedAt: "2025-12-18",
    author: "LeadSmart AI",
    readTime: "4 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "cap-rate-mistakes-real-estate-investors-make",
    href: "/blog/cap-rate-mistakes-real-estate-investors-make",
    title: "Cap Rate Mistakes Real Estate Investors Make",
    description:
      "Common cap rate pitfalls — underestimating expenses, comparing dissimilar assets, ignoring capex — and how to avoid them.",
    publishedAt: "2026-01-08",
    author: "LeadSmart AI",
    readTime: "5 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "cap-rate-by-city-in-the-united-states",
    href: "/blog/cap-rate-by-city-in-the-united-states",
    title: "Cap Rate by City in the United States",
    description:
      "Typical cap rate ranges for major U.S. markets — coastal metros, sunbelt growth cities, and value-priced tertiary markets.",
    publishedAt: "2026-01-15",
    author: "LeadSmart AI",
    readTime: "6 min",
    category: "investing",
    kind: "evergreen",
  },
  {
    slug: "why-cap-rate-matters-for-real-estate-investors",
    href: "/blog/why-cap-rate-matters-for-real-estate-investors",
    title: "Why Cap Rate Matters for Real Estate Investors",
    description:
      "Why every serious investor speaks cap rate fluently — and how it shapes acquisition, financing, and exit decisions.",
    publishedAt: "2026-01-22",
    author: "LeadSmart AI",
    readTime: "5 min",
    category: "investing",
    kind: "evergreen",
  },
];

/** Convenience: sorted newest-first, with featured posts pinned to the top. */
export function sortedPosts(): BlogPost[] {
  return [...BLOG_POSTS].sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}

/** Look up a post by slug for per-post pages. */
export function getPost(slug: string): BlogPost | null {
  return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}
