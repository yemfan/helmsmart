import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Compliance · LeadSmart AI",
  robots: { index: false },
};

export default async function CompliancePage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={ShieldCheck}
      title={t("pages.financialServices.navCompliance", { ns: "dashboard" })}
      description={t("pages.financialServices.descCompliance", { ns: "dashboard" })}
      availability="Pilot week 1"
      bulletPoints={[
        "State license status + CE credit tracking (NIPR sync in phase 2)",
        "AML & anti-fraud training annual completion log",
        "Supervised-review queue for AI-drafted comms (principal / OSJ approval)",
        "Communications archive — TCPA opt-in proof + 17a-4-aligned retention",
      ]}
    />
  );
}
