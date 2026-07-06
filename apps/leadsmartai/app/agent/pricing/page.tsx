import type { Metadata } from "next";
import AgentPricingClientPage from "./page.client";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const tp = (key: string): string => t(key, { ns: "web_agent_pricing" });
  return {
    title: tp("meta.title"),
    description: tp("meta.description"),
    keywords: [
      "real estate CRM pricing",
      "real estate AI pricing",
      "leadsmart pricing",
      "real estate coaching pricing",
      "bilingual real estate CRM",
      "luxury real estate CRM",
      "agent CRM cost",
    ],
    alternates: { canonical: "/agent/pricing" },
    openGraph: {
      title: tp("meta.og_title"),
      description: tp("meta.og_description"),
      url: "/agent/pricing",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: tp("meta.twitter_title"),
      description: tp("meta.twitter_description"),
    },
  };
}

/**
 * JSON-LD payload — emitted server-side as one Product per plan
 * tier so search engines can render rich pricing snippets. Two
 * Offers per paid tier: monthly + annual, marked via `unitText`.
 */
const PRICING_PRODUCTS = [
  {
    name: "Starter",
    description: "For new agents testing the platform — up to 5 leads, 50 contacts, basic AI follow-up.",
    monthly: "0",
    annual: null,
  },
  {
    name: "Pro",
    description:
      "For active agents closing deals consistently. Includes Producer Track coaching, video email, BBA workflow, sphere + equity signals, and bilingual English / 中文 AI.",
    monthly: "79",
    annual: "790",
  },
  {
    name: "Premium",
    description:
      "For top producers running solo. Unlimited leads, Top Producer Track coaching, ISA workflow, and e-signature.",
    monthly: "199",
    annual: "1990",
  },
  {
    name: "Signature",
    description:
      "For relationship-driven agents serving high-value and bilingual clients. Sphere Intelligence Pro, white-glove onboarding, concierge support, cultural calendar automations, and custom voice tuning.",
    monthly: "399",
    annual: "3990",
  },
  {
    name: "Team",
    description:
      "For brokerages and small teams. Round-robin lead routing, per-member reporting, Top Producer Track for every seat, and team owner controls. Up to 5 seats.",
    monthly: "299",
    annual: "2990",
  },
] as const;

function offersFor(p: (typeof PRICING_PRODUCTS)[number]) {
  const offers: Array<Record<string, unknown>> = [
    {
      "@type": "Offer",
      price: p.monthly,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: p.monthly,
        priceCurrency: "USD",
        unitText: "MONTH",
      },
      url: "https://realtybossai.com/agent/pricing",
    },
  ];
  if (p.annual) {
    offers.push({
      "@type": "Offer",
      price: p.annual,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: p.annual,
        priceCurrency: "USD",
        unitText: "YEAR",
      },
      url: "https://realtybossai.com/agent/pricing",
    });
  }
  return offers;
}

/**
 * Agent pricing page — public marketing surface AND in-product
 * upgrade page in one. The client component renders different copy
 * based on the result of /api/agent/access-check.
 */
export default function AgentPricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": PRICING_PRODUCTS.map((p) => ({
              "@type": "Product",
              name: `RealtyBoss ${p.name}`,
              description: p.description,
              brand: { "@type": "Brand", name: "RealtyBoss" },
              category: "Real estate CRM",
              offers: offersFor(p),
            })),
          }),
        }}
      />
      <AgentPricingClientPage />
    </>
  );
}
