"use client";

import Link from "next/link";
import { getAssistant } from "@/lib/realtyboss/team";
import { AssistantHeader, AssistantKpiCard } from "@/components/realtyboss/AssistantPage";

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

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDay(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}

const STATUS_CHIP: Record<string, string> = {
  overdue: "bg-red-100 text-red-700",
  sent: "bg-amber-100 text-amber-700",
  draft: "bg-gray-100 text-gray-600",
  paid: "bg-emerald-100 text-emerald-700",
  void: "bg-gray-100 text-gray-400",
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
          { label: "Expenses", href: "/dashboard/expenses" },
          { label: "Invoices", href: "/dashboard/books" },
          { label: "Manage", href: "/dashboard/ai-team" },
        ]}
      />

      {/* A Realtor's paycheck is commission at closing — lead with it. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AssistantKpiCard
          label="Commission pipeline"
          value={money(pipelineTotal)}
          hint={`${pipelineDeals.length} deal${pipelineDeals.length === 1 ? "" : "s"} · expected net`}
        />
        <AssistantKpiCard
          label="Next payout"
          value={nextPayout?.expected_net != null ? money(nextPayout.expected_net) : "—"}
          hint={nextPayout?.closing_date ? `${nextPayout.property_address} · closes ${fmtDay(nextPayout.closing_date)}` : "no closing scheduled"}
        />
        <AssistantKpiCard
          label="Closed this year"
          value={money(closedYtdNet)}
          hint={`${closedYtdCount} closing${closedYtdCount === 1 ? "" : "s"} · net`}
        />
        <AssistantKpiCard label="Expenses this month" value={money(expensesMonthTotal)} />
      </div>

      {/* ── Commission pipeline — the real paycheck ── */}
      <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Commission pipeline</h2>
          <Link href="/dashboard/performance" className="text-xs font-medium text-blue-600 hover:text-blue-800">Revenue & forecast</Link>
        </div>
        {pipelineDeals.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            Your AI Accountant is ready — when a deal goes under contract, its expected commission shows up here.
          </p>
        ) : (
          <div className="space-y-2">
            {pipelineDeals.map((d) => (
              <Link key={d.id} href={`/dashboard/transactions/${d.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{d.property_address}</p>
                  <p className="text-xs text-gray-500">
                    {d.contact_name ?? "—"}{d.closing_date ? ` · closes ${fmtDay(d.closing_date)}` : " · no closing date"}
                  </p>
                </div>
                {d.commission_missing ? (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                    commission details missing
                  </span>
                ) : (
                  <span className="shrink-0 text-sm font-semibold text-gray-900">{money(d.expected_net ?? 0)}</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Spending this month (1099 life: every category counts) ── */}
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Spending this month</h2>
            <Link href="/dashboard/expenses" className="text-xs font-medium text-blue-600 hover:text-blue-800">All expenses</Link>
          </div>
          {topCategories.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {topCategories.map((c) => (
                <span key={c.category} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  {c.category}: {money(c.total)}
                </span>
              ))}
            </div>
          )}
          {recentExpenses.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              No expenses logged yet — track them and your AI Accountant keeps the categories clean for tax time.
            </p>
          ) : (
            <div className="space-y-2">
              {recentExpenses.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{e.vendor ?? e.category}</p>
                    <p className="text-xs text-gray-500">{e.category} · {fmtDay(e.expense_date)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-gray-700">{money(e.amount || 0)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Receivables — the side story (referral fees, rebills) ── */}
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Receivables
              {overdueReceivables.length > 0 && (
                <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                  {overdueReceivables.length} overdue
                </span>
              )}
            </h2>
            <Link href="/dashboard/books" className="text-xs font-medium text-blue-600 hover:text-blue-800">All invoices</Link>
          </div>
          <p className="mb-2 text-[11px] text-gray-400">Referral fees, vendor rebills, and anything else owed to you outside of closings.</p>
          {invoices.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">Nothing outstanding — commissions are tracked in the pipeline above.</p>
          ) : (
            <div className="space-y-2">
              {[...overdueReceivables, ...invoices.filter((i) => i.status !== "overdue")].slice(0, 5).map((i) => (
                <Link key={i.id} href="/dashboard/books" className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{i.invoice_number} · {i.client_name ?? "—"}</p>
                    <p className="text-xs text-gray-500">{money(i.total || 0)}{i.due_date ? ` · due ${fmtDay(i.due_date)}` : ""}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[i.status] ?? "bg-gray-100 text-gray-600"}`}>
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
