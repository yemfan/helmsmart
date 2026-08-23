"use client";

import {
  ActionButton,
  DashboardShell,
  DashboardTable,
  KpiCard,
  kpiSubtext,
  PriorityBadge,
  SectionCard,
} from "@/components/platform-dashboard";
import {
  supportKpis,
  supportNotes,
  supportThread,
  supportTickets,
  supportTrends,
  supportWorkload,
} from "@/lib/platform-dashboard-demo-data";
import { AlertCircle, Send, Shield, Tag, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function SupportDashboardClient() {
  const { t } = useTranslation("dashboard");
  return (
    <DashboardShell
      title={t("pages.supportDash.title")}
      subtitle="Queue triage, active conversation handling, and team operations in a single view."
      kpis={supportKpis.map((k) => (
        <KpiCard key={k.label} label={k.label} value={k.value} subtext={kpiSubtext(k)} />
      ))}
    >
        <section className="grid gap-6 xl:grid-cols-12">
          <SectionCard title={t("pages.supportDash.ticketQueue")} className="xl:col-span-8">
            <DashboardTable
              columns={[
                { key: "name", header: "Name" },
                { key: "subject", header: "Subject" },
                { key: "priority", header: "Priority", cell: (r) => <PriorityBadge level={r.priority as "low" | "medium" | "high" | "urgent"} /> },
                { key: "unread", header: "Unread", cell: (r) => <span className="inline-flex min-w-[2rem] justify-center rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">{String(r.unread)}</span> },
                { key: "waiting", header: "Waiting On", cell: (r) => <span className="text-xs text-slate-600">{Number(r.unread) > 0 ? t("pages.supportDashboard.support") : t("pages.supportDashboard.customer")}</span> },
              ]}
              rows={supportTickets as unknown as Record<string, unknown>[]}
            />
          </SectionCard>

          <SectionCard title={t("pages.supportDash.quickActions")} className="xl:col-span-4">
            <div className="grid grid-cols-2 gap-2">
              <ActionButton variant="secondary" className="justify-center" leftIcon={<UserPlus className="h-4 w-4" />}>{t("pages.supportDash.assignToMe")}</ActionButton>
              <ActionButton variant="secondary" className="justify-center" leftIcon={<AlertCircle className="h-4 w-4" />}>{t("pages.supportDash.markUrgent")}</ActionButton>
              <ActionButton variant="primary" className="justify-center" leftIcon={<Shield className="h-4 w-4" />}>{t("pages.supportDash.resolve")}</ActionButton>
              <ActionButton variant="secondary" className="justify-center" leftIcon={<Tag className="h-4 w-4" />}>{t("pages.supportDash.tag")}</ActionButton>
            </div>
          </SectionCard>
        </section>

        <section className="grid gap-6 xl:grid-cols-12">
          <SectionCard title={t("pages.supportDash.activeConversation")} className="xl:col-span-8">
            <div className="-m-5 divide-y divide-slate-100">
              <div className="max-h-[380px] space-y-4 overflow-y-auto px-5 py-5">
                {supportThread.map((m, i) => (
                  <div key={i} className={`flex ${m.from === "agent" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[min(100%,520px)] rounded-2xl px-4 py-3 text-sm shadow-sm ring-1 ${m.from === "agent" ? "bg-emerald-600 text-white ring-emerald-700/20" : "bg-white text-slate-800 ring-slate-200/80"}`}>
                      <p className="text-xs font-semibold opacity-80">{m.name}</p>
                      <p className="mt-1 leading-relaxed">{m.text}</p>
                      <p className={`mt-2 text-[10px] ${m.from === "agent" ? "text-white/70" : "text-slate-400"}`}>{m.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-slate-50/80 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <textarea
                    rows={3}
                    placeholder={t("pages.supportDash.typeReply")}
                    className="min-h-[88px] flex-1 resize-none rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-emerald-500/20 placeholder:text-slate-400 focus:border-emerald-300 focus:ring-2"
                    readOnly
                  />
                  <ActionButton variant="primary" className="h-11 shrink-0 sm:w-36" leftIcon={<Send className="h-4 w-4" />}>{t("pages.supportDash.send")}</ActionButton>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t("pages.supportDash.internalNotes")} className="xl:col-span-4">
            <ul className="space-y-2 text-sm text-slate-700">
              {supportNotes.map((n, i) => (
                <li key={i} className="rounded-xl border border-slate-100 bg-amber-50/40 px-3 py-2 ring-1 ring-amber-100/60">{n}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">billing</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">refund</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">priority-account</span>
            </div>
          </SectionCard>
        </section>

        <section className="grid gap-6 xl:grid-cols-12">
          <SectionCard title={t("pages.supportDash.issueTrends")} className="xl:col-span-8">
            <div className="relative h-48">
              <div className="absolute inset-0 flex items-end gap-2">
                {supportTrends.map((w) => (
                  <div key={w.week} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-36 w-full items-end justify-center gap-1">
                      <div className="w-1/2 rounded-t-lg bg-slate-200" style={{ height: `${Math.min(100, (w.opened / 60) * 100)}%` }} title={`Opened ${w.opened}`} />
                      <div className="w-1/2 rounded-t-lg bg-emerald-500" style={{ height: `${Math.min(100, (w.resolved / 60) * 100)}%` }} title={`Resolved ${w.resolved}`} />
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500">{w.week}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t("pages.supportDash.teamWorkload")} className="xl:col-span-4">
            <ul className="space-y-3">
              {supportWorkload.map((w) => (
                <li key={w.agent} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                  <span className="text-sm font-semibold text-slate-900">{w.agent}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-600">{w.open} open</span>
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-800 ring-1 ring-rose-100">{w.urgent} urgent</span>
                  </div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </section>
    </DashboardShell>
  );
}

