import type { Metadata } from "next";

import ConsumerPricingClientPage from "./page.client";
import { redirectAdminSupportAwayFromCommercialPricing } from "@/lib/auth/redirectStaffFromCommercialPricing";
import JsonLd from "@/components/JsonLd";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pricing.title", { ns: "web_marketing" }),
    description: t("pricing.description", { ns: "web_marketing" }),
    alternates: {
      canonical: "/pricing",
    },
  };
}

export default async function ConsumerPricingPage() {
  await redirectAdminSupportAwayFromCommercialPricing();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "RealtorBoss",
          description:
            "AI-powered CRM and lead management platform for real estate professionals. Capture, qualify, and convert leads with intelligent automation.",
          url: "https://leadsmart-ai.com/pricing",
          applicationCategory: "BusinessApplication",
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "USD",
            offers: [
              {
                "@type": "Offer",
                name: "Starter Plan",
                price: "0",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
                description:
                  "Limited functions and usages. Up to 5 leads, 50 contacts.",
                url: "https://leadsmart-ai.com/signup",
              },
              {
                "@type": "Offer",
                name: "Pro Plan (monthly)",
                price: "49",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
                billingIncrement: "P1M",
                description:
                  "Full CRM and AI for active agents. Producer Track coaching, bilingual English / 中文 AI.",
                url: "https://leadsmart-ai.com/pricing",
              },
              {
                "@type": "Offer",
                name: "Pro Plan (annual)",
                price: "490",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
                billingIncrement: "P1Y",
                description: "Pro tier billed annually — save 2 months vs monthly.",
                url: "https://leadsmart-ai.com/agent/pricing",
              },
              {
                "@type": "Offer",
                name: "Premium Plan (monthly)",
                price: "99",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
                billingIncrement: "P1M",
                description:
                  "For top producers closing 10+ deals/month. Top Producer Track coaching, unlimited everything.",
                url: "https://leadsmart-ai.com/pricing",
              },
              {
                "@type": "Offer",
                name: "Premium Plan (annual)",
                price: "990",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
                billingIncrement: "P1Y",
                description: "Premium tier billed annually — save 2 months vs monthly.",
                url: "https://leadsmart-ai.com/agent/pricing",
              },
              {
                "@type": "Offer",
                name: "Signature Plan (monthly)",
                price: "249",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
                billingIncrement: "P1M",
                description:
                  "Relationship-driven agents serving high-value clients. Sphere Intelligence Pro, white-glove onboarding, concierge support, cultural calendar automations, custom voice tuning.",
                url: "https://leadsmart-ai.com/agent/pricing",
              },
              {
                "@type": "Offer",
                name: "Signature Plan (annual)",
                price: "2490",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
                billingIncrement: "P1Y",
                description: "Signature tier billed annually — save 2 months vs monthly.",
                url: "https://leadsmart-ai.com/agent/pricing",
              },
              {
                "@type": "Offer",
                name: "Team Plan (monthly)",
                price: "299",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
                billingIncrement: "P1M",
                description:
                  "Brokerages and small teams. Round-robin lead routing, per-member reporting, Top Producer Track for every seat.",
                url: "https://leadsmart-ai.com/contact",
              },
              {
                "@type": "Offer",
                name: "Team Plan (annual)",
                price: "2990",
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
                billingIncrement: "P1Y",
                description: "Team tier billed annually — save 2 months vs monthly.",
                url: "https://leadsmart-ai.com/contact",
              },
            ],
          },
        }}
      />
      <ConsumerPricingClientPage />

      {/* Cost-contrast: a human team vs your AI team — anchors the plan
          prices against what hiring real staff would cost. */}
      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">
              The math
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">
              A human team vs your AI team
            </h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-400">
              Hiring even a partial team adds up fast — and you&apos;d still have to manage it.
              Your AI team does the same jobs for the price of a tool.
            </p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                A human team — per year
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li>Receptionist / answering service</li>
                <li>Inside sales agent (ISA)</li>
                <li>Transaction coordinator</li>
                <li>Marketing assistant</li>
                <li>Bookkeeper</li>
              </ul>
              <p className="mt-5 text-3xl font-extrabold text-slate-900 dark:text-white">
                $100k+<span className="text-base font-semibold text-slate-500">/yr</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Plus benefits, training, and turnover — and you manage all of it.
              </p>
            </div>

            <div className="rounded-2xl border-2 border-[#0072ce] bg-gradient-to-br from-[#0072ce]/5 to-transparent p-7 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#0072ce]">
                Your AI team — RealtorBoss
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <li>All six assistants, working together</li>
                <li>Answers + cold-calls + qualifies + follows up</li>
                <li>Coordinates deals + keeps the books</li>
                <li>Trained on top-agent playbooks</li>
                <li>24/7 — no payroll, benefits, or turnover</li>
              </ul>
              <p className="mt-5 text-3xl font-extrabold text-[#0072ce]">
                From $49<span className="text-base font-semibold text-slate-500">/mo</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                The whole team — virtually free next to one human hire.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
