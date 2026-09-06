import type { Metadata } from "next";

import PlansClientPage from "./page.client";
import JsonLd from "@/components/JsonLd";
import { CREDIT_TIERS, annualPriceConfigured, setupFeeConfigured } from "@/lib/credits/pricing";
import { getServerT } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

/**
 * Public page for the credit ladder, so the plans we actually sell can be read
 * without signing in. Until now `CREDIT_TIERS` was rendered only by
 * `/dashboard/credits`, which is behind auth.
 *
 * Note this is NOT `/agent/pricing`. That page sells the older feature-gated
 * catalog off a different set of Stripe price env vars; reconciling the two is
 * a separate decision and is deliberately untouched here.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return pageMetadata({
    title: t("meta.title", { ns: "web_plans" }),
    description: t("meta.description", { ns: "web_plans" }),
    path: "/plans",
  });
}

export default async function PlansPage() {
  const t = await getServerT();

  return (
    <>
      {/* Offers are generated from the same constants the page renders, so the
          structured data can't quietly disagree with the visible price. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: "CloseBoss",
          description: t("meta.description", { ns: "web_plans" }),
          url: "https://closebossai.com/plans",
          offers: CREDIT_TIERS.map((tier) => ({
            "@type": "Offer",
            name: tier.name,
            price: String(tier.priceUsd),
            priceCurrency: "USD",
            url: "https://closebossai.com/plans",
          })),
        }}
      />
      <PlansClientPage
        annualTierIds={CREDIT_TIERS.filter((tier) => annualPriceConfigured(tier.id)).map(
          (tier) => tier.id,
        )}
        // A tier whose setup fee has no Stripe price yet gets "Talk to us"
        // instead of a buy button — the same rule as the annual toggle:
        // never advertise a purchase checkout cannot complete.
        unbuyableTierIds={CREDIT_TIERS.filter((tier) => !setupFeeConfigured(tier.id)).map(
          (tier) => tier.id,
        )}
      />
    </>
  );
}
