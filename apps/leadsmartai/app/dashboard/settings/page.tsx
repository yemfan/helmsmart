import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getServerT } from "@/lib/i18n/server";
import { agentHasSocialCustomization } from "@/lib/social/customization";
import AgentAiSettingsPanel from "@/components/dashboard/AgentAiSettingsPanel";
import AgentVoiceSettingsPanel from "@/components/dashboard/AgentVoiceSettingsPanel";
import VoiceReceptionistSettingsPanel from "@/components/dashboard/VoiceReceptionistSettingsPanel";
import BriefingScheduleCard from "@/components/dashboard/BriefingScheduleCard";
import MissedCallSettingsPanel from "@/components/dashboard/MissedCallSettingsPanel";
import ChannelsCard from "@/components/dashboard/ChannelsCard";
import ComplianceCard from "@/components/dashboard/ComplianceCard";
import { CommissionDefaultsPanel } from "@/components/dashboard/CommissionDefaultsPanel";
import { TransactionNotificationsPanel } from "@/components/dashboard/TransactionNotificationsPanel";
import HomeValueSmartLinkCopyShare from "@/components/dashboard/HomeValueSmartLinkCopyShare";
import LanguagePanel from "@/components/dashboard/LanguagePanel";
import LeadRoutingSettingsPanel from "@/components/dashboard/LeadRoutingSettingsPanel";
import ReviewPolicyPanel from "@/components/dashboard/ReviewPolicyPanel";
import SettingsTabsClient from "@/components/dashboard/SettingsTabsClient";
import SocialAutopilotController from "@/components/dashboard/SocialAutopilotController";
import WeeklyScheduleController from "@/components/dashboard/WeeklyScheduleController";
import SphereDripSettingsPanel from "@/components/dashboard/SphereDripSettingsPanel";
import TemplatesSummaryCard from "@/components/dashboard/TemplatesSummaryCard";
import TimingPanel from "@/components/dashboard/TimingPanel";
import MlsCsvImportClient from "./MlsCsvImportClient";

export const metadata: Metadata = {
  title: "Settings",
  description: "Configure your account, AI preferences, and integrations.",
  keywords: ["settings", "account", "preferences"],
  robots: { index: false },
};

export default async function SettingsPage() {
  const serverT = await getServerT();
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
            <div className="p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">{tr("settings.briefings")}</h2>
              <p className="mb-3 text-xs text-gray-500">
                {tr("settings.briefingsHelp")}
              </p>
              <BriefingScheduleCard />
            </div>
            </div>
          </div>
        }
        messages={
          <>
            <Card
              title="Review Policy"
              description="Control whether messages send automatically when triggers fire, or wait for your approval first. The most important setting in Messages — it affects every template across every channel."
            >
              <ReviewPolicyPanel />
            </Card>

            <TemplatesSummaryCard agentId={ctx.agentId} />

            <Card
              title="Timing &amp; Frequency"
              description="Rules that apply across every template. These override any template-level settings — the most restrictive rule always wins."
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
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={`/home-value-widget?agentId=${ctx.agentId}`}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 text-gray-700"
                />
              </div>
              <div className="mt-2">
                <HomeValueSmartLinkCopyShare
                  relativePath={`/home-value-widget?agentId=${encodeURIComponent(widgetAgentKey)}`}
                />
              </div>
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
            {/* Connections live on ONE page. This used to be a second, older
                connect panel that read a narrower projection (so it could show
                "no Pages" while the connect page showed the Page), pointed at a
                legacy OAuth route that failed with state_mismatch, and never
                captured the linked Instagram account. Replaced with a pointer
                to the real thing. */}
            <Card
              title="Connected social accounts"
              description="Facebook, Instagram, LinkedIn and Threads are connected in one place."
            >
              <a
                href="/dashboard/leads/generate/connect"
                className="inline-flex rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005ba6]"
              >
                Manage connected accounts
              </a>
            </Card>
            <Card
              title="Social auto-posting"
              description="Your AI team writes and publishes posts for your feed. This decides what goes out, where, how often — and who signs off."
            >
              <SocialAutopilotController />
            </Card>
            <Card
              title="Weekly post schedule"
              description="Pick the weekdays you want a post. For each, set a time, channels, and a topic — AI researches the topic and publishes on schedule."
            >
              <WeeklyScheduleController />
            </Card>
            <LeadRoutingSettingsPanel />
            <Card
              title="Transaction Coordinator notifications"
              description="Delivery preferences for deal-level nudges: daily email digest of overdue tasks, plus a closing-window wire-fraud SMS escalation."
            >
              <TransactionNotificationsPanel />
            </Card>
            <Card
              title="Commission defaults"
              description="Applied to new transactions + revenue analytics on /dashboard/performance. Per-deal overrides stay intact."
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
