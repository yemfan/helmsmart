import type { Metadata } from "next";
import { Plug } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Integrations · LeadSmart AI",
  robots: { index: false },
};

export default async function IntegrationsPage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={Plug}
      title={t("pages.financialServices.navIntegrations", { ns: "dashboard" })}
      description={t("pages.financialServices.descIntegrations", { ns: "dashboard" })}
      availability="Pilot week 3"
      bulletPoints={[
        "Carrier illustration tools (WinFlex, iPipeline) — pending API access",
        "E-application (DocuSign / iGo / FireLight)",
        "Google Calendar + Outlook for sit-down booking",
        "Twilio voice + SMS (already configured for this workspace)",
      ]}
    />
  );
}
