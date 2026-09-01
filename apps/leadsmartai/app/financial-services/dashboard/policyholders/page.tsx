import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Policyholders · LeadSmart AI",
  robots: { index: false },
};

export default async function PolicyholdersPage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={Briefcase}
      title={t("pages.financialServices.navPolicyholders", { ns: "dashboard" })}
      description={t("pages.financialServices.descPolicyholders", { ns: "dashboard" })}
      availability="Pilot week 4"
      bulletPoints={[
        "Active policies grouped by client (carrier, product, face amount, premium)",
        "Policy-anniversary timeline + auto-nudge for annual reviews",
        "Beneficiary tracking + change request workflow",
        "Carrier-statement reconciliation (CSV import for now, API in phase 2)",
      ]}
    />
  );
}
