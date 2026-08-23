/** Single source of truth for site identity, navigation and outbound links. */

export const SITE = {
  name: "AI Business Works",
  program: "AI Business Works Partner Program",
  shortName: "AI Business Works",
  domain: "aibusinessworks.business",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://aibusinessworks.business",
  tagline: "Help businesses adopt AI. Build customer value. Earn recurring commissions.",
  philosophy: ["Learn AI.", "Share AI.", "Create value.", "Grow with AI."],
  description:
    "The AI Business Works Partner Program is a professional AI solutions partner program. Partners help businesses adopt AI and earn recurring commissions on qualifying customer subscriptions.",
  contactEmail: "partners@aibusinessworks.business",
} as const;

export const PRIMARY_NAV = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/compensation", label: "Compensation" },
  { href: "/leadership", label: "Leadership" },
  { href: "/solutions", label: "Solutions" },
  { href: "/academy", label: "Academy" },
  { href: "/partners", label: "Partners" },
  { href: "/faq", label: "FAQ" },
] as const;

export const FOOTER_NAV = [
  {
    heading: "Program",
    links: [
      { href: "/how-it-works", label: "How It Works" },
      { href: "/compensation", label: "Compensation Plan" },
      { href: "/leadership", label: "Leadership Program" },
      { href: "/compensation#simulator", label: "Commission Simulator" },
      { href: "/success-stories", label: "Success Stories" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { href: "/solutions#closeboss", label: "CloseBoss AI" },
      { href: "/solutions#marketingboss", label: "MarketingBoss AI" },
      { href: "/solutions#helmsmart", label: "HelmSmart AI" },
      { href: "/solutions", label: "The Ecosystem" },
    ],
  },
  {
    heading: "Partners",
    links: [
      { href: "/join", label: "Become a Partner" },
      { href: "/login", label: "Partner Login" },
      { href: "/academy", label: "Partner Academy" },
      { href: "/resources", label: "Partner Resources" },
      { href: "/partners", label: "Partner Directory" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms", label: "Partner Program Terms" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/marketing-guidelines", label: "Marketing Guidelines" },
      { href: "/faq#earnings", label: "Earnings Disclaimer" },
    ],
  },
] as const;

/**
 * The standing disclaimer. Any page that shows a rate, an example or a total
 * renders one of these - never an implied guarantee.
 */
export const DISCLAIMERS = {
  hero:
    "Actual commissions depend on qualifying customer revenue, product plans, discounts, refunds, cancellations, chargebacks, applicable compensation rules, and official Partner Program Terms.",
  illustration:
    "Illustration only. Not a guarantee of earnings. Figures are arithmetic examples of the compensation structure, not typical or expected results.",
  final:
    "Participation, eligibility, commissions, customer discounts, Leadership Override, and payout terms are subject to the official AI Business Works Partner Program Terms.",
  structure:
    "This is a compensation structure, not an earnings guarantee. Actual commissions depend on qualifying revenue and official program rules.",
} as const;

export const CTA = {
  primary: { label: "Become a Partner", href: "/join" },
  secondary: { label: "See How It Works", href: "/how-it-works" },
  compensation: { label: "View Compensation", href: "/compensation" },
  solutions: { label: "Explore Solutions", href: "/solutions" },
  academy: { label: "Visit the Academy", href: "/academy" },
  resources: { label: "View Resources", href: "/resources" },
  login: { label: "Log In", href: "/login" },
} as const;
