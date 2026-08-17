import type { Metadata } from "next";
import { BarChart } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Production · LeadSmart AI",
  robots: { index: false },
};

export default async function ProductionPage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={BarChart}
      title={t("pages.financialServices.navProduction", { ns: "dashboard" })}
      description="Team production — submitted, issued, placed — rolled up by hierarchy tier with month-over-month trend."
      availability="Pilot week 3"
      bulletPoints={[
        "Total team annualized premium (submitted vs. issued vs. placed)",
        "Per-associate production with rolling 30/60/90 windows",
        "Top-producer leaderboard within your downline",
        "Goals + pace tracking against monthly targets",
      ]}
    />
  );
}
