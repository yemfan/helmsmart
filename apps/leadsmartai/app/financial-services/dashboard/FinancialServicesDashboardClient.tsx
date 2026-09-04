"use client";

import Link from "next/link";
import {
  ActionButton,
  DashboardTable,
  KpiCard,
  kpiSubtext,
  PriorityBadge,
  SectionCard,
  StatusBadge,
} from "@/components/platform-dashboard";
import {
  faActivity,
  faAiTools,
  faAlerts,
  faKpis,
  faProspects,
  faRecruits,
  faRecruitStages,
  faTasks,
} from "@/lib/financial-services-demo-data";
import { FileText, GitBranch, MessageSquareText, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

function prospectStatusTone(s: string): "success" | "warning" | "info" {
  if (s === "FNA Done") return "success";
  if (s === "Appt Set") return "info";
  return "warning";
}

function recruitStageTone(s: string): "success" | "warning" | "info" {
  if (s === "Licensed" || s === "First Sale" || s === "Promoted") return "success";
  if (s === "BPM Attended" || s === "License In Progress") return "info";
  return "warning";
}

const TOOL_ICONS = [Sparkles, MessageSquareText, GitBranch, FileText];

export default function FinancialServicesDashboardClient() {
  const { t } = useTranslation("dashboard");
  const maxRecruit = Math.max(...faRecruitStages.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("pages.financialServices.dashboard")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("pages.financialServices.dashboardSub")}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {faKpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} subtext={kpiSubtext(k)} />
        ))}
      </div>

      <section className="grid gap-6 xl:grid-cols-12">
        <SectionCard title={t("pages.financialServices.activeProspects")} className="xl:col-span-8">
          <DashboardTable
            columns={[
              { key: "name", header: "Prospect" },
              { key: "city", header: "Location" },
              { key: "age", header: "Age", cell: (r) => <span className="tabular-nums">{String(r.age)}</span> },
              { key: "product", header: "Product interest" },
              { key: "score", header: "Score", cell: (r) => <span className="font-semibold tabular-nums">{String(r.score)}</span> },
              { key: "status", header: "Stage", cell: (r) => <StatusBadge tone={prospectStatusTone(String(r.status))}>{String(r.status)}</StatusBadge> },
              { key: "action", header: "Action", cell: () => <ActionButton className="h-8 px-2.5 text-xs">{t("pages.financialServices.open")}</ActionButton> },
            ]}
            rows={faProspects as unknown as Record<string, unknown>[]}
          />
        </SectionCard>

        <SectionCard title={t("pages.financialServices.aiTools")} className="xl:col-span-4">
          <div className="grid gap-2">
            {faAiTools.map((tool, i) => {
              const Icon = TOOL_ICONS[i] ?? Sparkles;
              return (
                <Link key={tool.label} href={tool.route} className="block">
                  <ActionButton
                    variant="secondary"
                    className="w-full justify-start rounded-xl px-3.5 py-3"
                    leftIcon={<Icon className="h-4 w-4 text-indigo-700" />}
                  >
                    {tool.label}
                  </ActionButton>
                </Link>
              );
            })}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <SectionCard title={t("pages.financialServices.recruitPipeline")} className="xl:col-span-8">
          <div className="space-y-4">
            {faRecruitStages.map((s) => (
              <div key={s.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-800">{s.label}</span>
                  <span className="text-xs font-medium text-slate-500">{t("pages.fsDashboard.recruits", { count: s.count })}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/80">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600"
                    style={{ width: `${Math.min(100, Math.round((s.count / maxRecruit) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Link
              href="/financial-services/dashboard/recruits"
              className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
            >
              {t("pages.financialServicesDashboard.openRecruitBoard")}
            </Link>
          </div>
        </SectionCard>

        <SectionCard title={t("pages.financialServices.alerts")} className="xl:col-span-4">
          <ul className="space-y-3">
            {faAlerts.map((a, i) => (
              <li
                key={i}
                className={[
                  "rounded-xl border px-3 py-3 ring-1",
                  a.tone === "warning"
                    ? "border-amber-100 bg-amber-50/50 ring-amber-100/80"
                    : a.tone === "success"
                      ? "border-emerald-100 bg-emerald-50/50 ring-emerald-100/80"
                      : "border-sky-100 bg-sky-50/50 ring-sky-100/80",
                ].join(" ")}
              >
                <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                <p className="mt-1 text-xs text-slate-600">{a.detail}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <SectionCard title={t("pages.financialServices.recentRecruits")} className="xl:col-span-8">
          <DashboardTable
            columns={[
              { key: "name", header: "Recruit" },
              { key: "referredBy", header: "Referred by" },
              { key: "stage", header: "Stage", cell: (r) => <StatusBadge tone={recruitStageTone(String(r.stage))}>{String(r.stage)}</StatusBadge> },
              { key: "joinedDaysAgo", header: "In pipeline", cell: (r) => <span className="text-xs text-slate-500">{t("pages.fsDashboard.daysInPipeline", { count: Number(r.joinedDaysAgo), n: String(r.joinedDaysAgo) })}</span> },
              { key: "fitScore", header: "Fit", cell: (r) => <span className="font-semibold tabular-nums">{String(r.fitScore)}</span> },
            ]}
            rows={faRecruits as unknown as Record<string, unknown>[]}
          />
        </SectionCard>

        <SectionCard title={t("pages.financialServices.today")} className="xl:col-span-4">
          <ul className="space-y-2">
            {faTasks.map((t, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{t.title}</p>
                  <p className="text-xs text-slate-500">{t.due}</p>
                </div>
                <PriorityBadge level={i < 2 ? "high" : "medium"} />
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <SectionCard title={t("pages.financialServices.recentActivity")} className="xl:col-span-12">
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {faActivity.map((a, i) => (
              <li key={i} className="rounded-xl border border-slate-100 bg-white px-3 py-3">
                <p className="text-sm font-semibold text-slate-900">{a.action}</p>
                <p className="mt-1 text-xs text-slate-600">{a.target}</p>
                <p className="mt-2 text-xs text-slate-400">{a.time}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </section>
    </div>
  );
}
