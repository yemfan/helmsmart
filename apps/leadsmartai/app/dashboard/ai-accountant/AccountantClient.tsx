"use client";

import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { getAssistant } from "@/lib/closeboss/team";
import { AssistantHeader, AssistantKpiCard } from "@/components/closeboss/AssistantPage";

type PipelineDeal = {
  id: string;
  property_address: string;
  contact_name: string | null;
  closing_date: string | null;
  expected_net: number | null;
  commission_missing: boolean;
};

type InvoiceItem = {
  id: string;
  invoice_number: string;
  client_name: string | null;
  status: string;
  due_date: string | null;
  total: number;
};

type ExpenseItem = {
  id: string;
  expense_date: string;
  amount: number;
  category: string;
  vendor: string | null;
};

const assistant = getAssistant("accountant");

function money(n: number, locale: string): string {
  return n.toLocaleString(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDay(iso: string | null, locale: string): string {
  return iso ? new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" }) : "—";
}

const STATUS_CHIP: Record<string, string> = {
  overdue: "bg-red-100 text-red-700",
  sent: "bg-amber-100 text-amber-700",
  draft: "bg-slate-100 text-slate-600",
  paid: "bg-emerald-100 text-emerald-700",
  void: "bg-slate-100 text-slate-400",
};

export default function AccountantClient({
  pipelineDeals,
  closedYtdNet,
  closedYtdCount,
  invoices,
  expensesMonthTotal,
  expensesByCategory,
  recentExpenses,
}: {
  pipelineDeals: PipelineDeal[];
  closedYtdNet: number;
  closedYtdCount: number;
  invoices: InvoiceItem[];
  expensesMonthTotal: number;
  expensesByCategory: { category: string; total: number }[];
  recentExpenses: ExpenseItem[];
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const pipelineTotal = pipelineDeals.reduce((s, d) => s + (d.expected_net ?? 0), 0);
  const nextPayout = pipelineDeals.find((d) => d.closing_date && d.expected_net != null);
  const openReceivables = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const overdueReceivables = openReceivables.filter((i) => i.status === "overdue");
  const topCategories = [...expensesByCategory].sort((a, b) => b.total - a.total).slice(0, 3);

  return (
    <div className="space-y-4">
      <AssistantHeader
        assistant={assistant}
        actions={[
          { label: t("assistants.accountant.tabs.expenses"), href: "/dashboard/expenses" },
          { label: t("assistants.accountant.tabs.invoices"), href: "/dashboard/books" },
          { label: t("assistants.common.manage"), href: "/dashboard/ai-team" },
        ]}
      />

      {/* A Realtor's paycheck is commission at closing — lead with it. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AssistantKpiCard
          label={t("assistants.accountant.stats.pipeline")}
          value={money(pipelineTotal, locale)}
          hint={`${pipelineDeals.length} deal${pipelineDeals.length === 1 ? "" : "s"} · expected net`}
        />
        <AssistantKpiCard
          label={t("assistants.accountant.stats.nextPayout")}
          value={nextPayout?.expected_net != null ? money(nextPayout.expected_net, locale) : "—"}
          hint={nextPayout?.closing_date ? `${nextPayout.property_address} · closes ${fmtDay(nextPayout.closing_date, locale)}` : "no closing scheduled"}
        />
        <AssistantKpiCard
          label={t("assistants.accountant.stats.closedThisYear")}
          value={money(closedYtdNet, locale)}
          hint={`${closedYtdCount} closing${closedYtdCount === 1 ? "" : "s"} · net`}
        />
        <AssistantKpiCard label={t("assistants.accountant.stats.expensesThisMonth")} value={money(expensesMonthTotal, locale)} />
      </div>

      {/* ── Commission pipeline — the real paycheck ── */}
      <section className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("assistants.accountant.commissionPipeline")}</h2>
          <Link href="/dashboard/performance" className="text-xs font-medium text-blue-600 hover:text-blue-800">{t("assistants.accountant.revenueForecast")}</Link>
        </div>
        {pipelineDeals.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">{t("pages.accountant.ready")}</p>
        ) : (
          <div className="space-y-2">
            {pipelineDeals.map((d) => (
              <Link key={d.id} href={`/dashboard/transactions/${d.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{d.property_address}</p>
                  <p className="text-xs text-slate-500">
                    {d.contact_name ?? "—"}{d.closing_date ? ` · closes ${fmtDay(d.closing_date, locale)}` : " · no closing date"}
                  </p>
                </div>
                {d.commission_missing ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{t("pages.accountant.commissionMissing")}</span>
                ) : (
                  <span className="shrink-0 text-sm font-semibold text-slate-900 dark:text-slate-100">{money(d.expected_net ?? 0, locale)}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Spending this month (1099 life: every category counts) ── */}
        <section className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("assistants.accountant.spendingThisMonth")}</h2>
            <Link href="/dashboard/expenses" className="text-xs font-medium text-blue-600 hover:text-blue-800">{t("assistants.accountant.allExpenses")}</Link>
          </div>
          {topCategories.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {topCategories.map((c) => (
                <span key={c.category} className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400">
                  {c.category}: {money(c.total, locale)}
                </span>
              ))}
            </div>
          )}
          {recentExpenses.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{t("pages.accountant.noExpenses")}</p>
          ) : (
            <div className="space-y-2">
              {recentExpenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{e.vendor ?? e.category}</p>
                    <p className="text-xs text-slate-500">{e.category} · {fmtDay(e.expense_date, locale)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-300">{money(e.amount || 0, locale)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Receivables — the side story (referral fees, rebills) ── */}
        <section className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.dashFragments.receivables")}{overdueReceivables.length > 0 && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  {t("pages.accountant.overdueCount", { count: overdueReceivables.length })}
                </span>
              )}
            </h2>
            <Link href="/dashboard/books" className="text-xs font-medium text-blue-600 hover:text-blue-800">{t("assistants.accountant.allInvoices")}</Link>
          </div>
          <p className="mb-2 text-[11px] text-slate-400">{t("tips.accountantOther")}</p>
          {invoices.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">{t("pages.accountant.nothingOutstanding")}</p>
          ) : (
            <div className="space-y-2">
              {[...overdueReceivables, ...invoices.filter((i) => i.status !== "overdue")].slice(0, 5).map((i) => (
                <Link key={i.id} href="/dashboard/books" className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{i.invoice_number} · {i.client_name ?? "—"}</p>
                    <p className="text-xs text-slate-500">{money(i.total || 0, locale)}{i.due_date ? ` · due ${fmtDay(i.due_date, locale)}` : ""}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[i.status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}>
                    {i.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
