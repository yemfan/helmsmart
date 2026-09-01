import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerT } from "@/lib/i18n/server";
import { agentHasSocialCustomization } from "@/lib/social/customization";
import AgentAiSettingsPanel from "@/components/dashboard/AgentAiSettingsPanel";
import AgentVoiceSettingsPanel from "@/components/dashboard/AgentVoiceSettingsPanel";
import VoiceReceptionistSettingsPanel from "@/components/dashboard/VoiceReceptionistSettingsPanel";
import MissedCallSettingsPanel from "@/components/dashboard/MissedCallSettingsPanel";
import ChannelsCard from "@/components/dashboard/ChannelsCard";
import GoogleCalendarConnectPanel from "@/components/dashboard/GoogleCalendarConnectPanel";
import InboundEmailSetupButton from "@/components/dashboard/InboundEmailSetupButton";
import ComplianceCard from "@/components/dashboard/ComplianceCard";
import { CommissionDefaultsPanel } from "@/components/dashboard/CommissionDefaultsPanel";
import { TransactionNotificationsPanel } from "@/components/dashboard/TransactionNotificationsPanel";
import HomeValueSmartLinkCopyShare from "@/components/dashboard/HomeValueSmartLinkCopyShare";
import LanguagePanel from "@/components/dashboard/LanguagePanel";
import LeadRoutingSettingsPanel from "@/components/dashboard/LeadRoutingSettingsPanel";
import ReviewPolicyPanel from "@/components/dashboard/ReviewPolicyPanel";
import SettingsTabsClient from "@/components/dashboard/SettingsTabsClient";
import TikTokPostOptionsPanel from "@/components/dashboard/TikTokPostOptionsPanel";
import SocialAutopilotController from "@/components/dashboard/SocialAutopilotController";
import WeeklyScheduleController from "@/components/dashboard/WeeklyScheduleController";
import SphereDripSettingsPanel from "@/components/dashboard/SphereDripSettingsPanel";
import TemplatesSummaryCard from "@/components/dashboard/TemplatesSummaryCard";
import TimingPanel from "@/components/dashboard/TimingPanel";
import MlsCsvImportClient from "./MlsCsvImportClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("dashboard");
  const title = t("pages.dashboardTitles.settings", { ns: "dashboard" });
  return {
  title,
  description: "Configure your account, AI preferences, and integrations.",
  keywords: ["settings", "account", "preferences"],
  robots: { index: false },
};
}

export default async function SettingsPage() {
  const t = await getServerT("dashboard");
  const serverT = await getServerT("dashboard");
  const tr = (key: string) => serverT(key, { ns: "dashboard" });
  const ctx = await getCurrentAgentContext();
  const widgetAgentKey = ctx.agentId || ctx.userId;
  const canCustomizeBrand = await agentHasSocialCustomization(ctx.agentId).catch(() => false);

  return (
    <div className="mx-auto max-w-3xl">
      <SettingsTabsClient
        voice={
          <div className="space-y-4">
            <LanguagePanel />
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            <div className="p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">{tr("settings.aiStyle")}</h2>
              <AgentAiSettingsPanel canCustomizeBrand={canCustomizeBrand} />
            </div>
            <div className="p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">{tr("settings.phoneVoice")}</h2>
              <AgentVoiceSettingsPanel />
            </div>
            <div className="p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">{tr("settings.voiceReceptionist")}</h2>
              <p className="mb-3 text-xs text-gray-500">
                {tr("settings.voiceReceptionistHelp")}
              </p>
              <VoiceReceptionistSettingsPanel />
            </div>
            <div className="p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">{tr("settings.missedCall")}</h2>
              <p className="mb-3 text-xs text-gray-500">
                {tr("settings.missedCallHelp")}
              </p>
              <MissedCallSettingsPanel />
            </div>
            </div>
          </div>
        }
        messages={
          <>
            <Card
              title={tr("settings.reviewPolicy")}
              description={tr("settings.reviewPolicyHelp")}
            >
              <ReviewPolicyPanel />
            </Card>

            <TemplatesSummaryCard agentId={ctx.agentId} />

            <Card
              title={tr("settings.timing")}
              description={tr("settings.timingHelp")}
            >
              <TimingPanel />
            </Card>

            <SphereDripSettingsPanel />
          </>
        }
        tools={
          <>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900">{tr("settings.smartLink")}</h2>
              <p className="mt-0.5 text-xs text-gray-500 mb-3">
                {tr("settings.smartLinkHelp")}
              </p>
              <HomeValueSmartLinkCopyShare
                showUrl
                relativePath={`/home-value-widget?agentId=${encodeURIComponent(widgetAgentKey)}`}
              />
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">{tr("settings.mlsImport")}</h2>
              <MlsCsvImportClient />
            </div>
          </>
        }
        channels={
          <>
            <ChannelsCard agentId={ctx.agentId} />
            {/* Calendar + email in one card: two-way appointment sync and the
                Gmail forwarding address are the same job to an agent — "make
                my calendar and inbox talk to CloseBoss" — so they configure
                together here as well as on their own pages. */}
            <Card
              title={tr("tips.calendarEmail")}
              description={tr("tips.calendarEmailHelp")}
            >
              <div className="space-y-3">
                <GoogleCalendarConnectPanel />
                <InboundEmailSetupButton variant="row" />
              </div>
            </Card>
            {/* Connections live on ONE page. This used to be a second, older
                connect panel that read a narrower projection (so it could show
                "no Pages" while the connect page showed the Page), pointed at a
                legacy OAuth route that failed with state_mismatch, and never
                captured the linked Instagram account. Replaced with a pointer
                to the real thing. */}
            <Card
              title={tr("tips.connectedSocial")}
              description={t("pages.settingsPage.connectedSocialDesc")}
            >
              <a
                href="/dashboard/leads/generate/connect"
                className="inline-flex rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005ba6]"
              >{t("pages.settingsPage.manageConnected", { ns: "dashboard" })}</a>
            </Card>
            <Card
              title={tr("tips.socialAutoposting")}
              description={t("pages.settingsPage.socialAutopostingDesc")}
            >
              <SocialAutopilotController />
            </Card>
            <Card
              title={tr("tips.tiktokPosting")}
              description={tr("tips.tiktokPostingHelp")}
            >
              <TikTokPostOptionsPanel />
            </Card>
            <Card
              title={tr("tips.weeklySchedule")}
            >
              <WeeklyScheduleController />
            </Card>
            <LeadRoutingSettingsPanel />
            <Card
              title={tr("tips.tcNotifications")}
              description={t("pages.settingsPage.tcNotificationsDesc")}
            >
              <TransactionNotificationsPanel />
            </Card>
            <Card
              title={tr("tips.commissionDefaults")}
              description={t("pages.settingsPage.commissionDefaultsDesc")}
            >
              <CommissionDefaultsPanel />
            </Card>
            <ComplianceCard />
          </>
        }
      />
    </div>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-gray-500 mb-3">{description}</p>}
      {children}
    </div>
  );
}
