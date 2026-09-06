import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerT } from "@/lib/i18n/server";
import { SettingsCard, SettingsGroupPage } from "@/components/settings/SettingsGroupPage";
import ChannelsCard from "@/components/dashboard/ChannelsCard";
import GoogleCalendarConnectPanel from "@/components/dashboard/GoogleCalendarConnectPanel";
import InboundEmailSetupButton from "@/components/dashboard/InboundEmailSetupButton";
import SocialAutopilotController from "@/components/dashboard/SocialAutopilotController";
import TikTokPostOptionsPanel from "@/components/dashboard/TikTokPostOptionsPanel";
import WeeklyScheduleController from "@/components/dashboard/WeeklyScheduleController";
import ComplianceCard from "@/components/dashboard/ComplianceCard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("dashboard");
  return {
    title: `${t("settings.groups.channels.label", { ns: "dashboard" })} · ${t("pages.dashboardTitles.settings", { ns: "dashboard" })}`,
    robots: { index: false },
  };
}

/** Settings › Channels — phone, email, calendar and social accounts. */
export default async function ChannelsSettingsPage() {
  const t = await getServerT("dashboard");
  const tr = (key: string) => t(key, { ns: "dashboard" });
  const ctx = await getCurrentAgentContext();

  return (
    <SettingsGroupPage
      title={tr("settings.groups.channels.label")}
      description={tr("settings.groups.channels.description")}
      back={tr("settings.index.back")}
    >
      <ChannelsCard agentId={ctx.agentId} />

      {/* Calendar + email in one card: two-way appointment sync and the Gmail
          forwarding address are the same job to an agent — "make my calendar
          and inbox talk to CloseBoss". */}
      <SettingsCard title={tr("tips.calendarEmail")} description={tr("tips.calendarEmailHelp")}>
        <div className="space-y-3">
          <GoogleCalendarConnectPanel />
          <InboundEmailSetupButton variant="row" />
        </div>
      </SettingsCard>

      {/* Social connections live on ONE page; this points at it. */}
      <SettingsCard title={tr("tips.connectedSocial")} description={tr("pages.settingsPage.connectedSocialDesc")}>
        <a
          href="/dashboard/leads/generate/connect"
          className="inline-flex rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005ca8]"
        >
          {tr("pages.settingsPage.manageConnected")}
        </a>
      </SettingsCard>

      <SettingsCard title={tr("tips.socialAutoposting")} description={tr("pages.settingsPage.socialAutopostingDesc")}>
        <SocialAutopilotController />
      </SettingsCard>

      <SettingsCard title={tr("tips.tiktokPosting")} description={tr("tips.tiktokPostingHelp")}>
        <TikTokPostOptionsPanel />
      </SettingsCard>

      <SettingsCard title={tr("tips.weeklySchedule")}>
        <WeeklyScheduleController />
      </SettingsCard>

      <ComplianceCard />
    </SettingsGroupPage>
  );
}
