import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerT } from "@/lib/i18n/server";
import { agentHasSocialCustomization } from "@/lib/social/customization";
import { SettingsCard, SettingsGroupPage } from "@/components/settings/SettingsGroupPage";
import AgentAiSettingsPanel from "@/components/dashboard/AgentAiSettingsPanel";
import MaxMemoryPanel from "@/components/settings/MaxMemoryPanel";
import AgentVoiceSettingsPanel from "@/components/dashboard/AgentVoiceSettingsPanel";
import VoiceReceptionistSettingsPanel from "@/components/dashboard/VoiceReceptionistSettingsPanel";
import MissedCallSettingsPanel from "@/components/dashboard/MissedCallSettingsPanel";
import LeadRoutingSettingsPanel from "@/components/dashboard/LeadRoutingSettingsPanel";
import { TransactionNotificationsPanel } from "@/components/dashboard/TransactionNotificationsPanel";
import { CommissionDefaultsPanel } from "@/components/dashboard/CommissionDefaultsPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("dashboard");
  return {
    title: `${t("settings.groups.aiTeam.label", { ns: "dashboard" })} · ${t("pages.dashboardTitles.settings", { ns: "dashboard" })}`,
    robots: { index: false },
  };
}

/** Settings › AI team — how the assistants sound, answer, route and handle deals. */
export default async function AiTeamSettingsPage() {
  const t = await getServerT("dashboard");
  const tr = (key: string) => t(key, { ns: "dashboard" });
  const ctx = await getCurrentAgentContext();
  const canCustomizeBrand = await agentHasSocialCustomization(ctx.agentId).catch(() => false);

  return (
    <SettingsGroupPage
      title={tr("settings.groups.aiTeam.label")}
      description={tr("settings.groups.aiTeam.description")}
      back={tr("settings.index.back")}
    >
      <SettingsCard title={tr("settings.aiStyle")}>
        <AgentAiSettingsPanel canCustomizeBrand={canCustomizeBrand} />
      </SettingsCard>

      <div id="max-memory">
        <SettingsCard title={tr("settings.maxMemory.title")} description={tr("settings.maxMemory.description")}>
          <MaxMemoryPanel />
        </SettingsCard>
      </div>

      <SettingsCard title={tr("settings.phoneVoice")}>
        <AgentVoiceSettingsPanel />
      </SettingsCard>

      <SettingsCard title={tr("settings.voiceReceptionist")} description={tr("settings.voiceReceptionistHelp")}>
        <VoiceReceptionistSettingsPanel />
      </SettingsCard>

      <SettingsCard title={tr("settings.missedCall")} description={tr("settings.missedCallHelp")}>
        <MissedCallSettingsPanel />
      </SettingsCard>

      <LeadRoutingSettingsPanel />

      <SettingsCard title={tr("tips.tcNotifications")} description={tr("pages.settingsPage.tcNotificationsDesc")}>
        <TransactionNotificationsPanel />
      </SettingsCard>

      <SettingsCard title={tr("tips.commissionDefaults")} description={tr("pages.settingsPage.commissionDefaultsDesc")}>
        <CommissionDefaultsPanel />
      </SettingsCard>
    </SettingsGroupPage>
  );
}
