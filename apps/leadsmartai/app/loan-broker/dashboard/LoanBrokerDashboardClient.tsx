"use client";

import {
  ActionButton,
  DashboardShell,
  DashboardTable,
  KpiCard,
  kpiSubtext,
  PriorityBadge,
  SectionCard,
  StatusBadge,
} from "@/components/platform-dashboard";
import {
  brokerActivity,
  brokerBorrowers,
  brokerKpis,
  brokerMissingDocs,
  brokerPipeline,
  brokerTasks,
} from "@/lib/platform-dashboard-demo-data";
import { Activity, Banknote, Calculator, Landmark } from "lucide-react";
import { useTranslation } from "react-i18next";

function loanStatusTone(s: string): "success" | "warning" | "info" {
  if (s === "Underwriting" || s === "Application") return "info";
  if (s === "Docs") return "warning";
  return "success";
}

export default function LoanBrokerDashboardClient() {
  const { t } = useTranslation("dashboard");
  const maxPipe = Math.max(...brokerPipeline.map((p) => p.count), 1);

  return (
    <DashboardShell
      title={t("pages.loanBroker.dashboard")}
      subtitle={t("pages.loanBroker.dashboardSub")}
      kpis={brokerKpis.map((k) => (
        <KpiCard key={k.label} label={k.label} value={k.value} subtext={kpiSubtext(k)} />
      ))}
    >
        <section className="grid gap-6 xl:grid-cols-12">
          <SectionCard title={t("pages.loanBroker.borrowerQueue")} className="xl:col-span-8">
            <DashboardTable
              columns={[
                { key: "name", header: "Borrower" },
                { key: "amount", header: "Est. loan", cell: (r) => <span className="font-semibold tabular-nums">{String(r.amount)}</span> },
                { key: "readiness", header: "Readiness" },
                { key: "scenario", header: "Scenario", cell: () => <span className="text-xs text-slate-500">{t("pages.loanBroker.primary")}</span> },
                { key: "status", header: "Status", cell: (r) => <StatusBadge tone={loanStatusTone(String(r.status))}>{String(r.status)}</StatusBadge> },
                { key: "action", header: "Action", cell: () => <ActionButton className="h-8 px-2.5 text-xs">{t("pages.loanBroker.open")}</ActionButton> },
              ]}
              rows={brokerBorrowers as unknown as Record<string, unknown>[]}
            />
          </SectionCard>

          <SectionCard title={t("pages.loanBroker.aiFinanceTools")} className="xl:col-span-4">
            <div className="grid gap-2">
              {[
                { label: "Affordability summary", icon: Calculator },
                { label: "Loan comparison", icon: Landmark },
                { label: "Draft follow-up", icon: Activity },
                { label: "Refinance analysis", icon: Banknote },
              ].map((a) => (
                <ActionButton key={a.label} variant="secondary" className="w-full justify-start rounded-xl px-3.5 py-3" leftIcon={<a.icon className="h-4 w-4 text-indigo-700" />}>
                  {a.label}
                </ActionButton>
              ))}
            </div>
          </SectionCard>
        </section>

        <section className="grid gap-6 xl:grid-cols-12">
          <SectionCard title={t("pages.loanBroker.loanPipeline")} className="xl:col-span-8">
            <div className="space-y-4">
              {brokerPipeline.map((p) => (
                <div key={p.label}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-800">{p.label}</span>
                    <span className="text-xs font-medium text-slate-500">{t("pages.loanBrokerDashboard.borrowers", { count: p.count })}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
                    <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-600" style={{ width: `${Math.min(100, Math.round((p.count / maxPipe) * 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title={t("pages.loanBroker.missingDocs")} className="xl:col-span-4">
            <ul className="space-y-3">
              {brokerMissingDocs.map((d, i) => (
                <li key={i} className="rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-3 ring-1 ring-amber-100/80">
                  <p className="text-sm font-semibold text-slate-900">{d.borrower}</p>
                  <p className="mt-1 text-xs text-slate-600">{d.items}</p>
                  <div className="mt-2"><PriorityBadge level="high" /></div>
                </li>
              ))}
            </ul>
          </SectionCard>
        </section>

        <section className="grid gap-6 xl:grid-cols-12">
          <SectionCard title={t("pages.loanBroker.tasks")} className="xl:col-span-8">
            <ul className="space-y-2">
              {brokerTasks.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.due}</p>
                  </div>
                  <PriorityBadge level="medium" />
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title={t("pages.loanBroker.recentActivity")} className="xl:col-span-4">
            <ul className="space-y-3">
              {brokerActivity.map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{a.action}</p>
                    <p className="text-xs text-slate-600">{a.who}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{a.time}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </section>
    </DashboardShell>
  );
}

