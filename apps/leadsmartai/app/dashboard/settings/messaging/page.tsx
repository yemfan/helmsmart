import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerT } from "@/lib/i18n/server";
import { SettingsCard, SettingsGroupPage } from "@/components/settings/SettingsGroupPage";
import ReviewPolicyPanel from "@/components/dashboard/ReviewPolicyPanel";
import TemplatesSummaryCard from "@/components/dashboard/TemplatesSummaryCard";
import TimingPanel from "@/components/dashboard/TimingPanel";
import SphereDripSettingsPanel from "@/components/dashboard/SphereDripSettingsPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("dashboard");
  return {
    title: `${t("settings.groups.messaging.label", { ns: "dashboard" })} · ${t("pages.dashboardTitles.settings", { ns: "dashboard" })}`,
    robots: { index: false },
  };
}

/** Settings › Messaging — what CloseBoss sends, when, and whether it asks first. */
export default async function MessagingSettingsPage() {
  const t = await getServerT("dashboard");
  const tr = (key: string) => t(key, { ns: "dashboard" });
  const ctx = await getCurrentAgentContext();

  return (
    <SettingsGroupPage
      title={tr("settings.groups.messaging.label")}
      description={tr("settings.groups.messaging.description")}
      back={tr("settings.index.back")}
    >
      <SettingsCard title={tr("settings.reviewPolicy")} description={tr("settings.reviewPolicyHelp")}>
        <ReviewPolicyPanel />
      </SettingsCard>

      <TemplatesSummaryCard agentId={ctx.agentId} />

      <SettingsCard title={tr("settings.timing")} description={tr("settings.timingHelp")}>
        <TimingPanel />
      </SettingsCard>

      <SphereDripSettingsPanel />
    </SettingsGroupPage>
  );
}
