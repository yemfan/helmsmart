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
  summary: string;
  sector: string;
  href?: string;
};

export const portfolio: PortfolioCompany[] = [
  {
    name: "HelmSmart",
    summary: "AI-powered business operations platform.",
    sector: "AI • SaaS",
    href: "https://helmsmart.ai",
  },
  {
    name: "RealtorBoss",
    summary: "AI workforce for real estate professionals.",
    sector: "AI • PropTech",
    href: "https://www.realtybossai.com",
  },
  {
    name: "LeadSmart AI",
    summary: "AI lead engagement and sales automation.",
    sector: "AI • Sales",
  },
  {
    name: "Voltrixos",
    summary: "Smart electric mobility venture.",
    sector: "Smart Mobility",
  },
];

export type Milestone = {
  year: string;
  name: string;
  summary: string;
  location: string;
};

export const milestones: Milestone[] = [
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
  {
    year: "2025–2026",
    name: "AI Venture Expansion",
    summary: "Development of HelmSmart, RealtorBoss, LeadSmart AI, and Voltrixos.",
    location: "AI • SaaS • PropTech • Smart Mobility",
  },
];

export const navLinks = [
  { label: "Portfolio", href: "#portfolio" },
  { label: "Our Journey", href: "#journey" },
  { label: "Contact", href: "#contact" },
] as const;
