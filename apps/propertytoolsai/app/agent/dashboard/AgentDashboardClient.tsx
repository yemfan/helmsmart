"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionCard } from "@/components/dashboard/SectionCard";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { LineTrendCard } from "@/components/dashboard/LineTrendCard";
import { BarBreakdownCard } from "@/components/dashboard/BarBreakdownCard";
import type { AgentDashboardResponse } from "@/lib/dashboard/agent";
import { getPresetDateRange, type DateRange } from "@/lib/dashboard/dateRange";
import { useDashboardData } from "@/lib/dashboard/useDashboardData";

/**
 * Shape of /api/dashboard/agent/lead-activity. The endpoint returns
 * recent PropertyToolsAI tool_events for the agent's claimed contacts
 * plus a 24h tool-use count per requested hot-lead id.
 */
type ActivityEvent = {
  leadId: string;
  leadName: string;
  leadEmail: string | null;
  toolName: string;
  toolLabel: string;
  eventName: string;
  propertyAddress: string | null;
  occurredAt: string;
};

type IntentCount = { count: number; lastAt: string | null };

// LeadSmart AI was renamed to CloseBoss (leadsmart-ai.com is retired / 404).
// Append the path to whichever base wins so a configured host still lands on
// the dashboard rather than the marketing home page.
const CLOSEBOSS_DASHBOARD_URL = `${(
  process.env.NEXT_PUBLIC_CLOSEBOSS_URL?.trim() || "https://www.closebossai.com"
).replace(/\/$/, "")}/dashboard`;

export default function AgentDashboardClient() {
  const [range, setRange] = useState<DateRange>(getPresetDateRange("30d"));

  const { data, loading, error } = useDashboardData<
    { success: true } & AgentDashboardResponse
  >("/api/dashboard/agent/overview", {
    start: range.start,
    end: range.end,
  });

  // Pull recent lead activity in parallel with the overview. The
  // intent counts only fire once we know the hot-lead ids from the
  // overview response, hence the second-stage fetch below.
  const [activity, setActivity] = useState<{
    events: ActivityEvent[];
    intentCounts: Record<string, IntentCount>;
  } | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);

  // Comma-joined hot-lead ids → the API uses these to compute 24h
  // tool-use counts for the intent-signal badge. Memoized so we don't
  // re-fetch every render when the same ids stay stable across
  // overview re-fetches.
  const hotLeadIdsParam = useMemo(() => {
    if (!data?.hotLeads || data.hotLeads.length === 0) return "";
    return data.hotLeads
      .map((l) => l.id)
      .filter(Boolean)
      .join(",");
  }, [data?.hotLeads]);

  useEffect(() => {
    let cancelled = false;
    setActivityLoading(true);
    setActivityError(null);

    const params = new URLSearchParams({ limit: "20" });
    if (hotLeadIdsParam) params.set("hotLeadIds", hotLeadIdsParam);

    void (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/agent/lead-activity?${params.toString()}`,
          { credentials: "include", cache: "no-store" },
        );
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          events?: ActivityEvent[];
          intentCounts?: Record<string, IntentCount>;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          setActivityError(body.error ?? "Couldn't load lead activity.");
          return;
        }
        setActivity({
          events: body.events ?? [],
          intentCounts: body.intentCounts ?? {},
        });
      } catch (e) {
        if (cancelled) return;
        setActivityError(e instanceof Error ? e.message : "Network error.");
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hotLeadIdsParam]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading agent dashboard...</div>;
  }

  if (error || !data) {
    return <div className="p-6 text-sm text-red-600">{error || "Failed to load dashboard"}</div>;
  }

  return (
    <DashboardShell
      title="Agent Dashboard"
      subtitle="Focus on the highest-intent leads and close faster."
      actions={
        // Bridge button: most agent work happens in CloseBoss; this
        // PropertyToolsAI dashboard is the surface where consumer-tool
        // activity from claimed leads bubbles up. One-click hop back
        // to the primary CRM.
        <a
          href={CLOSEBOSS_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          Open CloseBoss →
        </a>
      }
      kpis={
        <>
          <KpiCard label="New Leads" value={String(data.kpis.newLeads)} />
          <KpiCard label="Hot Leads" value={String(data.kpis.hotLeads)} />
          <KpiCard label="Follow-Ups Due" value={String(data.kpis.followUpsDue)} />
          <KpiCard label="Active Deals" value={String(data.kpis.activeDeals)} />
          <KpiCard label="Closed This Month" value={String(data.kpis.closedThisMonth)} />
        </>
      }
    >
      <SectionCard title="Date Range">
        <DateRangeFilter value={range} onChange={setRange} />
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <LineTrendCard title="Lead Trend" data={data.trends.leadsByDay} />
        <BarBreakdownCard title="Pipeline Breakdown" data={data.trends.pipelineBreakdown} />
      </div>

      {/* Recent activity from claimed leads — primary feed. Powered by
          /api/dashboard/agent/lead-activity → join from contacts to
          tool_events via auth.users email match. */}
      <SectionCard title="Recent activity from your leads">
        {activityLoading ? (
          <div className="text-sm text-gray-500">Loading activity…</div>
        ) : activityError ? (
          <div className="text-sm text-amber-700">
            {activityError} (Activity feed unavailable; the rest of the dashboard still works.)
          </div>
        ) : !activity || activity.events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-sm text-gray-500">
            <p className="font-medium text-gray-700">No activity yet from your claimed leads.</p>
            <p className="mt-1">
              When a lead you&apos;ve claimed via the{" "}
              <Link href="/dashboard/lead-queue" className="text-blue-600 hover:underline">
                Lead Queue
              </Link>{" "}
              uses a PropertyToolsAI tool, it&apos;ll appear here in real time.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
            {activity.events.map((ev, idx) => (
              <li
                key={`${ev.leadId}-${ev.occurredAt}-${idx}`}
                className="flex items-start gap-3 px-4 py-3"
              >
                <ToolIcon toolName={ev.toolName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <Link
                      href={`/dashboard/leads/${ev.leadId}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {ev.leadName}
                    </Link>{" "}
                    <span className="text-gray-600">used </span>
                    <span className="font-medium text-gray-700">{ev.toolLabel}</span>
                    {ev.propertyAddress ? (
                      <span className="text-gray-500"> · {ev.propertyAddress}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">{relativeTime(ev.occurredAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <SectionCard title="Hot Leads / Lead Inbox">
          <div className="space-y-3">
            {data.hotLeads.length === 0 ? (
              <div className="text-sm text-gray-500">No hot leads yet.</div>
            ) : (
              data.hotLeads.map((lead) => {
                // Intent badge: pull the 24h tool-use count for this
                // lead from the activity API. Hidden when count is 0
                // or when the API didn't return a row for this lead
                // (e.g. couldn't email-match against auth.users).
                const intent = activity?.intentCounts?.[lead.id];
                return (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between rounded-xl border p-4"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{lead.name}</div>
                      <div className="text-sm text-gray-500">
                        {lead.city} • Score {lead.score}
                        {lead.attentionPriority != null ? (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            Attention: {lead.attentionPriority}
                          </span>
                        ) : null}
                        {intent && intent.count > 0 ? (
                          <span
                            className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200"
                            title={
                              intent.lastAt
                                ? `Last tool use ${relativeTime(intent.lastAt)}`
                                : undefined
                            }
                          >
                            🔥 {intent.count} tool {intent.count === 1 ? "use" : "uses"} · 24h
                          </span>
                        ) : null}
                      </div>
                      {lead.attentionReasons && lead.attentionReasons.length > 0 ? (
                        <div className="mt-1 text-xs text-gray-500">{lead.attentionReasons[0]}</div>
                      ) : null}
                    </div>
                    <div className="text-sm font-medium text-gray-700">{lead.status}</div>
                  </div>
                );
              })
            )}
          </div>
        </SectionCard>

        <SectionCard title="Alerts">
          <div className="space-y-3">
            {data.alerts.length === 0 ? (
              <div className="text-sm text-gray-500">No alerts right now.</div>
            ) : (
              data.alerts.map((alert, idx) => (
                <div key={idx} className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                  {alert}
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>
    </DashboardShell>
  );
}

/**
 * Tiny tool-icon mapping for the activity feed. Just emoji for now;
 * upgrade to lucide icons + per-tool color coding if/when this gets
 * heavy enough use to warrant it.
 */
function ToolIcon({ toolName }: { toolName: string }) {
  const emoji = (() => {
    switch (toolName) {
      case "mortgage_calculator":
      case "mortgage":
        return "🏦";
      case "affordability":
      case "affordability_calculator":
        return "💰";
      case "rent_vs_buy":
        return "⚖️";
      case "cap_rate":
      case "cap_rate_calculator":
        return "📈";
      case "cash_flow":
      case "cash_flow_calculator":
        return "💵";
      case "refinance":
      case "refinance_calculator":
        return "🔁";
      case "home_value":
        return "🏠";
      case "cma":
        return "📊";
      case "ai_property_comparison":
      case "property_comparison":
        return "🆚";
      case "ai_recommended_properties":
        return "✨";
      default:
        return "🛠️";
    }
  })();
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-lg"
    >
      {emoji}
    </span>
  );
}

/**
 * Human-readable relative time, e.g. "2 minutes ago", "3 hours ago",
 * "yesterday", "Apr 12". Avoids pulling in date-fns for one helper.
 */
function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const ms = Date.now() - t;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${Math.max(1, sec)}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? "hour" : "hours"} ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
