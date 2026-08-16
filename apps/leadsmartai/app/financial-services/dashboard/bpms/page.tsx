import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "BPMs · LeadSmart AI",
  robots: { index: false },
};

export default async function BpmsPage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={ClipboardCheck}
      title={t("pages.financialServices.navBpms", { ns: "dashboard" })}
      description="Business Presentation Meetings — schedule, invite, and follow up with prospective associates."
      availability="Pilot week 2"
      bulletPoints={[
        "Public BPM signup page per event (in-person + Zoom)",
        "Auto-confirm + reminder cadence to reduce no-shows",
        "Post-BPM follow-up routed by attendee engagement signal",
        "Sponsoring producer credit tracked for downline attribution",
      ]}
    />
  );
}
