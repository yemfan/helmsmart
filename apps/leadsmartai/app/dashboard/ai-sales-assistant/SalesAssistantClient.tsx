"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { getAssistant } from "@/lib/realtorboss/team";
import { LeadProfileDrawer } from "@/components/realtorboss/LeadProfileDrawer";
import { AssistantHeader, AssistantKpiCard } from "@/components/realtorboss/AssistantPage";
import { AssistantCallSettings } from "@/components/realtorboss/AssistantCallSettings";

/** Starter brief seeded into the Sales Assistant's knowledge box when the
 *  agent hasn't saved one yet — a greeting plus how it should run a call. */
const SALES_ASSISTANT_DEFAULT_KNOWLEDGE = `WHO YOU ARE
You are the outbound Sales Assistant for a busy real estate agent. You call new leads and revive quiet ones on the agent's behalf — following up, answering quick questions, and booking appointments. Be warm, concise, and genuinely helpful; never pushy.

YOUR GREETING
"Hi, this is {{assistant_name}} reaching out on behalf of {{agent_name}}. Do you have a quick minute?"

YOUR GOAL ON EVERY CALL
1. Re-engage the lead and find out where they are in their buying or selling journey.
2. Answer high-level questions about listings, neighborhoods, and financing.
3. Book a call or appointment with the agent whenever there's interest.
4. If it's a bad time, offer to follow up later and confirm the best way to reach them.

WHAT YOU CAN SAY AS FACT
- The agent's service areas and specialties.
- Current listings and recent market activity worth mentioning.
- General next steps (tours, consultations, pre-approval).
Never invent prices, terms, or property details you weren't given — offer to have the agent follow up instead.`;

type SummaryMetrics = {
  totalLeads: number;
  hotLeads: number;
  inactive7Days: number;
  messagesSent: number;
};

type Lead = {
  id: string;
  name: string | null;
  rating: string | null;
  source: string | null;
  engagement_score: number | null;
  last_activity_at: string | null;
  ai_intent: string | null;
};

const assistant = getAssistant("sales_assistant");

export default function SalesAssistantClient() {
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
  const [hotLeads, setHotLeads] = useState<Lead[]>([]);
  const [quietLeads, setQuietLeads] = useState<Lead[]>([]);
  const [profileLeadId, setProfileLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    const [summaryRes, hotRes, quietRes] = await Promise.all([
      fetch("/api/dashboard/summary").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/leads?filter=hot&pageSize=8").then((r) => r.json()).catch(() => ({})),
      fetch("/api/dashboard/leads?filter=inactive&pageSize=8").then((r) => r.json()).catch(() => ({})),
    ]);
    const m = summaryRes?.metrics;
    if (m) {
      setMetrics({
        totalLeads: m.totalLeads ?? 0,
        hotLeads: m.hotLeads ?? 0,
        inactive7Days: m.inactive7Days ?? 0,
        messagesSent: m.messagesSent ?? 0,
      });
    }
    setHotLeads((hotRes?.leads ?? []) as Lead[]);
    setQuietLeads((quietRes?.leads ?? []) as Lead[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <AssistantHeader
        assistant={assistant}
        actions={[
          // Lead Queue hidden for now (route stays live at /dashboard/lead-queue).
          { label: "Conversations", href: "/dashboard/inbox" },
          { label: "Voice settings", onClick: () => setVoiceSettingsOpen(true) },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AssistantKpiCard label="Hot leads identified" value={loading ? undefined : metrics?.hotLeads} tone="hot" />
        <AssistantKpiCard label="Quiet leads to revive" value={loading ? undefined : metrics?.inactive7Days} hint="7+ days inactive" tone={metrics && metrics.inactive7Days > 0 ? "warn" : undefined} />
        <AssistantKpiCard label="Total leads" value={loading ? undefined : metrics?.totalLeads} />
        <AssistantKpiCard label="Messages sent" value={loading ? undefined : metrics?.messagesSent} hint="all time" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LeadList
          title="Hot leads — call these first"
          leads={hotLeads}
          loading={loading}
          empty="No hot leads right now."
          viewAllHref="/dashboard/leads?filter=hot"
          onOpenLead={setProfileLeadId}
        />
        <LeadList
          title="Reactivation queue — quiet for 7+ days"
          leads={quietLeads}
          loading={loading}
          empty="No quiet leads — everyone has recent activity."
          viewAllHref="/dashboard/leads?filter=inactive"
          onOpenLead={setProfileLeadId}
        />
      </div>

      <LeadProfileDrawer leadId={profileLeadId} onClose={() => setProfileLeadId(null)} />
      {voiceSettingsOpen && (
        <SalesVoiceSettingsModal onClose={() => setVoiceSettingsOpen(false)} />
      )}
    </div>
  );
}

function SalesVoiceSettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sales Assistant voice settings"
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">Sales Assistant voice settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-gray-900">
            Your Sales Assistant&apos;s voice &amp; knowledge
          </h3>
          <p className="mb-4 text-xs text-gray-500">
            Used on its outbound lead calls — follow-ups and reactivations. Separate from your
            Receptionist&apos;s knowledge base, so each assistant speaks from its own brief.
          </p>
          <AssistantCallSettings
            type="sales_assistant"
            knowledgePlaceholder="Current listings to mention, neighborhoods you specialize in, financing partners, what makes you different…"
            defaultKnowledge={SALES_ASSISTANT_DEFAULT_KNOWLEDGE}
          />
        </section>
      </div>
    </div>
  );
}

function LeadList({
  title,
  leads,
  loading,
  empty,
  viewAllHref,
  onOpenLead,
}: {
  title: string;
  leads: Lead[];
  loading: boolean;
  empty: string;
  viewAllHref: string;
  onOpenLead: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <Link href={viewAllHref} className="text-xs font-medium text-blue-600 hover:text-blue-800">View all</Link>
      </div>
      {leads.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">{loading ? "Loading…" : empty}</p>
      ) : (
        <div className="space-y-2">
          {leads.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onOpenLead(l.id)}
              className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">{l.name ?? "Unnamed lead"}</p>
                <p className="truncate text-xs text-gray-500">
                  {[l.ai_intent, l.source].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              {typeof l.engagement_score === "number" && (
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{l.engagement_score}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
