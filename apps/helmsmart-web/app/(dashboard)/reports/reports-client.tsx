"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { Download, TrendingUp, TrendingDown, DollarSign, Clock, Users, FolderOpen, Receipt, Wallet, AlertTriangle } from "lucide-react";
import type { PnLReport, CashFlowSummary, TimeReport, ReceivablesAging, CashFlowForecast, SalesTaxReport } from "@/lib/actions/reports";
import type { ProjectWithPnL, ClientPnL } from "@/lib/actions/projects";
import { moneyFormatter, dateFormatter } from "@/lib/books-format";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function thisYear() {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function lastYear() {
  const y = new Date().getFullYear() - 1;
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function thisMonth() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${last}` };
}

function lastQuarter() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  const pq = q === 0 ? 3 : q - 1;
  const y = q === 0 ? d.getFullYear() - 1 : d.getFullYear();
  const starts = [1, 4, 7, 10];
  const sm = starts[pq];
  const em = sm + 2;
  const lastDay = new Date(y, em, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { from: `${y}-${pad(sm)}-01`, to: `${y}-${pad(em)}-${lastDay}` };
}

// `key` names the label in `reports.business.presets.*`; the function is the range.
const PRESETS = [
  { key: "thisMonth",   fn: thisMonth },
  { key: "lastQuarter", fn: lastQuarter },
  { key: "thisYear",    fn: thisYear },
  { key: "lastYear",    fn: lastYear },
];

// ─── Stat card ────────────────────────────────────────────────────────────────
// `value` arrives already formatted — the money and hours formatters both need
// the reader's locale, which lives in the one component that binds i18n.

function StatCard({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  const color =
    positive === undefined
      ? "text-slate-800"
      : positive
      ? "text-emerald-600"
      : "text-rose-600";

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Mini bar ─────────────────────────────────────────────────────────────────

function MiniBar({ value, max, color = "bg-indigo-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Aging cell ───────────────────────────────────────────────────────────────

function AgingCell({
  value,
  fmt,
  tone = "slate",
}: {
  value: number;
  fmt: (n: number) => string;
  tone?: "slate" | "warn" | "danger";
}) {
  if (value <= 0) return <span className="text-sm text-right tabular-nums text-slate-300">—</span>;
  const color = tone === "danger" ? "text-rose-600 font-medium" : tone === "warn" ? "text-amber-600" : "text-slate-600";
  return <span className={`text-sm text-right tabular-nums ${color}`}>{fmt(value)}</span>;
}

// ─── CSV export ───────────────────────────────────────────────────────────────
// Headers and row labels stay English on purpose: a spreadsheet, an accountant's
// import template or a downstream tool reads these, not the owner.

function exportPnLCsv(report: PnLReport) {
  const rows: string[] = [
    "Type,Account Code,Account Name,Amount",
    ...report.revenue.map((r) => `Revenue,${r.account_code},"${r.account_name}",${r.total.toFixed(2)}`),
    `Revenue,,,${report.grossRevenue.toFixed(2)}`,
    "",
    ...report.expenses.map((e) => `Expense,${e.account_code},"${e.account_name}",${e.total.toFixed(2)}`),
    `Expense,,,${report.totalExpenses.toFixed(2)}`,
    "",
    `Net Income,,,${report.netIncome.toFixed(2)}`,
  ];
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pnl_${report.from}_to_${report.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTimeCsv(report: TimeReport) {
  const rows: string[] = [
    "Category,Name,Total Hours,Billable Hours,Billable Amount",
    ...report.byProject.map((p) =>
      `Project,"${p.project_name}",${(p.totalMinutes / 60).toFixed(2)},${(p.billableMinutes / 60).toFixed(2)},${p.billableAmount.toFixed(2)}`
    ),
    "",
    ...report.byClient.map((c) =>
      `Client,"${c.client_name}",${(c.totalMinutes / 60).toFixed(2)},${(c.billableMinutes / 60).toFixed(2)},${c.billableAmount.toFixed(2)}`
    ),
  ];
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `time_report_${report.from}_to_${report.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportProjectsCsv(projects: ProjectWithPnL[]) {
  const rows: string[] = [
    "Project,Status,Revenue,Labor Cost,Expenses,Profit,Margin %",
    ...projects.map((p) =>
      `"${p.name}",${p.status},${p.pnl.revenue.toFixed(2)},${p.pnl.laborCost.toFixed(2)},${p.pnl.expensesTotal.toFixed(2)},${p.pnl.profit.toFixed(2)},${p.pnl.margin !== null ? (p.pnl.margin * 100).toFixed(1) : ""}`
    ),
  ];
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "project_profitability.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function exportClientsCsv(clients: ClientPnL[]) {
  const rows: string[] = [
    "Client,Revenue,Labor Cost,Expenses,Profit,Margin %",
    ...clients.map((c) =>
      `"${c.name}",${c.revenue.toFixed(2)},${c.laborCost.toFixed(2)},${c.expensesTotal.toFixed(2)},${c.profit.toFixed(2)},${c.margin !== null ? (c.margin * 100).toFixed(1) : ""}`
    ),
  ];
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "client_profitability.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function exportAgingCsv(aging: ReceivablesAging) {
  const rows: string[] = [
    "Client,Invoices,Current,1-30,31-60,61-90,90+,Total",
    ...aging.rows.map((r) =>
      `"${r.client_name}",${r.invoiceCount},${r.current.toFixed(2)},${r.d1_30.toFixed(2)},${r.d31_60.toFixed(2)},${r.d61_90.toFixed(2)},${r.d90_plus.toFixed(2)},${r.total.toFixed(2)}`
    ),
    `Total,,${aging.totals.current.toFixed(2)},${aging.totals.d1_30.toFixed(2)},${aging.totals.d31_60.toFixed(2)},${aging.totals.d61_90.toFixed(2)},${aging.totals.d90_plus.toFixed(2)},${aging.totals.total.toFixed(2)}`,
  ];
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ar_aging_${aging.asOf}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportForecastCsv(f: CashFlowForecast) {
  const rows: string[] = [
    "Period,Expected In,Expected Out,Net,Projected Balance",
    `Starting balance,,,,${f.startingBalance.toFixed(2)}`,
    ...f.periods.map((p) =>
      `"${p.label}",${p.inflow.toFixed(2)},${p.outflow.toFixed(2)},${p.net.toFixed(2)},${p.projectedBalance.toFixed(2)}`
    ),
  ];
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cash_forecast_${f.asOf}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportSalesTaxCsv(r: SalesTaxReport) {
  const rows: string[] = [
    "Tax Rate,Taxable Sales,Tax Collected,Invoices",
    ...r.byRate.map((x) => `${(x.rate * 100).toFixed(2)}%,${x.taxableSales.toFixed(2)},${x.taxCollected.toFixed(2)},${x.invoiceCount}`),
    `Total,${r.taxableSales.toFixed(2)},${r.taxCollected.toFixed(2)},${r.taxedInvoiceCount}`,
    `Non-taxable sales,${r.nonTaxableSales.toFixed(2)},,`,
  ];
  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sales_tax_${r.from}_to_${r.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Color dot map ────────────────────────────────────────────────────────────

const COLOR_DOTS: Record<string, string> = {
  indigo:  "bg-indigo-500",
  emerald: "bg-emerald-500",
  rose:    "bg-rose-500",
  amber:   "bg-amber-500",
  violet:  "bg-violet-500",
  slate:   "bg-slate-400",
};

// ─── Main client component ────────────────────────────────────────────────────

interface Props {
  initialTab?: string;
  /** `organizations.currency` — the ledger's currency, not the reader's country. */
  currency: string;
  initialPnL: PnLReport;
  initialCashFlow: CashFlowSummary;
  initialTimeReport: TimeReport;
  initialProjects: ProjectWithPnL[];
  initialClients: ClientPnL[];
  initialReceivables: ReceivablesAging;
  initialForecast: CashFlowForecast;
  initialSalesTax: SalesTaxReport;
  fetchPnL: (from: string, to: string) => Promise<PnLReport>;
  fetchCashFlow: (from: string, to: string) => Promise<CashFlowSummary>;
  fetchTimeReport: (from: string, to: string) => Promise<TimeReport>;
  fetchSalesTax: (from: string, to: string) => Promise<SalesTaxReport>;
}

export function ReportsClient({
  initialTab,
  currency,
  initialPnL,
  initialCashFlow,
  initialTimeReport,
  initialProjects,
  initialClients,
  initialReceivables,
  initialForecast,
  initialSalesTax,
  fetchPnL,
  fetchCashFlow,
  fetchTimeReport,
  fetchSalesTax,
}: Props) {
  const { t, i18n } = useTranslation("books");
  const fmt = moneyFormatter(i18n.language, currency, { minimumFractionDigits: 2 });
  const fmtDate = dateFormatter(i18n.language, { year: "numeric", month: "short", day: "numeric" });

  function fmtHours(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return t("reports.business.hours.minutes", { minutes: m });
    if (m === 0) return t("reports.business.hours.hours", { hours: h });
    return t("reports.business.hours.hoursMinutes", { hours: h, minutes: m });
  }

  const [from, setFrom]     = useState(initialPnL.from);
  const [to, setTo]         = useState(initialPnL.to);
  const [pnl, setPnl]       = useState(initialPnL);
  const [cash, setCash]     = useState(initialCashFlow);
  const [time, setTime]     = useState(initialTimeReport);
  const [salesTax, setSalesTax] = useState(initialSalesTax);
  const allowedTabs = ["pnl", "cash", "time", "projects", "clients", "receivables", "forecast", "tax"] as const;
  const [tab, setTab]       = useState<(typeof allowedTabs)[number]>(
    (allowedTabs as readonly string[]).includes(initialTab ?? "")
      ? (initialTab as (typeof allowedTabs)[number])
      : "pnl"
  );
  const [pending, start]    = useTransition();

  function applyPreset(fn: () => { from: string; to: string }) {
    const r = fn();
    setFrom(r.from);
    setTo(r.to);
    runFetch(r.from, r.to);
  }

  function runFetch(f: string, t2: string) {
    start(async () => {
      const [p, c, tr, st] = await Promise.all([fetchPnL(f, t2), fetchCashFlow(f, t2), fetchTimeReport(f, t2), fetchSalesTax(f, t2)]);
      setPnl(p);
      setCash(c);
      setTime(tr);
      setSalesTax(st);
    });
  }

  const maxProjectMins = Math.max(...time.byProject.map((p) => p.totalMinutes), 1);
  const maxClientAmt   = Math.max(...time.byClient.map((c) => c.billableAmount), 1);

  // Project profitability (lifetime to date; not affected by the date range)
  const sortedProjects = [...initialProjects].sort((a, b) => b.pnl.profit - a.pnl.profit);
  const projTotals = initialProjects.reduce(
    (acc, p) => ({
      revenue:       acc.revenue + p.pnl.revenue,
      laborCost:     acc.laborCost + p.pnl.laborCost,
      expensesTotal: acc.expensesTotal + p.pnl.expensesTotal,
      profit:        acc.profit + p.pnl.profit,
    }),
    { revenue: 0, laborCost: 0, expensesTotal: 0, profit: 0 }
  );
  const projBlendedMargin = projTotals.revenue > 0 ? projTotals.profit / projTotals.revenue : null;

  // Client profitability (Week 33; lifetime to date)
  const sortedClients = [...initialClients].sort((a, b) => b.profit - a.profit);
  const clientTotals = initialClients.reduce(
    (acc, c) => ({
      revenue:       acc.revenue + c.revenue,
      laborCost:     acc.laborCost + c.laborCost,
      expensesTotal: acc.expensesTotal + c.expensesTotal,
      profit:        acc.profit + c.profit,
    }),
    { revenue: 0, laborCost: 0, expensesTotal: 0, profit: 0 }
  );
  const clientBlendedMargin = clientTotals.revenue > 0 ? clientTotals.profit / clientTotals.revenue : null;

  return (
    <div className="space-y-6">
      {/* Date range + presets */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t("reports.business.range.from")}</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t("reports.business.range.to")}</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          onClick={() => runFetch(from, to)}
          disabled={pending}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {pending ? t("common:actions.loading") : t("reports.business.range.apply")}
        </button>
        <div className="flex flex-wrap items-center gap-2 ml-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.fn)}
              disabled={pending}
              className="text-xs text-slate-600 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {t(`reports.business.presets.${p.key}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab selector */}
      <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {allowedTabs.map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t(`reports.business.tabs.${key}`)}
          </button>
        ))}
      </div>

      {/* P&L Report */}
      {tab === "pnl" && (
        <div className={`space-y-6 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label={t("reports.business.pnl.totalRevenue")} value={fmt(pnl.grossRevenue)} positive={true} />
            <StatCard label={t("reports.business.pnl.totalExpenses")} value={fmt(pnl.totalExpenses)} positive={false} />
            <StatCard
              label={t("reports.business.pnl.netIncome")}
              value={fmt(pnl.netIncome)}
              positive={pnl.netIncome >= 0}
              sub={pnl.netIncome >= 0 ? t("reports.business.pnl.profitablePeriod") : t("reports.business.pnl.netLoss")}
            />
          </div>

          {/* Revenue detail */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-slate-800">{t("reports.business.pnl.revenue")}</h2>
              </div>
              <button
                onClick={() => exportPnLCsv(pnl)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t("reports.business.exportCsv")}
              </button>
            </div>
            {pnl.revenue.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t("reports.business.pnl.noRevenue")}</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {pnl.revenue.map((r) => (
                  <div key={r.account_id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <span className="text-xs text-slate-400 mr-2 font-mono">{r.account_code}</span>
                      <span className="text-sm text-slate-700">{r.account_name}</span>
                    </div>
                    <span className="text-sm font-medium text-emerald-600 tabular-nums">{fmt(r.total)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-6 py-3 bg-emerald-50">
                  <span className="text-sm font-semibold text-slate-700">{t("reports.business.pnl.totalRevenue")}</span>
                  <span className="text-sm font-bold text-emerald-700 tabular-nums">{fmt(pnl.grossRevenue)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Expense detail */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <TrendingDown className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-semibold text-slate-800">{t("reports.business.pnl.expenses")}</h2>
            </div>
            {pnl.expenses.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t("reports.business.pnl.noExpenses")}</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {pnl.expenses.map((e) => (
                  <div key={e.account_id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <span className="text-xs text-slate-400 mr-2 font-mono">{e.account_code}</span>
                      <span className="text-sm text-slate-700">{e.account_name}</span>
                    </div>
                    <span className="text-sm font-medium text-rose-600 tabular-nums">{fmt(e.total)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-6 py-3 bg-rose-50">
                  <span className="text-sm font-semibold text-slate-700">{t("reports.business.pnl.totalExpenses")}</span>
                  <span className="text-sm font-bold text-rose-700 tabular-nums">{fmt(pnl.totalExpenses)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Net income summary row */}
          <div className={`flex items-center justify-between px-6 py-4 rounded-xl border-2 ${
            pnl.netIncome >= 0
              ? "border-emerald-200 bg-emerald-50"
              : "border-rose-200 bg-rose-50"
          }`}>
            <div className="flex items-center gap-2">
              <DollarSign className={`w-5 h-5 ${pnl.netIncome >= 0 ? "text-emerald-600" : "text-rose-600"}`} />
              <span className="text-sm font-semibold text-slate-800">{t("reports.business.pnl.netIncome")}</span>
              <span className="text-xs text-slate-500">
                {t("reports.business.dateRange", { from: fmtDate(pnl.from), to: fmtDate(pnl.to) })}
              </span>
            </div>
            <span className={`text-xl font-bold tabular-nums ${pnl.netIncome >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {fmt(pnl.netIncome)}
            </span>
          </div>
        </div>
      )}

      {/* Cash Flow Report */}
      {tab === "cash" && (
        <div className={`space-y-6 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label={t("reports.business.cash.moneyIn")}
              value={fmt(cash.totalIn)}
              positive={true}
              sub={t("reports.business.cash.moneyInSub")}
            />
            <StatCard
              label={t("reports.business.cash.moneyOut")}
              value={fmt(cash.totalOut)}
              positive={false}
              sub={t("reports.business.cash.moneyOutSub")}
            />
            <StatCard
              label={t("reports.business.cash.net")}
              value={fmt(cash.net)}
              positive={cash.net >= 0}
              sub={cash.net >= 0 ? t("reports.business.cash.positiveFlow") : t("reports.business.cash.negativeFlow")}
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">{t("reports.business.cash.byCategory")}</h2>
            </div>
            {cash.byCategory.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t("reports.business.cash.noTransactions")}</p>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_140px_140px] gap-4 px-6 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <span>{t("reports.business.cash.columns.category")}</span>
                  <span className="text-right">{t("reports.business.cash.columns.in")}</span>
                  <span className="text-right">{t("reports.business.cash.columns.out")}</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {cash.byCategory.map((c) => (
                    <div key={c.category} className="grid grid-cols-[1fr_140px_140px] gap-4 px-6 py-3 items-center">
                      <span className="text-sm text-slate-700 truncate">{c.category}</span>
                      <span className="text-sm text-emerald-600 font-medium text-right tabular-nums">
                        {c.totalIn > 0 ? fmt(c.totalIn) : "—"}
                      </span>
                      <span className="text-sm text-rose-600 font-medium text-right tabular-nums">
                        {c.totalOut > 0 ? fmt(c.totalOut) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Time Tracking Report */}
      {tab === "time" && (
        <div className={`space-y-6 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label={t("reports.business.time.totalHours")} value={fmtHours(time.totalMinutes)} />
            <StatCard label={t("reports.business.time.billableHours")} value={fmtHours(time.billableMinutes)} positive={true} />
            <StatCard label={t("reports.business.time.billableAmount")} value={fmt(time.billableAmount)} positive={true} />
            <StatCard
              label={t("reports.business.time.uninvoiced")}
              value={fmt(time.uninvoicedAmount)}
              positive={time.uninvoicedAmount === 0}
              sub={time.uninvoicedAmount > 0 ? t("reports.business.time.readyToInvoice") : t("reports.business.time.fullyInvoiced")}
            />
          </div>

          {/* Hours by project */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-800">{t("reports.business.time.hoursByProject")}</h2>
              </div>
              <button
                onClick={() => exportTimeCsv(time)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t("reports.business.exportCsv")}
              </button>
            </div>
            {time.byProject.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t("reports.business.time.noEntries")}</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {time.byProject.map((p, i) => (
                  <div key={p.project_id ?? `proj-${i}`} className="flex items-center gap-4 px-6 py-3">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${COLOR_DOTS[p.color] ?? "bg-slate-400"}`} />
                    <span className="text-sm text-slate-700 w-48 truncate flex-shrink-0">{p.project_name}</span>
                    <MiniBar value={p.totalMinutes} max={maxProjectMins} color={COLOR_DOTS[p.color] ?? "bg-indigo-500"} />
                    <span className="text-xs text-slate-500 w-16 text-right tabular-nums flex-shrink-0">
                      {fmtHours(p.totalMinutes)}
                    </span>
                    {p.billableAmount > 0 && (
                      <span className="text-xs font-medium text-emerald-600 w-24 text-right tabular-nums flex-shrink-0">
                        {fmt(p.billableAmount)}
                      </span>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between px-6 py-3 bg-slate-50">
                  <span className="text-sm font-semibold text-slate-700">{t("reports.business.time.total")}</span>
                  <div className="flex items-center gap-6">
                    <span className="text-sm font-medium text-slate-700 tabular-nums">
                      {fmtHours(time.totalMinutes)}
                    </span>
                    {time.billableAmount > 0 && (
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">
                        {fmt(time.billableAmount)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Billable revenue by client */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
              <Users className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-800">{t("reports.business.time.byClient")}</h2>
            </div>
            {time.byClient.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t("reports.business.time.noEntries")}</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {time.byClient.map((c, i) => (
                  <div key={c.client_id ?? `client-${i}`} className="flex items-center gap-4 px-6 py-3">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-semibold flex-shrink-0">
                      {c.client_name[0]?.toUpperCase() ?? "?"}
                    </div>
                    <span className="text-sm text-slate-700 w-44 truncate flex-shrink-0">{c.client_name}</span>
                    <MiniBar value={c.billableAmount} max={maxClientAmt} color="bg-indigo-500" />
                    <span className="text-xs text-slate-500 w-16 text-right tabular-nums flex-shrink-0">
                      {fmtHours(c.totalMinutes)}
                    </span>
                    <span className="text-xs font-medium text-emerald-600 w-24 text-right tabular-nums flex-shrink-0">
                      {c.billableAmount > 0 ? fmt(c.billableAmount) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Time summary footer */}
          <div className="flex items-center justify-between px-6 py-4 rounded-xl border-2 border-indigo-100 bg-indigo-50">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              <span className="text-sm font-semibold text-slate-800">{t("reports.business.time.periodSummary")}</span>
              <span className="text-xs text-slate-500">
                {t("reports.business.dateRange", { from: fmtDate(time.from), to: fmtDate(time.to) })}
              </span>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-slate-500">{t("reports.business.time.billableHoursLabel")}</p>
                <p className="text-base font-bold text-indigo-700 tabular-nums">{fmtHours(time.billableMinutes)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">{t("reports.business.time.earned")}</p>
                <p className="text-base font-bold text-emerald-700 tabular-nums">{fmt(time.billableAmount)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project Profitability Report (Week 29) */}
      {tab === "projects" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label={t("reports.business.projects.revenue")} value={fmt(projTotals.revenue)} positive={true} />
            <StatCard label={t("reports.business.projects.laborCost")} value={fmt(projTotals.laborCost)} positive={false} />
            <StatCard label={t("reports.business.projects.expenses")} value={fmt(projTotals.expensesTotal)} positive={false} />
            <StatCard
              label={t("reports.business.projects.profit")}
              value={fmt(projTotals.profit)}
              positive={projTotals.profit >= 0}
              sub={
                projBlendedMargin !== null
                  ? t("reports.business.blendedMargin", { percent: (projBlendedMargin * 100).toFixed(0) })
                  : undefined
              }
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-800">{t("reports.business.projects.profitByProject")}</h2>
                <span className="text-xs text-slate-400">{t("reports.business.lifetimeToDate")}</span>
              </div>
              <button
                onClick={() => exportProjectsCsv(sortedProjects)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t("reports.business.exportCsv")}
              </button>
            </div>
            {sortedProjects.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t("reports.business.projects.empty")}</p>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_104px_104px_104px_104px_64px] gap-3 px-6 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <span>{t("reports.business.projects.columns.project")}</span>
                  <span className="text-right">{t("reports.business.projects.columns.revenue")}</span>
                  <span className="text-right">{t("reports.business.projects.columns.labor")}</span>
                  <span className="text-right">{t("reports.business.projects.columns.expenses")}</span>
                  <span className="text-right">{t("reports.business.projects.columns.profit")}</span>
                  <span className="text-right">{t("reports.business.projects.columns.margin")}</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {sortedProjects.map((p) => (
                    <div key={p.id} className="grid grid-cols-[1fr_104px_104px_104px_104px_64px] gap-3 px-6 py-3 items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${COLOR_DOTS[p.color] ?? "bg-slate-400"}`} />
                        <span className="text-sm text-slate-700 truncate">{p.name}</span>
                      </div>
                      <span className="text-sm text-slate-600 text-right tabular-nums">{p.pnl.revenue > 0 ? fmt(p.pnl.revenue) : "—"}</span>
                      <span className="text-sm text-slate-500 text-right tabular-nums">{p.pnl.laborCost > 0 ? fmt(p.pnl.laborCost) : "—"}</span>
                      <span className="text-sm text-slate-500 text-right tabular-nums">{p.pnl.expensesTotal > 0 ? fmt(p.pnl.expensesTotal) : "—"}</span>
                      <span className={`text-sm font-medium text-right tabular-nums ${p.pnl.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt(p.pnl.profit)}</span>
                      <span className={`text-xs text-right tabular-nums ${p.pnl.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {p.pnl.margin !== null ? `${(p.pnl.margin * 100).toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_104px_104px_104px_104px_64px] gap-3 px-6 py-3 bg-slate-50 border-t border-slate-100 items-center">
                  <span className="text-sm font-semibold text-slate-700">{t("reports.business.projects.total")}</span>
                  <span className="text-sm font-semibold text-slate-700 text-right tabular-nums">{fmt(projTotals.revenue)}</span>
                  <span className="text-sm font-semibold text-slate-600 text-right tabular-nums">{fmt(projTotals.laborCost)}</span>
                  <span className="text-sm font-semibold text-slate-600 text-right tabular-nums">{fmt(projTotals.expensesTotal)}</span>
                  <span className={`text-sm font-bold text-right tabular-nums ${projTotals.profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmt(projTotals.profit)}</span>
                  <span className={`text-xs font-bold text-right tabular-nums ${projTotals.profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {projBlendedMargin !== null ? `${(projBlendedMargin * 100).toFixed(0)}%` : "—"}
                  </span>
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-slate-400">{t("reports.business.projects.note")}</p>
        </div>
      )}

      {/* Client Profitability Report (Week 33) */}
      {tab === "clients" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label={t("reports.business.clients.revenue")} value={fmt(clientTotals.revenue)} positive={true} />
            <StatCard label={t("reports.business.clients.laborCost")} value={fmt(clientTotals.laborCost)} positive={false} />
            <StatCard label={t("reports.business.clients.expenses")} value={fmt(clientTotals.expensesTotal)} positive={false} />
            <StatCard
              label={t("reports.business.clients.profit")}
              value={fmt(clientTotals.profit)}
              positive={clientTotals.profit >= 0}
              sub={
                clientBlendedMargin !== null
                  ? t("reports.business.blendedMargin", { percent: (clientBlendedMargin * 100).toFixed(0) })
                  : undefined
              }
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-800">{t("reports.business.clients.profitByClient")}</h2>
                <span className="text-xs text-slate-400">{t("reports.business.lifetimeToDate")}</span>
              </div>
              <button
                onClick={() => exportClientsCsv(sortedClients)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t("reports.business.exportCsv")}
              </button>
            </div>
            {sortedClients.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t("reports.business.clients.empty")}</p>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_104px_104px_104px_104px_64px] gap-3 px-6 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <span>{t("reports.business.clients.columns.client")}</span>
                  <span className="text-right">{t("reports.business.clients.columns.revenue")}</span>
                  <span className="text-right">{t("reports.business.clients.columns.labor")}</span>
                  <span className="text-right">{t("reports.business.clients.columns.expenses")}</span>
                  <span className="text-right">{t("reports.business.clients.columns.profit")}</span>
                  <span className="text-right">{t("reports.business.clients.columns.margin")}</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {sortedClients.map((c) => (
                    <div key={c.clientId} className="grid grid-cols-[1fr_104px_104px_104px_104px_64px] gap-3 px-6 py-3 items-center">
                      <span className="text-sm text-slate-700 truncate">{c.name}</span>
                      <span className="text-sm text-slate-600 text-right tabular-nums">{c.revenue > 0 ? fmt(c.revenue) : "—"}</span>
                      <span className="text-sm text-slate-500 text-right tabular-nums">{c.laborCost > 0 ? fmt(c.laborCost) : "—"}</span>
                      <span className="text-sm text-slate-500 text-right tabular-nums">{c.expensesTotal > 0 ? fmt(c.expensesTotal) : "—"}</span>
                      <span className={`text-sm font-medium text-right tabular-nums ${c.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmt(c.profit)}</span>
                      <span className={`text-xs text-right tabular-nums ${c.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {c.margin !== null ? `${(c.margin * 100).toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_104px_104px_104px_104px_64px] gap-3 px-6 py-3 bg-slate-50 border-t border-slate-100 items-center">
                  <span className="text-sm font-semibold text-slate-700">{t("reports.business.clients.total")}</span>
                  <span className="text-sm font-semibold text-slate-700 text-right tabular-nums">{fmt(clientTotals.revenue)}</span>
                  <span className="text-sm font-semibold text-slate-600 text-right tabular-nums">{fmt(clientTotals.laborCost)}</span>
                  <span className="text-sm font-semibold text-slate-600 text-right tabular-nums">{fmt(clientTotals.expensesTotal)}</span>
                  <span className={`text-sm font-bold text-right tabular-nums ${clientTotals.profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmt(clientTotals.profit)}</span>
                  <span className={`text-xs font-bold text-right tabular-nums ${clientTotals.profit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {clientBlendedMargin !== null ? `${(clientBlendedMargin * 100).toFixed(0)}%` : "—"}
                  </span>
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-slate-400">{t("reports.business.clients.note")}</p>
        </div>
      )}

      {/* Accounts Receivable Aging (Week 37) */}
      {tab === "receivables" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t("reports.business.receivables.outstanding")}
              value={fmt(initialReceivables.totalOutstanding)}
            />
            <StatCard
              label={t("reports.business.receivables.current")}
              value={fmt(initialReceivables.totals.current)}
              positive={true}
              sub={t("reports.business.receivables.notYetDue")}
            />
            <StatCard
              label={t("reports.business.receivables.overdue")}
              value={fmt(initialReceivables.overdueAmount)}
              positive={initialReceivables.overdueAmount === 0}
              sub={t("reports.business.receivables.pastDueDate")}
            />
            <StatCard
              label={t("reports.business.receivables.d90Plus")}
              value={fmt(initialReceivables.totals.d90_plus)}
              positive={initialReceivables.totals.d90_plus === 0}
              sub={t("reports.business.receivables.atRisk")}
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-800">{t("reports.business.receivables.byClient")}</h2>
                <span className="text-xs text-slate-400">
                  {t("reports.business.asOf", { date: fmtDate(initialReceivables.asOf) })}
                </span>
              </div>
              <button
                onClick={() => exportAgingCsv(initialReceivables)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t("reports.business.exportCsv")}
              </button>
            </div>
            {initialReceivables.rows.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t("reports.business.receivables.empty")}</p>
            ) : (
              <>
                <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1fr_1.1fr] gap-3 px-6 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <span>{t("reports.business.receivables.columns.client")}</span>
                  <span className="text-right">{t("reports.business.receivables.columns.current")}</span>
                  <span className="text-right">{t("reports.business.receivables.columns.d1_30")}</span>
                  <span className="text-right">{t("reports.business.receivables.columns.d31_60")}</span>
                  <span className="text-right">{t("reports.business.receivables.columns.d61_90")}</span>
                  <span className="text-right">{t("reports.business.receivables.columns.d90_plus")}</span>
                  <span className="text-right">{t("reports.business.receivables.columns.total")}</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {initialReceivables.rows.map((r) => (
                    <div
                      key={r.client_id ?? "none"}
                      className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1fr_1.1fr] gap-3 px-6 py-3 items-center"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700 truncate">{r.client_name}</p>
                        <p className="text-xs text-slate-400">
                          {t("reports.business.receivables.invoiceCount", { count: r.invoiceCount })}
                        </p>
                      </div>
                      <AgingCell value={r.current} fmt={fmt} />
                      <AgingCell value={r.d1_30} fmt={fmt} tone="warn" />
                      <AgingCell value={r.d31_60} fmt={fmt} tone="warn" />
                      <AgingCell value={r.d61_90} fmt={fmt} tone="warn" />
                      <AgingCell value={r.d90_plus} fmt={fmt} tone="danger" />
                      <span className="text-sm font-medium text-slate-700 text-right tabular-nums">{fmt(r.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1fr_1.1fr] gap-3 px-6 py-3 bg-slate-50 border-t border-slate-100 items-center">
                  <span className="text-sm font-semibold text-slate-700">{t("reports.business.receivables.total")}</span>
                  <span className="text-sm font-semibold text-slate-600 text-right tabular-nums">
                    {initialReceivables.totals.current > 0 ? fmt(initialReceivables.totals.current) : "—"}
                  </span>
                  <span className="text-sm font-semibold text-amber-600 text-right tabular-nums">
                    {initialReceivables.totals.d1_30 > 0 ? fmt(initialReceivables.totals.d1_30) : "—"}
                  </span>
                  <span className="text-sm font-semibold text-amber-600 text-right tabular-nums">
                    {initialReceivables.totals.d31_60 > 0 ? fmt(initialReceivables.totals.d31_60) : "—"}
                  </span>
                  <span className="text-sm font-semibold text-amber-600 text-right tabular-nums">
                    {initialReceivables.totals.d61_90 > 0 ? fmt(initialReceivables.totals.d61_90) : "—"}
                  </span>
                  <span className="text-sm font-semibold text-rose-600 text-right tabular-nums">
                    {initialReceivables.totals.d90_plus > 0 ? fmt(initialReceivables.totals.d90_plus) : "—"}
                  </span>
                  <span className="text-sm font-bold text-slate-800 text-right tabular-nums">
                    {fmt(initialReceivables.totals.total)}
                  </span>
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-slate-400">{t("reports.business.receivables.note")}</p>
        </div>
      )}

      {/* Cash-flow Forecast (Week 39) */}
      {tab === "forecast" && (
        <div className="space-y-6">
          {initialForecast.lowestBalance < 0 && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-rose-200 bg-rose-50">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-rose-700">
                {t("reports.business.forecast.dipWarning", { amount: fmt(initialForecast.lowestBalance) })}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t("reports.business.forecast.cashOnHand")}
              value={fmt(initialForecast.startingBalance)}
              sub={
                initialForecast.hasBank
                  ? t("reports.business.forecast.linkedAccounts")
                  : t("reports.business.forecast.linkABank")
              }
            />
            <StatCard
              label={t("reports.business.forecast.expectedIn")}
              value={fmt(initialForecast.totalInflow)}
              positive={true}
              sub={t("reports.business.forecast.openInvoices")}
            />
            <StatCard
              label={t("reports.business.forecast.expectedOut")}
              value={fmt(initialForecast.totalOutflow)}
              positive={false}
              sub={t("reports.business.forecast.openBills")}
            />
            <StatCard
              label={t("reports.business.forecast.projected90")}
              value={fmt(initialForecast.endingBalance)}
              positive={initialForecast.endingBalance >= 0}
              sub={t("reports.business.forecast.afterOpenItems")}
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-800">{t("reports.business.forecast.title")}</h2>
                <span className="text-xs text-slate-400">
                  {t("reports.business.asOf", { date: fmtDate(initialForecast.asOf) })}
                </span>
              </div>
              <button
                onClick={() => exportForecastCsv(initialForecast)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t("reports.business.exportCsv")}
              </button>
            </div>

            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr] gap-3 px-6 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
              <span>{t("reports.business.forecast.columns.period")}</span>
              <span className="text-right">{t("reports.business.forecast.columns.expectedIn")}</span>
              <span className="text-right">{t("reports.business.forecast.columns.expectedOut")}</span>
              <span className="text-right">{t("reports.business.forecast.columns.net")}</span>
              <span className="text-right">{t("reports.business.forecast.columns.projectedBalance")}</span>
            </div>

            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr] gap-3 px-6 py-3 items-center border-b border-slate-50">
              <span className="text-sm text-slate-500">{t("reports.business.forecast.startingBalance")}</span>
              <span className="text-sm text-right tabular-nums text-slate-300">—</span>
              <span className="text-sm text-right tabular-nums text-slate-300">—</span>
              <span className="text-sm text-right tabular-nums text-slate-300">—</span>
              <span className="text-sm font-medium text-slate-700 text-right tabular-nums">{fmt(initialForecast.startingBalance)}</span>
            </div>

            <div className="divide-y divide-slate-50">
              {initialForecast.periods.map((p) => (
                <div key={p.key} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr] gap-3 px-6 py-3 items-center">
                  <span className="text-sm text-slate-700">{t(`reports.business.forecast.buckets.${p.key}`)}</span>
                  <span className={`text-sm text-right tabular-nums ${p.inflow > 0 ? "text-emerald-600" : "text-slate-300"}`}>
                    {p.inflow > 0 ? fmt(p.inflow) : "—"}
                  </span>
                  <span className={`text-sm text-right tabular-nums ${p.outflow > 0 ? "text-rose-600" : "text-slate-300"}`}>
                    {p.outflow > 0 ? fmt(p.outflow) : "—"}
                  </span>
                  <span className={`text-sm font-medium text-right tabular-nums ${p.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmt(p.net)}
                  </span>
                  <span className={`text-sm font-semibold text-right tabular-nums ${p.projectedBalance < 0 ? "text-rose-600" : "text-slate-700"}`}>
                    {fmt(p.projectedBalance)}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr] gap-3 px-6 py-3 bg-slate-50 border-t border-slate-100 items-center">
              <span className="text-sm font-semibold text-slate-700">{t("reports.business.forecast.total")}</span>
              <span className="text-sm font-semibold text-emerald-600 text-right tabular-nums">{fmt(initialForecast.totalInflow)}</span>
              <span className="text-sm font-semibold text-rose-600 text-right tabular-nums">{fmt(initialForecast.totalOutflow)}</span>
              <span className={`text-sm font-bold text-right tabular-nums ${initialForecast.totalInflow - initialForecast.totalOutflow >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {fmt(initialForecast.totalInflow - initialForecast.totalOutflow)}
              </span>
              <span className={`text-sm font-bold text-right tabular-nums ${initialForecast.endingBalance < 0 ? "text-rose-700" : "text-slate-800"}`}>
                {fmt(initialForecast.endingBalance)}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-400">{t("reports.business.forecast.note")}</p>
        </div>
      )}

      {/* Sales Tax Liability (Week 42) */}
      {tab === "tax" && (
        <div className={`space-y-6 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t("reports.business.tax.collected")}
              value={fmt(salesTax.taxCollected)}
              sub={t("reports.business.tax.toRemit")}
            />
            <StatCard label={t("reports.business.tax.taxableSales")} value={fmt(salesTax.taxableSales)} />
            <StatCard label={t("reports.business.tax.nonTaxableSales")} value={fmt(salesTax.nonTaxableSales)} />
            <StatCard
              label={t("reports.business.tax.totalSales")}
              value={fmt(salesTax.totalSales)}
              sub={t("reports.business.tax.preTax")}
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold text-slate-800">{t("reports.business.tax.byRate")}</h2>
              </div>
              <button
                onClick={() => exportSalesTaxCsv(salesTax)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {t("reports.business.exportCsv")}
              </button>
            </div>
            {salesTax.byRate.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t("reports.business.tax.empty")}</p>
            ) : (
              <>
                <div className="grid grid-cols-[1fr_1fr_1fr_100px] gap-3 px-6 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                  <span>{t("reports.business.tax.columns.rate")}</span>
                  <span className="text-right">{t("reports.business.tax.columns.taxableSales")}</span>
                  <span className="text-right">{t("reports.business.tax.columns.taxCollected")}</span>
                  <span className="text-right">{t("reports.business.tax.columns.invoices")}</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {salesTax.byRate.map((r) => (
                    <div key={r.rate} className="grid grid-cols-[1fr_1fr_1fr_100px] gap-3 px-6 py-3 items-center">
                      <span className="text-sm text-slate-700 tabular-nums">{(r.rate * 100).toFixed(2)}%</span>
                      <span className="text-sm text-slate-600 text-right tabular-nums">{fmt(r.taxableSales)}</span>
                      <span className="text-sm font-medium text-slate-800 text-right tabular-nums">{fmt(r.taxCollected)}</span>
                      <span className="text-sm text-slate-500 text-right tabular-nums">{r.invoiceCount}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_1fr_1fr_100px] gap-3 px-6 py-3 bg-slate-50 border-t border-slate-100 items-center">
                  <span className="text-sm font-semibold text-slate-700">{t("reports.business.tax.total")}</span>
                  <span className="text-sm font-semibold text-slate-600 text-right tabular-nums">{fmt(salesTax.taxableSales)}</span>
                  <span className="text-sm font-bold text-slate-800 text-right tabular-nums">{fmt(salesTax.taxCollected)}</span>
                  <span className="text-sm font-semibold text-slate-500 text-right tabular-nums">{salesTax.taxedInvoiceCount}</span>
                </div>
              </>
            )}
          </div>

          <p className="text-xs text-slate-400">
            {t("reports.business.tax.note", { from: fmtDate(salesTax.from), to: fmtDate(salesTax.to) })}
          </p>
        </div>
      )}
    </div>
  );
}
