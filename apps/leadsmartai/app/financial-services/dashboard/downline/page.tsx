import type { Metadata } from "next";
import { Users } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Downline · LeadSmart AI",
  robots: { index: false },
};

export default async function DownlinePage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={Users}
      title={t("pages.financialServices.navDownline", { ns: "dashboard" })}
      description={t("pages.financialServices.descDownline", { ns: "dashboard" })}
      availability="Pilot week 2"
      bulletPoints={[
        "Tree view of your downline (frontline + deep)",
        "Per-associate KPI roll-up (prospects, FNAs, sit-downs, sales)",
        "Licensing & carrier-appointment status at a glance",
        "Drill-into any associate's workspace as a view-only upline",
      ]}
    />
  );
}
