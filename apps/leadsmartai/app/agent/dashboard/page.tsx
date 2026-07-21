import { requireAgentAccess } from "@/lib/auth/requireAgentAccess";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionCard } from "@/components/dashboard/SectionCard";

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
  await requireAgentAccess();

  return (
    <DashboardShell
      title="Agent Dashboard"
      subtitle="Focus on the highest-intent leads and close faster."
      kpis={
        <>
          <KpiCard label="New Leads" value="12" subtext="+3 from yesterday" />
          <KpiCard label="Hot Leads" value="5" subtext="Need fast follow-up" />
          <KpiCard label="Follow-Ups Due" value="8" subtext="Today" />
          <KpiCard label="Active Deals" value="6" subtext="2 offers pending" />
          <KpiCard label="Closed This Month" value="4" subtext="$78K est. GCI" />
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <SectionCard title="Hot Leads / Lead Inbox">
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

        <SectionCard title="AI Actions">
          <div className="grid gap-3">
            <button className="rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white">
              Send AI Follow-Up
            </button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">
              Generate Property Comparison
            </button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">
              Draft Reply
            </button>
            <button className="rounded-xl border px-4 py-3 text-sm font-medium text-gray-900">
              Generate CMA Summary
            </button>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard title="Pipeline Snapshot">
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

        <SectionCard title="Alerts">
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
        <SectionCard title="Tasks / Follow-Up Due">
          <ul className="space-y-3 text-sm text-gray-700">
            <li>Call Sarah Chen about Arcadia listing</li>
            <li>Send comps to David Lin</li>
            <li>Follow up with seller lead from Pasadena</li>
          </ul>
        </SectionCard>

        <SectionCard title="Recent Activity">
          <ul className="space-y-3 text-sm text-gray-700">
            <li>Buyer opened property comparison report</li>
            <li>Seller requested updated valuation</li>
            <li>Lead score increased for San Gabriel inquiry</li>
          </ul>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}

