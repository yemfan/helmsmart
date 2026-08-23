import type { Metadata } from "next";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { listInvoices } from "@/lib/books/invoices";
import { expenseTotalsForAgent, listExpensesForAgent } from "@/lib/books/expenses";
import { listTransactionsForAgent } from "@/lib/transactions/service";
import { getRevenueSummary } from "@/lib/performance/revenueService";
import AccountantClient from "./AccountantClient";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("pages.dashboardTitles.aiAccountant", { ns: "dashboard" });
  return {
  title,
  description: "Your commission pipeline, expenses, and receivables — know what you'll make and keep more of it.",
  robots: { index: false },
};
}

/**
 * AI Accountant — fifth member of the AI team (modeled on HelmSmart's
 * Alex, the AI Finance Director). A Realtor's paycheck is COMMISSION at
 * closing, so the page leads with the pipeline; expenses second;
 * invoices (referral fees / rebills) are receivables, the side story.
 * Server-composed from existing service layers — no new queries.
 */
export default async function AiAccountantPage() {
  const { agentId } = await getCurrentAgentContext();

  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartIso = monthStart.toISOString().slice(0, 10);

  const [invoices, expenseTotals, recentExpenses, transactions, revenue] = await Promise.all([
    listInvoices(50),
    expenseTotalsForAgent(agentId, { from: monthStartIso }),
    listExpensesForAgent(agentId, { limit: 6 }),
    listTransactionsForAgent(String(agentId)).catch(() => []),
    getRevenueSummary(String(agentId), "ytd").catch(() => null),
  ]);

  // The pipeline: every active/pending deal with its expected payout.
  const pipelineDeals = transactions
    .filter((t) => t.status === "active" || t.status === "pending")
    .map((t) => ({
      id: t.id,
      property_address: t.property_address,
      contact_name: t.contact_name,
      closing_date: t.closing_date,
      expected_net: t.agent_net_commission ?? t.gross_commission ?? null,
      commission_missing: t.gross_commission == null && t.agent_net_commission == null,
    }))
    .sort((a, b) => {
      if (!a.closing_date) return 1;
      if (!b.closing_date) return -1;
      return new Date(a.closing_date).getTime() - new Date(b.closing_date).getTime();
    });

  return (
    <AccountantClient
      pipelineDeals={pipelineDeals}
      closedYtdNet={revenue?.netCommission ?? 0}
      closedYtdCount={revenue?.closedCount ?? 0}
      invoices={invoices.map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        client_name: i.client_name,
        status: i.status,
        due_date: i.due_date,
        total: i.total,
      }))}
      expensesMonthTotal={expenseTotals.total ?? 0}
      expensesByCategory={expenseTotals.byCategory ?? []}
      recentExpenses={recentExpenses.map((e) => ({
        id: e.id,
        expense_date: e.expense_date,
        amount: e.amount,
        category: e.category,
        vendor: e.vendor,
      }))}
    />
  );
}
