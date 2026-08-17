import { requireAgentAccess } from "@/lib/auth/requireAgentAccess";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { getServerT } from "@/lib/i18n/server";

const hotLeads = [
  { name: "Sarah Chen", city: "Arcadia", score: 88, status: "Hot Lead" },
  { name: "David Lin", city: "Pasadena", score: 76, status: "Qualified" },
  { name: "Mia Wong", city: "San Gabriel", score: 71, status: "Contacted" },
];

const alerts = [
  "Client viewed comparison report twice",
  "Hot seller lead inactive for 24 hours",
  "Buyer opened mortgage estimate this morning",
];

export const metadata = {
  title: "Agent Dashboard | CloseBoss",
  description: "Leads, pipeline, and AI actions for real estate agents.",
};

export default async function AgentDashboardPage() {
  const t = await getServerT();
  await requireAgentAccess();

  return (
    <DashboardShell
      title={t("pages.agentDashboardMock.dashboardAria", { ns: "dashboard" })}
      subtitle="Focus on the highest-intent leads and close faster."
      kpis={
        <>
          <KpiCard label={t("pages.agentDashboardMock.newLeads", { ns: "dashboard" })} value="12" subtext="+3 from yesterday" />
          <KpiCard label={t("pages.agentDashboardMock.hotLeads", { ns: "dashboard" })} value="5" subtext="Need fast follow-up" />
          <KpiCard label={t("pages.agentDashboardMock.followUpsDue", { ns: "dashboard" })} value="8" subtext="Today" />
          <KpiCard label={t("pages.agentDashboardMock.activeDeals", { ns: "dashboard" })} value="6" subtext="2 offers pending" />
          <KpiCard label={t("pages.agentDashboardMock.closedThisMonth", { ns: "dashboard" })} value="4" subtext="$78K est. GCI" />
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <SectionCard title={t("pages.agentDashboardMock.leadInbox", { ns: "dashboard" })}>
          <div className="space-y-3">
            {hotLeads.map((lead) => (
              <div
                key={lead.name}
                className="flex items-center justify-between rounded-xl border p-4"
              >
                <div>
                  <div className="font-medium text-gray-900">{lead.name}</div>
                  <div className="text-sm text-gray-500">
                    {lead.city} · Score {lead.score}
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-700">{lead.status}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={t("pages.agentDashboardMock.aiActions", { ns: "dashboard" })}>
          <div className="grid gap-3">
            <button className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white">{t("pages.agentDashboardMock.sendFollowUp", { ns: "dashboard" })}</button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">{t("pages.agentDashboardMock.generateComparison", { ns: "dashboard" })}</button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">{t("pages.agentDashboardMock.draftReply", { ns: "dashboard" })}</button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">{t("pages.agentDashboardMock.generateCma", { ns: "dashboard" })}</button>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard title={t("pages.agentDashboardMock.pipelineSnapshot", { ns: "dashboard" })}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[
              ["New", 12],
              ["Contacted", 9],
              ["Qualified", 6],
              ["Offer", 3],
              ["Under Contract", 2],
              ["Closed", 4],
            ].map(([label, count]) => (
              <div key={String(label)} className="rounded-xl bg-gray-50 p-4 text-center">
                <div className="text-xs text-gray-500">{label}</div>
                <div className="mt-2 text-xl font-semibold">{count}</div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={t("pages.agentDashboardMock.alerts", { ns: "dashboard" })}>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div key={alert} className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                {alert}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard title={t("pages.agentDashboardMock.tasksDue", { ns: "dashboard" })}>
          <ul className="space-y-3 text-sm text-gray-700">
            <li>{t("pages.agentDashboardMock.task1", { ns: "dashboard" })}</li>
            <li>{t("pages.agentDashboardMock.task2", { ns: "dashboard" })}</li>
            <li>{t("pages.agentDashboardMock.task3", { ns: "dashboard" })}</li>
          </ul>
        </SectionCard>

        <SectionCard title={t("pages.agentDashboardMock.recentActivity", { ns: "dashboard" })}>
          <ul className="space-y-3 text-sm text-gray-700">
            <li>{t("pages.agentDashboardMock.act1", { ns: "dashboard" })}</li>
            <li>{t("pages.agentDashboardMock.act2", { ns: "dashboard" })}</li>
            <li>{t("pages.agentDashboardMock.act3", { ns: "dashboard" })}</li>
          </ul>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}

