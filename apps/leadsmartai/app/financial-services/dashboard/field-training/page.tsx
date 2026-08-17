import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Field Training · LeadSmart AI",
  robots: { index: false },
};

export default async function FieldTrainingPage() {
  const t = await getServerT();
  return (
    <ComingSoon
      icon={GraduationCap}
      title={t("pages.financialServices.navFieldTraining", { ns: "dashboard" })}
      description="New-associate onboarding and licensing path — track each recruit's progress from BPM to first sale."
      availability="Pilot week 2"
      bulletPoints={[
        "Module checklist per new associate (pre-licensing, product, AML)",
        "License-exam scheduling + status sync",
        "Field-trainer assignment + ride-along log",
        "First-sale milestone unlock + override-eligibility flag",
      ]}
    />
  );
}
