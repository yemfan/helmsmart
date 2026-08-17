import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Inbox · LeadSmart AI",
  robots: { index: false },
};

export default async function InboxPage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={Inbox}
      title={t("pages.financialServices.navInbox", { ns: "dashboard" })}
      description="Unified SMS + email inbox. AI handles routine replies; you handle the ones that matter."
      availability="Pilot week 1"
      bulletPoints={[
        "SMS + email threaded per prospect / client",
        "AI auto-reply for FAQ, hours, location, booking",
        "Hand-off to producer when intent or sensitivity is high",
        "Supervised-review queue for compliance-flagged drafts",
      ]}
    />
  );
}
