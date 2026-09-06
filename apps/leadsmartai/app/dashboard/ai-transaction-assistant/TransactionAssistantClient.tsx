"use client";

import { useTranslation } from "react-i18next";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAssistant } from "@/lib/closeboss/team";
import { assessTransactionHealth } from "@/lib/closeboss/transactionHealth";
import {
  happeningLine,
  levelLabel,
  missingLine,
  nextLine,
  riskLine,
} from "@/lib/closeboss/transactionHealthText";
import { intlLocale } from "@/lib/i18n/locale";
import { AssistantHeader, AssistantKpiCard } from "@/components/closeboss/AssistantPage";

type TransactionItem = {
  id: string;
  property_address: string;
  status: string;
  contact_name: string | null;
  inspection_deadline: string | null;
  inspection_completed_at: string | null;
  appraisal_deadline: string | null;
  appraisal_completed_at: string | null;
  loan_contingency_deadline: string | null;
  loan_contingency_removed_at: string | null;
  closing_date: string | null;
  task_total: number;
  task_completed: number;
  task_overdue: number;
};

type Alert = {
  transactionId: string;
  propertyAddress: string;
  contactName: string | null;
  label: string;
  due: Date;
  risk: "high" | "medium";
};

const assistant = getAssistant("transaction_assistant");

const DAY_MS = 24 * 60 * 60 * 1000;

export default function TransactionAssistantClient() {
  // Named `tr` — transaction rows already bind `t` in their maps.
  const { t: tr, i18n } = useTranslation("dashboard");
  const dateLocale = intlLocale(i18n.language);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/dashboard/transactions").then((r) => r.json()).catch(() => ({}));
    setTransactions((res?.transactions ?? []) as TransactionItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(
    () => transactions.filter((t) => t.status === "active" || t.status === "pending"),
    [transactions],
  );

  // Open contingency / closing deadlines within 14 days (or overdue).
  const alerts = useMemo<Alert[]>(() => {
    const now = Date.now();
    const horizon = now + 14 * DAY_MS;
    const out: Alert[] = [];
    for (const t of active) {
      const candidates: { label: string; date: string | null; done: string | null }[] = [
        { label: tr("assistants.transaction.deadlineLabels.inspection"), date: t.inspection_deadline, done: t.inspection_completed_at },
        { label: tr("assistants.transaction.deadlineLabels.appraisal"), date: t.appraisal_deadline, done: t.appraisal_completed_at },
        { label: tr("assistants.transaction.deadlineLabels.loan"), date: t.loan_contingency_deadline, done: t.loan_contingency_removed_at },
        { label: tr("assistants.transaction.deadlineLabels.closing"), date: t.closing_date, done: null },
      ];
      for (const c of candidates) {
        if (!c.date || c.done) continue;
        const due = new Date(c.date);
        if (due.getTime() > horizon) continue;
        out.push({
          transactionId: t.id,
          propertyAddress: t.property_address,
          contactName: t.contact_name,
          label: c.label,
          due,
          risk: due.getTime() < now + 3 * DAY_MS ? "high" : "medium",
        });
      }
    }
    return out.sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [active]);

  const overdueTaskCount = useMemo(
    () => active.reduce((sum, t) => sum + (t.task_overdue ?? 0), 0),
    [active],
  );
  const atRisk = useMemo(
    () =>
      active.filter(
        (t) =>
          (t.task_overdue ?? 0) > 0 ||
          alerts.some((a) => a.transactionId === t.id && a.risk === "high"),
      ),
    [active, alerts],
  );

  return (
    <div className="space-y-4">
      <AssistantHeader
        assistant={assistant}
        actions={[
          { label: tr("assistants.transaction.tabs.allDeals"), href: "/dashboard/transactions" },
          { label: tr("assistants.transaction.tabs.coordinator"), href: "/dashboard/transactions/coordinator" },
          { label: tr("assistants.common.manage"), href: "/dashboard/ai-team" },
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AssistantKpiCard label={tr("assistants.transaction.stats.active")} value={loading ? undefined : active.length} />
        <AssistantKpiCard label={tr("assistants.transaction.stats.deadlines14")} value={loading ? undefined : alerts.length} tone={alerts.some((a) => a.risk === "high") ? "warn" : undefined} />
        <AssistantKpiCard label={tr("assistants.transaction.stats.overdueItems")} value={loading ? undefined : overdueTaskCount} tone={overdueTaskCount > 0 ? "warn" : undefined} />
        <AssistantKpiCard label={tr("assistants.transaction.stats.atRisk")} value={loading ? undefined : atRisk.length} tone={atRisk.length > 0 ? "hot" : undefined} />
      </div>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{tr("assistants.transaction.deadlinesHeading")}</h2>
        {alerts.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {loading ? tr("pages.transactionAssistant.checkingYourTransactions") : tr("pages.transactionAssistant.noOpenDeadlinesIn")}
          </p>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <Link key={`${a.transactionId}-${a.label}`} href={`/dashboard/transactions/${a.transactionId}`} className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{a.propertyAddress}</p>
                  <p className="text-xs text-slate-500">
                    {a.label}
                    {a.contactName ? ` · ${a.contactName}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${a.risk === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {a.due.getTime() < Date.now() ? `${tr("health.overdueSuffix")} · ` : ""}
                  {a.due.toLocaleDateString(dateLocale, { month: "short", day: "numeric" })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Transaction health (constitution: health, not data) ── */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{tr("assistants.transaction.healthHeading")}</h2>
          <Link href="/dashboard/transactions" className="text-xs font-medium text-blue-600 hover:text-blue-800">{tr("assistants.common.viewAll")}</Link>
        </div>
        {active.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            {loading ? tr("common:actions.loading") : tr("pages.transactionAssistant.yourAiTransactionAssistant")}
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-3">
            {active.slice(0, 9).map((t) => {
              const h = assessTransactionHealth(t);
              const tone =
                h.level === "at_risk"
                  ? "border-red-200 bg-red-50/40"
                  : h.level === "needs_attention"
                    ? "border-amber-200 bg-amber-50/40"
                    : "border-emerald-200 bg-emerald-50/30";
              const chip =
                h.level === "at_risk"
                  ? "bg-red-100 text-red-700"
                  : h.level === "needs_attention"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700";
              return (
                <Link key={t.id} href={`/dashboard/transactions/${t.id}`} className={`rounded-xl border p-3 transition hover:shadow-sm ${tone}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{t.property_address}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip}`}>{levelLabel(h.level, tr)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{t.contact_name ?? "—"} · {happeningLine(h.happening, tr, dateLocale)}</p>
                  {h.next && (
                    <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{tr("assistants.transaction.next")}</span> {nextLine(h.next, tr, dateLocale)}
                    </p>
                  )}
                  {h.overdueTasks > 0 && (
                    <p className="text-xs text-amber-700"><span className="font-medium">{tr("assistants.transaction.missing")}</span> {missingLine(h.overdueTasks, tr)}</p>
                  )}
                  {h.risk && (
                    <p className="text-xs font-medium text-red-700"><span className="font-semibold">{tr("assistants.transaction.atRisk")}</span> {riskLine(h.risk, tr, dateLocale)}</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
