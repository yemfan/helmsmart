"use client";

import { useTranslation } from "react-i18next";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Mail, MessageSquare, Phone, PhoneOutgoing, X } from "lucide-react";
import { getAssistant } from "@/lib/closeboss/team";
import { LeadProfileDrawer } from "@/components/closeboss/LeadProfileDrawer";
import { AssistantHeader, AssistantKpiCard } from "@/components/closeboss/AssistantPage";
import { AssistantCallSettings } from "@/components/closeboss/AssistantCallSettings";
import SalesOutreachComposer from "@/components/dashboard/SalesOutreachComposer";
import OutreachScheduledStrip from "@/components/dashboard/OutreachScheduledStrip";
import OutboundCallPanel from "@/components/dashboard/OutboundCallPanel";
import BulkCallPanel from "@/components/dashboard/BulkCallPanel";
import AppointmentRemindersPanel from "@/components/dashboard/AppointmentRemindersPanel";

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
  const { t } = useTranslation("dashboard");
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
  const [hotLeads, setHotLeads] = useState<Lead[]>([]);
  const [quietLeads, setQuietLeads] = useState<Lead[]>([]);
  const [profileLeadId, setProfileLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [outboundOpen, setOutboundOpen] = useState(false);
  const [prefill, setPrefill] = useState<{ contactId: string; channel: "call" | "sms" | "email"; nonce: number } | null>(null);
  const [scheduledRefresh, setScheduledRefresh] = useState(0);

  const quickAction = useCallback((contactId: string, channel: "call" | "sms" | "email") => {
    setPrefill((p) => ({ contactId, channel, nonce: (p?.nonce ?? 0) + 1 }));
  }, []);

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
          { label: t("assistants.sales.conversations"), href: "/dashboard/inbox" },
          { label: t("assistants.common.voiceSettings"), onClick: () => setVoiceSettingsOpen(true) },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AssistantKpiCard label={t("assistants.sales.stats.hotLeads")} value={loading ? undefined : metrics?.hotLeads} tone="hot" />
        <AssistantKpiCard label={t("assistants.sales.stats.quietLeads")} value={loading ? undefined : metrics?.inactive7Days} hint={t("assistants.sales.hints.inactive7")} tone={metrics && metrics.inactive7Days > 0 ? "warn" : undefined} />
        <AssistantKpiCard label={t("assistants.sales.stats.totalLeads")} value={loading ? undefined : metrics?.totalLeads} />
        <AssistantKpiCard label={t("assistants.sales.stats.messagesSent")} value={loading ? undefined : metrics?.messagesSent} hint={t("assistants.sales.hints.allTime")} />
      </div>

      <SalesOutreachComposer
        segmentCounts={{
          hot: metrics?.hotLeads ?? 0,
          quiet: metrics?.inactive7Days ?? 0,
          all: metrics?.totalLeads ?? 0,
        }}
        onComplete={() => {
          void load();
          setScheduledRefresh((n) => n + 1);
        }}
        prefill={prefill}
      />

      <OutreachScheduledStrip refreshSignal={scheduledRefresh} />

      <div className="grid gap-4 lg:grid-cols-2">
        <LeadList
          title={t("assistants.sales.hotHeading")}
          leads={hotLeads}
          loading={loading}
          empty={t("assistants.sales.noHot")}
          viewAllHref="/dashboard/leads?filter=hot"
          onOpenLead={setProfileLeadId}
          onQuickAction={quickAction}
        />
        <LeadList
          title={t("assistants.sales.reactivationQueue")}
          leads={quietLeads}
          loading={loading}
          empty={t("assistants.sales.noQuiet")}
          viewAllHref="/dashboard/leads?filter=inactive"
          onOpenLead={setProfileLeadId}
          onQuickAction={quickAction}
        />
      </div>

      {/* Advanced outbound tools — the composer above covers the common path;
          these handle ad-hoc numbers, hand-picking a batch, and appointment
          reminders. Collapsed by default so the composer stays the hero. */}
      <div>
        <button
          type="button"
          onClick={() => setOutboundOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          aria-expanded={outboundOpen}
        >
          <PhoneOutgoing className="h-3.5 w-3.5" strokeWidth={2} />
          {t("assistants.sales.moreTools")}
          {outboundOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {outboundOpen && (
        <div className="space-y-4">
          <OutboundCallPanel />
          <BulkCallPanel />
          <AppointmentRemindersPanel />
        </div>
      )}

      <LeadProfileDrawer leadId={profileLeadId} onClose={() => setProfileLeadId(null)} />
      {voiceSettingsOpen && (
        <SalesVoiceSettingsModal onClose={() => setVoiceSettingsOpen(false)} />
      )}
    </div>
  );
}

function SalesVoiceSettingsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("dashboard");
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("assistants.sales.voicePanel")}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">{t("assistants.sales.voicePanel")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={t("assistants.common.close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-gray-900">{t("pages.salesAssistant.voiceTitle")}</h3>
          <p className="mb-4 text-xs text-gray-500">{t("pages.salesAssistant.voiceSub")}</p>
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
  onQuickAction,
}: {
  title: string;
  leads: Lead[];
  loading: boolean;
  empty: string;
  viewAllHref: string;
  onOpenLead: (id: string) => void;
  /** Aim the outreach composer at this lead + channel (per-row quick buttons). */
  onQuickAction?: (id: string, channel: "call" | "sms" | "email") => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <Link href={viewAllHref} className="text-xs font-medium text-blue-600 hover:text-blue-800">{t("assistants.common.viewAll")}</Link>
      </div>
      {leads.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">{loading ? "Loading…" : empty}</p>
      ) : (
        <div className="space-y-2">
          {leads.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"
            >
              <button
                type="button"
                onClick={() => onOpenLead(l.id)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{l.name ?? t("assistants.sales.unnamedLead")}</p>
                  <p className="truncate text-xs text-gray-500">
                    {[l.ai_intent, l.source].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {typeof l.engagement_score === "number" && (
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{l.engagement_score}</span>
                )}
              </button>
              {onQuickAction && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onQuickAction(l.id, "call")}
                    aria-label={`Call ${l.name ?? "lead"}`}
                    title={t("pages.labels.call")}
                    className="rounded-md border border-gray-200 p-1.5 text-gray-500 transition hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Phone className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickAction(l.id, "sms")}
                    aria-label={`Text ${l.name ?? "lead"}`}
                    title={t("pages.labels.sms")}
                    className="rounded-md border border-gray-200 p-1.5 text-gray-500 transition hover:bg-blue-50 hover:text-blue-600"
                  >
                    <MessageSquare className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onQuickAction(l.id, "email")}
                    aria-label={`Email ${l.name ?? "lead"}`}
                    title={t("pages.labels.emailChannel")}
                    className="rounded-md border border-gray-200 p-1.5 text-gray-500 transition hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Mail className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
