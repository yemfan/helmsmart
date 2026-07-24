"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionCard } from "@/components/dashboard/SectionCard";
import type { PlatformOverviewResponse } from "@/lib/dashboard/admin";
import { getPresetDateRange, type DateRange } from "@/lib/dashboard/dateRange";
import { useDashboardData } from "@/lib/dashboard/useDashboardData";

function FunnelBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const width = `${max > 0 ? (value / max) * 100 : 0}%`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-900">{label}</span>
        <span className="text-gray-500">{value.toLocaleString()}</span>
      </div>
      <div className="h-3 rounded-full bg-gray-100">
        <div className="h-3 rounded-full bg-gray-900 transition-all" style={{ width }} />
      </div>
    </div>
  );
}

type DatePresetButton = { label: string; preset: "7d" | "30d" | "90d" | "mtd" };

const PRESETS: DatePresetButton[] = [
  { label: "7 days", preset: "7d" },
  { label: "30 days", preset: "30d" },
  { label: "90 days", preset: "90d" },
  { label: "Month to date", preset: "mtd" },
];

type PlatformOverviewPayload = { success: true } & PlatformOverviewResponse;

export function PlatformOverviewClient() {
  const [range, setRange] = useState<DateRange>(getPresetDateRange("30d"));

  const { data, loading, error } = useDashboardData<PlatformOverviewPayload>(
    "/api/dashboard/admin/platform-overview",
    { start: range.start, end: range.end }
  );

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6 text-sm text-gray-500">
        Loading platform overview...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-sm text-red-600">
        {error || "Failed to load dashboard"}
      </div>
    );
  }

  const maxFunnel = Math.max(0, ...data.funnel.map((item) => item.value));

  // Period-over-period % change. Null when there's no comparable baseline
  // (previous window was 0) so the card hides the badge rather than showing ∞.
  const deltaPct = (cur: number, prev: number): number | null => {
    if (!Number.isFinite(prev) || prev === 0) return null;
    return ((cur - prev) / prev) * 100;
  };
  const prev = data.kpisPrevious;
  const trends = data.kpiTrends;

  return (
    <DashboardShell
      className="min-h-0 bg-transparent p-0"
      title="Platform Overview"
      subtitle="Business performance across PropertyToolsAI and LeadSmart AI."
      kpiGridClassName="md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      kpis={
        <>
          <KpiCard
            label="Total Visitors"
            value={data.kpis.visitors.toLocaleString()}
            deltaPct={deltaPct(data.kpis.visitors, prev.visitors)}
            spark={trends.visitors}
          />
          <KpiCard
            label="Tool Usage"
            value={data.kpis.toolUsage.toLocaleString()}
            deltaPct={deltaPct(data.kpis.toolUsage, prev.toolUsage)}
            spark={trends.toolUsage}
          />
          <KpiCard
            label="Leads Captured"
            value={data.kpis.leadsCaptured.toLocaleString()}
            deltaPct={deltaPct(data.kpis.leadsCaptured, prev.leadsCaptured)}
            spark={trends.leadsCaptured}
          />
          <KpiCard
            label="Qualified Leads"
            value={data.kpis.qualifiedLeads.toLocaleString()}
            deltaPct={deltaPct(data.kpis.qualifiedLeads, prev.qualifiedLeads)}
            spark={trends.qualifiedLeads}
          />
          <KpiCard
            label="Paying Agents"
            value={String(data.kpis.payingAgents)}
            deltaPct={deltaPct(data.kpis.payingAgents, prev.payingAgents)}
          />
          <KpiCard
            label="Revenue"
            value={`$${data.kpis.revenue.toLocaleString()}`}
            deltaPct={deltaPct(data.kpis.revenue, prev.revenue)}
          />
        </>
      }
    >
      {/* Date range selector */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.preset}
            type="button"
            onClick={() => setRange(getPresetDateRange(p.preset))}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              range.preset === p.preset
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <SectionCard title="PropertyToolsAI Performance">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="text-sm text-gray-500">Traffic</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                  {data.propertyTools.traffic.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="text-sm text-gray-500">Lead Conversion</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                  {data.propertyTools.conversionRate}%
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="text-sm text-gray-500">Premium Upgrades</div>
                <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                  {data.propertyTools.premiumUpgrades}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900">Top Tools</h3>
              <div className="mt-3 space-y-3">
                {data.propertyTools.topTools.map((tool) => (
                  <div key={tool.name} className="flex items-center justify-between rounded-xl border p-4">
                    <div>
                      <div className="font-medium text-gray-900">{tool.name}</div>
                      <div className="text-sm text-gray-500">
                        {tool.users.toLocaleString()} {tool.users === 1 ? "user" : "users"}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-gray-700">{tool.usageShare}% of visitors</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900">Top Landing Pages</h3>
              <div className="mt-3 space-y-3">
                {data.propertyTools.topPages.map((page) => (
                  <div key={page.page} className="flex items-center justify-between rounded-xl border p-4">
                    <div className="font-medium text-gray-900">{page.page}</div>
                    <div className="text-sm text-gray-500">{page.visitors.toLocaleString()} visitors</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="LeadSmart AI Performance">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Active Agents</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                {data.leadSmart.activeAgents}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Lead Assignments</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                {data.leadSmart.leadAssignments}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Follow-Up Rate</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                {data.leadSmart.followUpRate}%
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Close Rate</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                {data.leadSmart.closeRate}%
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 md:col-span-2">
              <div className="text-sm text-gray-500">MRR</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                ${data.leadSmart.mrr.toLocaleString()}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Funnel Overview">
        <div className="grid gap-5">
          {data.funnel.map((item) => (
            <FunnelBar key={item.stage} label={item.stage} value={item.value} max={maxFunnel} />
          ))}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <SectionCard title="Support / Operations">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Open Tickets</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                {data.support.openTickets}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="text-sm text-gray-500">Urgent Tickets</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">
                {data.support.urgentTickets}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-900">Issue Categories</h3>
            <div className="mt-3 space-y-3">
              {data.support.categories.length === 0 ? (
                <p className="text-sm text-gray-500">No support tickets in this period.</p>
              ) : (
                data.support.categories.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-xl border p-4">
                    <div className="font-medium text-gray-900">{item.label}</div>
                    <div className="text-sm text-gray-500">{item.count} issues</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Alerts / Insights">
          <div className="space-y-3">
            {data.alerts.length === 0 ? (
              <div className="text-sm text-gray-500">No alerts right now.</div>
            ) : (
              data.alerts.map((alert, idx) => (
                <div key={idx} className="rounded-xl border bg-gray-50 p-4">
                  <div className="font-medium text-gray-900">{alert.title}</div>
                  <div className="mt-1 text-sm text-gray-500">{alert.detail}</div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}
