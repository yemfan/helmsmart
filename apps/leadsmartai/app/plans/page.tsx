import type { Metadata } from "next";

import PlansClientPage from "./page.client";
import JsonLd from "@/components/JsonLd";
import { CREDIT_TIERS, annualPriceConfigured } from "@/lib/credits/pricing";
import { getServerT } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

/**
 * Public page for the credit ladder, so the plans we actually sell can be read
 * without signing in. Until now `CREDIT_TIERS` was rendered only by
 * `/dashboard/credits`, which is behind auth.
 *
 * This is the ONE price list. The surfaces that used to keep their own —
 * the agent storefront, the consumer pricing page, the plan modal and the
 * editorial landing page — quoted four different ladders between them and
 * are now redirects or links to here. Reconciling them was the whole point:
 * a hardcoded number does not throw, it just misquotes a stranger.
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
      />
    </>
  );
}
