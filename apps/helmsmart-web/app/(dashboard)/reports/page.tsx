import { ResponsibleEmployee } from "@/components/responsible-employee";
import type { Metadata } from "next";
import { getPnLReport, getCashFlowSummary, getTimeReport, getReceivablesAging, getCashFlowForecast, getSalesTaxReport } from "@/lib/actions/reports";
import { listProjectsPnL, listClientsPnL } from "@/lib/actions/projects";
import { ReportsClient } from "./reports-client";
import { getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("reports.business.metaTitle") };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const t = await getServerT("books");
  const { tab } = await searchParams;
  // Default: current calendar year
  const y = new Date().getFullYear();
  const from = `${y}-01-01`;
  const to   = `${y}-12-31`;

  const [pnl, cashFlow, timeReport, projects, clients, receivables, forecast, salesTax, currency] = await Promise.all([
    getPnLReport(from, to),
    getCashFlowSummary(from, to),
    getTimeReport(from, to),
    listProjectsPnL(),
    listClientsPnL(),
    getReceivablesAging(),
    getCashFlowForecast(),
    getSalesTaxReport(from, to),
    orgCurrency(),
  ]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <ResponsibleEmployee slug="tim" className="mb-3" />
        <h1 className="text-2xl font-semibold text-slate-900">{t("reports.business.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t("reports.business.subtitle")}</p>
      </div>

      <ReportsClient
        initialTab={tab}
        currency={currency}
        initialPnL={pnl}
        initialCashFlow={cashFlow}
        initialTimeReport={timeReport}
        initialProjects={projects}
        initialClients={clients}
        initialReceivables={receivables}
        initialForecast={forecast}
        initialSalesTax={salesTax}
        fetchPnL={getPnLReport}
        fetchCashFlow={getCashFlowSummary}
        fetchTimeReport={getTimeReport}
        fetchSalesTax={getSalesTaxReport}
      />
    </div>
  );
}
