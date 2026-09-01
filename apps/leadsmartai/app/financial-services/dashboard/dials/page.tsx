import type { Metadata } from "next";
import { Phone } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Dials · LeadSmart AI",
  robots: { index: false },
};

export default async function DialsPage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={Phone}
      title={t("pages.financialServices.navDials", { ns: "dashboard" })}
      description={t("pages.financialServices.descDials", { ns: "dashboard" })}
      availability="Pilot week 3"
      bulletPoints={[
        "Daily dial list sorted by intent score + last-touch recency",
        "Pre-call AI brief (prospect facts, last interaction, recommended angle)",
        "Click-to-dial via your phone or Twilio voice",
        "Post-call disposition + auto-scheduled follow-up",
      ]}
    />
  );
}
