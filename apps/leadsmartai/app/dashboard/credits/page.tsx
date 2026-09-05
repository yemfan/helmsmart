import type { Metadata } from "next";
import { Suspense } from "react";
import CreditsClient from "./CreditsClient";
import { getServerT } from "@/lib/i18n/server";
import { CREDIT_TIERS, annualPriceConfigured } from "@/lib/credits/pricing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.credits", { ns: "dashboard" });
  return {
  title,
  description: "Buy credits and manage your usage plan.",
  robots: { index: false },
};
}

export default async function CreditsPage() {
  const t = await getServerT();

  /*
   * Which tiers can actually be BOUGHT annually.
   *
   * `annualPriceConfigured` reads a server-only env var, so the decision is
   * made here and handed down. The client must not assume annual exists just
   * because `annualUsd()` returns a number — that assumption is what let the
   * onboarding funnel advertise "save 17%" for five weeks while checkout could
   * only resolve the monthly price.
   */
  const annualTierIds = CREDIT_TIERS.filter((tier) => annualPriceConfigured(tier.id)).map(
    (tier) => tier.id,
  );

  return (
    <Suspense fallback={<div className="p-4 text-sm text-gray-600">{t("pages.credits.loadingCredits", { ns: "dashboard" })}</div>}>
      <CreditsClient annualTierIds={annualTierIds} />
    </Suspense>
  );
}
