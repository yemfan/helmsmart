import type { Metadata } from "next";

import AdCampaignWizardClient from "./AdCampaignWizardClient";

export const metadata: Metadata = {
  title: "New Lead Ad | RealtyBoss",
  description:
    "Launch a Meta Lead Ad campaign — pick the listing, audience, budget, and creative. The leads land directly in your CRM.",
  robots: { index: false },
};

export default function NewAdCampaignPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <AdCampaignWizardClient />
    </div>
  );
}
