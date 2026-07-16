/**
 * Single source of truth for the site's copy. Everything the marketing site
 * renders comes from here, so adding a portfolio company or a milestone is a
 * one-line edit rather than a component change.
 */

export const company = {
  name: "MAXY Investment Inc.",
  tagline: "INVESTMENT • TECHNOLOGY • REAL ESTATE",
  description:
    "MAXY Investment Inc. builds, invests in, and scales businesses across real estate, hospitality, technology, and artificial intelligence.",
  address: {
    street: "6511 Parkriver Xing",
    city: "Sugar Land",
    state: "TX",
    zip: "77479",
  },
  phone: "626-625-5055",
  email: "contact@maxyinvestment.com",
  website: "www.maxyinvestment.com",
  url: "https://www.maxyinvestment.com",
} as const;

export type PortfolioCompany = {
  name: string;
  /** One line — the homepage cards. */
  summary: string;
  /** Fuller description — the About page. */
  detail: string;
  sector: string;
  href?: string;
};

export const portfolio: PortfolioCompany[] = [
  {
    name: "HelmSmart",
    summary: "AI-powered business operations platform.",
    detail:
      "An AI Business Operating Platform helping organizations automate operations and scale intelligently.",
    sector: "AI • SaaS",
    href: "https://helmsmart.ai",
  },
  {
    name: "RealtorBoss",
    summary: "AI workforce for real estate professionals.",
    detail: "An AI-powered workforce built specifically for real estate professionals.",
    sector: "AI • PropTech",
    href: "https://www.realtybossai.com",
  },
  {
    name: "LeadSmart AI",
    summary: "AI lead engagement and sales automation.",
    detail: "Intelligent lead engagement and sales automation for growing businesses.",
    sector: "AI • Sales",
  },
  {
    name: "Voltrixos",
    summary: "Smart electric mobility venture.",
    detail: "Developing smart electric mobility solutions for the next generation.",
    sector: "Smart Mobility",
  },
];

export type Milestone = {
  year: string;
  name: string;
  summary: string;
  location: string;
};

/**
 * The operating history, shared by both timelines. The homepage collapses the AI
 * era into one summary row and the About page lists each venture — so these rows
 * are defined ONCE here rather than maintained in two places where they'd drift.
 */
const foundingMilestones: Milestone[] = [
  {
    year: "2006",
    name: "First Dream Home LLC",
    summary: "Residential home-building business.",
    location: "Peoria, Illinois",
  },
  {
    year: "2012",
    name: "YES Investment LLC",
    summary: "Expanded into commercial real estate investment.",
    location: "Peoria, Illinois",
  },
  {
    year: "2017",
    name: "Yeluh LLC",
    summary: "Entered the hospitality investment sector.",
    location: "Irvine, California",
  },
  {
    year: "2018",
    name: "Yeluh Hospitality LLC",
    summary:
      "Hotel management and acquisition of a newly constructed 84-room Holiday Inn Express & Suites.",
    location: "Missouri City, Texas",
  },
  {
    year: "2020",
    name: "Excentury Investment LLC",
    summary: "Commercial real estate investment in Greater Houston.",
    location: "Houston, Texas",
  },
  {
    year: "2023",
    name: "MAXY Investment Inc.",
    summary:
      "Established a broader platform for investment, technology, real estate, and new ventures.",
    location: "Sugar Land, Texas",
  },
];

/** Each AI venture as its own milestone — the About page's fuller telling. */
const ventureMilestones: Milestone[] = [
  {
    year: "2025",
    name: "HelmSmart",
    summary: "AI business operating platform.",
    location: "AI • SaaS",
  },
  {
    year: "2026",
    name: "RealtorBoss",
    summary: "AI workforce for real estate professionals.",
    location: "AI • PropTech",
  },
  {
    year: "2026",
    name: "LeadSmart AI",
    summary: "Intelligent lead engagement and sales automation.",
    location: "AI • Sales",
  },
  {
    year: "2026",
    name: "Voltrixos",
    summary: "Smart electric mobility for the next generation.",
    location: "Smart Mobility",
  },
];

/** Homepage: the operating history, with the AI era as a single summary row. */
export const milestones: Milestone[] = [
  ...foundingMilestones,
  {
    year: "2025–2026",
    name: "AI Venture Expansion",
    summary: "Development of HelmSmart, RealtorBoss, LeadSmart AI, and Voltrixos.",
    location: "AI • SaaS • PropTech • Smart Mobility",
  },
];

/** About: the same history, with every venture called out. */
export const detailedMilestones: Milestone[] = [...foundingMilestones, ...ventureMilestones];

export type Belief = {
  title: string;
  lead: string;
  body: string;
};

export const beliefs: Belief[] = [
  {
    title: "Build Businesses That Matter",
    lead: "Technology should solve real problems. Not create more complexity.",
    body: "Every company we build must improve how people work, communicate, and make decisions.",
  },
  {
    title: "Think Long Term",
    lead: "Great companies aren’t built overnight.",
    body: "We believe in patient innovation, continuous improvement, and sustainable growth.",
  },
  {
    title: "Execution Matters",
    lead: "Ideas are everywhere. Execution creates value.",
    body: "Our focus is transforming ideas into real businesses that customers trust.",
  },
];

export const leadership = {
  name: "Michael Fan Ye",
  role: "Founder & CEO",
  bio: [
    "Michael Fan Ye is an entrepreneur with nearly two decades of experience spanning residential construction, commercial real estate investment, hospitality ownership and management, and enterprise software development.",
    "His career combines hands-on operating experience with deep technical expertise in software engineering, artificial intelligence, automation, and business systems.",
    "Through MAXY Investment Inc., Michael is building a portfolio of intelligent businesses designed to help organizations work smarter, scale faster, and create lasting value.",
  ],
} as const;

/**
 * Root-relative, not bare fragments: these render on /about and /contact too,
 * where a bare "#portfolio" would resolve against a page with no such section.
 *
 * No "Our Journey" entry — About tells that story in full and the homepage
 * still has its own section. A fourth item also wrapped to two lines at 375px.
 */
export const navLinks = [
  { label: "About", href: "/about" },
  { label: "Portfolio", href: "/#portfolio" },
  { label: "Contact", href: "/contact" },
] as const;
