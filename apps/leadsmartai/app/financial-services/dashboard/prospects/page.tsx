import type { Metadata } from "next";
import { Users } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Prospects · LeadSmart AI",
  robots: { index: false },
};

export default async function ProspectsPage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={Users}
      title={t("pages.financialServices.navProspects", { ns: "dashboard" })}
      description={t("pages.financialServices.descProspects", { ns: "dashboard" })}
      availability="Pilot week 1"
      bulletPoints={[
        "Unified view of inbound leads from web funnels, referrals, social",
        "AI-scored intent (Hot / Warm / Nurture) with the why",
        "Speed-to-lead clock per prospect (target: < 5 min)",
        "One-click escalate to a Sit-Down booking",
      ]}
    />
  );
}
