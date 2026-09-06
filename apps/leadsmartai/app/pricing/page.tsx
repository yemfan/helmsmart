import type { Metadata } from "next";

import ConsumerPricingClientPage from "./page.client";
import { redirectAdminSupportAwayFromCommercialPricing } from "@/lib/auth/redirectStaffFromCommercialPricing";
import JsonLd from "@/components/JsonLd";
import { CREDIT_TIERS, FREE_TIER, annualUsd } from "@/lib/credits/pricing";
import { getServerT } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return pageMetadata({
    title: t("pricing.title", { ns: "web_marketing" }),
    description: t("pricing.description", { ns: "web_marketing" }),
    path: "/pricing",
  });
}

export default async function ConsumerPricingPage() {
  await redirectAdminSupportAwayFromCommercialPricing();
  const t = await getServerT();
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "CloseBoss",
          description:
            "AI-powered CRM and lead management platform for real estate professionals. Capture, qualify, and convert leads with intelligent automation.",
          url: "https://closebossai.com/pricing",
          applicationCategory: "BusinessApplication",
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: "USD",
            /*
             * Derived from the catalogue, never typed here.
             *
             * This block advertised the retired ladder to Google - Pro $49,
             * Pro annual $490, Premium $99, Team - long after Stripe had moved
             * to $79/$159/$299/$399. Structured data is what a search result
             * quotes, so a stale number here misquotes the price in the one
             * place a prospect sees before reaching the site at all. One offer
             * even pointed at a page that is now a redirect.
             */
            offers: [
              {
                "@type": "Offer",
                name: `${FREE_TIER.name} Plan`,
                price: String(FREE_TIER.priceUsd),
                priceCurrency: "USD",
                priceValidUntil: "2027-12-31",
                description: FREE_TIER.blurb,
                url: "https://closebossai.com/agent-signup",
              },
              ...CREDIT_TIERS.flatMap((tier) => [
                {
                  "@type": "Offer",
                  name: `${tier.name} Plan (monthly)`,
                  price: String(tier.priceUsd),
                  priceCurrency: "USD",
                  priceValidUntil: "2027-12-31",
                  billingIncrement: "P1M",
                  description: tier.blurb,
                  url: "https://closebossai.com/plans",
                },
                {
                  "@type": "Offer",
                  name: `${tier.name} Plan (annual)`,
                  price: String(annualUsd(tier.id) ?? tier.priceUsd * 10),
                  priceCurrency: "USD",
                  priceValidUntil: "2027-12-31",
                  billingIncrement: "P1Y",
                  description: `${tier.name} billed annually - twelve months for the price of ten.`,
                  url: "https://closebossai.com/plans",
                },
              ]),
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0072ce]">{t("pages.pricing.theMath", { ns: "dashboard" })}</p>
            <h2 className="mt-2 font-heading text-3xl font-bold text-slate-900 md:text-4xl dark:text-white">{t("pages.pricing.humanVsAi", { ns: "dashboard" })}</h2>
            <p className="mt-4 text-base text-slate-600 dark:text-slate-400">{t("pages.pricing.hiringAddsUp", { ns: "dashboard" })}</p>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.pricing.humanPerYear", { ns: "dashboard" })}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li>{t("pricingCompare.receptionist", { ns: "web_marketing" })}</li>
                <li>{t("pricingCompare.isa", { ns: "web_marketing" })}</li>
                <li>{t("pricingCompare.tc", { ns: "web_marketing" })}</li>
                <li>{t("pricingCompare.marketing", { ns: "web_marketing" })}</li>
                <li>{t("pages.oneWord.bookkeeper", { ns: "dashboard" })}</li>
              </ul>
              <p className="mt-5 text-3xl font-extrabold text-slate-900 dark:text-white">
                $100k+<span className="text-base font-semibold text-slate-500">/yr</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">{t("pages.pricing.plusBenefits", { ns: "dashboard" })}</p>
            </div>

            <div className="rounded-2xl border-2 border-[#0072ce] bg-gradient-to-br from-[#0072ce]/5 to-transparent p-7 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#0072ce]">{t("pages.pricing.yourAiTeam", { ns: "dashboard" })}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <li>{t("pricingCompare.allSix", { ns: "web_marketing" })}</li>
                <li>{t("pricingCompare.answers", { ns: "web_marketing" })}</li>
                <li>{t("pricingCompare.coordinates", { ns: "web_marketing" })}</li>
                <li>{t("pricingCompare.trained", { ns: "web_marketing" })}</li>
                <li>{t("pricingCompare.alwaysOn", { ns: "web_marketing" })}</li>
              </ul>
              <p className="mt-5 text-3xl font-extrabold text-[#0072ce]">
                From $79<span className="text-base font-semibold text-slate-500">/mo</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">{t("pages.pricing.virtuallyFree", { ns: "dashboard" })}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
