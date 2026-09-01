import type { Metadata } from "next";
import { RefreshCcw } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Annual Reviews · LeadSmart AI",
  robots: { index: false },
};

export default async function AnnualReviewsPage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={RefreshCcw}
      title={t("pages.financialServices.navAnnualReviews", { ns: "dashboard" })}
      description={t("pages.financialServices.descAnnualReviews", { ns: "dashboard" })}
      availability="Pilot week 4"
      bulletPoints={[
        "Auto-outreach 30 days before each policy anniversary",
        "AI-generated annual review brief (changes since last year, suggested updates)",
        "Beneficiary verification + rider opportunity flags",
        "Outcome capture (reviewed, updated, additional coverage written)",
      ]}
    />
  );
}
