import type { Metadata } from "next";
import { UserCircle2 } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Profile · LeadSmart AI",
  robots: { index: false },
};

export default async function ProfilePage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={UserCircle2}
      title={t("pages.financialServices.navProfile", { ns: "dashboard" })}
      description="Your producer profile, agent branding, agency hierarchy, carrier appointments, and notification preferences."
      availability="Pilot week 2"
      bulletPoints={[
        "Public profile + agent branding (logo, photo, calendar link)",
        "Hierarchy info (your sponsor, your downline tier)",
        "Carrier appointments tracked per state",
        "Notification preferences (SMS, email, push)",
      ]}
    />
  );
}
