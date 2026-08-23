/**
 * Product catalogue for the public site.
 *
 * The database carries the same catalogue for dashboard and admin use; this
 * file keeps the marketing pages fully renderable without a database, and is
 * the copy of record for product positioning.
 */

export interface ProductContent {
  key: "closeboss" | "marketingboss" | "helmsmart";
  name: string;
  tagline: string;
  category: string;
  audience: string;
  summary: string;
  helps: string[];
  proofPoints: { label: string; detail: string }[];
  accent: "cyan" | "gold" | "navy";
  cta: string;
  siteUrl: string;
}

export const PRODUCTS: ProductContent[] = [
  {
    key: "closeboss",
    name: "CloseBoss AI",
    tagline: "The AI Sales Team for Real Estate.",
    category: "AI Sales",
    audience: "Real estate professionals, teams and brokerages",
    summary:
      "Real estate runs on speed of response. CloseBoss AI answers, follows up and qualifies around the clock, so the agent spends their hours with the people who are actually ready to move.",
    helps: [
      "Capture leads from every source into one place",
      "Follow up in seconds, then keep following up",
      "Qualify prospects before they reach the agent",
      "Automate calls, texts and email in the agent's own voice",
      "Increase sales productivity without adding headcount",
    ],
    proofPoints: [
      { label: "Answers", detail: "Inbound calls and texts handled the moment they arrive" },
      { label: "Follows up", detail: "Sequences that continue for months, not days" },
      { label: "Qualifies", detail: "Timeline, motivation and financing captured up front" },
    ],
    accent: "cyan",
    cta: "Explore CloseBoss",
    siteUrl: "https://www.closeboss.ai",
  },
  {
    key: "marketingboss",
    name: "MarketingBoss AI",
    tagline: "The AI Marketing Team for Business.",
    category: "AI Marketing",
    audience: "Small and mid-sized businesses carrying marketing themselves",
    summary:
      "Most small businesses do not have a marketing department. MarketingBoss AI plans the campaign, produces the content, publishes it across channels and keeps adjusting based on what performs.",
    helps: [
      "Plan marketing around real business goals",
      "Create content at the volume a channel actually needs",
      "Distribute to every channel from one place",
      "Optimise against what performed, not what was planned",
      "Grow an audience consistently rather than in bursts",
    ],
    proofPoints: [
      { label: "Plans", detail: "A weekly schedule the business can actually keep" },
      { label: "Produces", detail: "Copy, images and video from one brief" },
      { label: "Publishes", detail: "Scheduled and posted across connected channels" },
    ],
    accent: "gold",
    cta: "Explore MarketingBoss",
    siteUrl: "https://www.marketingbossai.com",
  },
  {
    key: "helmsmart",
    name: "HelmSmart AI",
    tagline: "The AI Business Operating Platform.",
    category: "AI Operations",
    audience: "Operators running multi-function businesses",
    summary:
      "The operating layer underneath the business: communication, workflows, company knowledge and an AI Workforce that carries repeatable work end to end.",
    helps: [
      "Unify customer communication across channels",
      "Automate the workflows that run the business",
      "Turn scattered company knowledge into something usable",
      "Give operations an AI Workforce with defined responsibilities",
      "Keep a human in the loop where judgement is required",
    ],
    proofPoints: [
      { label: "Communication", detail: "Calls, messages and email in one operating view" },
      { label: "Workflows", detail: "Repeatable processes that run without chasing" },
      { label: "Knowledge", detail: "The business's own information, answerable on demand" },
    ],
    accent: "navy",
    cta: "Explore HelmSmart",
    siteUrl: "https://www.helmsmart.ai",
  },
];

export function productByKey(key: string): ProductContent | undefined {
  return PRODUCTS.find((p) => p.key === key);
}

/** The ecosystem AI Business Works sits at the centre of. */
export const ECOSYSTEM = [
  {
    key: "solutions",
    name: "AI Business Solutions",
    detail: "The products businesses adopt: CloseBoss AI, MarketingBoss AI, HelmSmart AI.",
  },
  {
    key: "workforce",
    name: "AI Workforce",
    detail: "AI employees with defined roles that carry repeatable work end to end.",
  },
  {
    key: "academy",
    name: "Education / Academy",
    detail: "How businesses and Partners learn what AI does well, and where it does not.",
  },
  {
    key: "media",
    name: "Media / Authority",
    detail: "The research, writing and analysis that makes the case credible.",
  },
  {
    key: "partners",
    name: "Partner Program",
    detail: "The human distribution network that brings the solutions to market.",
  },
] as const;
