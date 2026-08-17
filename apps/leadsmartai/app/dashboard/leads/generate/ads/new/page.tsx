import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

import AdCampaignWizardClient from "./AdCampaignWizardClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.adWizard.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default function NewAdCampaignPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <AdCampaignWizardClient />
    </div>
  );
}
