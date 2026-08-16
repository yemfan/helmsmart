import type { Metadata } from "next";
import { Coins } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Overrides · LeadSmart AI",
  robots: { index: false },
};

export default async function OverridesPage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={Coins}
      title={t("pages.financialServices.navOverrides", { ns: "dashboard" })}
      description="Hierarchical override commissions — earned, advanced, charged back, and projected from your downline's production."
      availability="Phase 2 (post-pilot)"
      bulletPoints={[
        "Carrier-statement CSV ingestion (Transamerica, Nationwide, Foresters)",
        "Override allocation by hierarchy tier + agreement",
        "Advance vs. earned breakdown with chargeback exposure",
        "Projected month-end override based on submitted-not-issued business",
      ]}
    />
  );
}
