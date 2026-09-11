"use server";

import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { aggregatePnL, agingBucket, daysPastDue, type PnLJournalLine } from "@helm/dna-intelligence";
import { getMemberOrgId } from "@/lib/auth/org-context";
import { orgToday } from "@/lib/org-timezone";

export interface PnLRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: "revenue" | "expense";
  total: number;         // positive = money in (revenue), positive = money spent (expense)
}

export interface PnLReport {
  from: string;          // YYYY-MM-DD
  to: string;            // YYYY-MM-DD
  revenue: PnLRow[];
  expenses: PnLRow[];
  grossRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

// ─── Profit & Loss ────────────────────────────────────────────────────────────

export async function getPnLReport(from: string, to: string): Promise<PnLReport> {
  const orgId = (await getMemberOrgId()) ?? "";
  const t = await getServerT("books");
  if (!orgId) throw new Error(t("reports.business.errors.notAuthenticated"));

  const supabase = await createClient();

  // Pull all journal lines within the date range, with CoA info
  const { data, error } = await supabase
    .from("journal_lines")
    .select(`
      debit,
      credit,
      account_id,
      chart_of_accounts!inner (
        code,
        name,
        type,
        normal_balance,
        organization_id
      ),
      journal_entries!inner (
        date,
        organization_id
      )
    `)
    .eq("chart_of_accounts.organization_id", orgId)
    .eq("journal_entries.organization_id", orgId)
    .gte("journal_entries.date", from)
    .lte("journal_entries.date", to);

  if (error) throw new Error(error.message);

  // Normalize the joined rows, then delegate the cash-basis P&L math to the
  // Intelligence DNA so every surface applies the same sign convention.
  const lines: PnLJournalLine[] = [];
  for (const line of data ?? []) {
    const coaRaw = line.chart_of_accounts as unknown as
      | { code: string; name: string; type: string }
      | { code: string; name: string; type: string }[];
    const coa = Array.isArray(coaRaw) ? coaRaw[0] : coaRaw;
    if (!coa) continue;
    if (coa.type !== "revenue" && coa.type !== "expense") continue;
    lines.push({
      account_id: line.account_id,
      account_code: coa.code,
      account_name: coa.name,
      account_type: coa.type,
      debit: Number(line.debit),
      credit: Number(line.credit),
    });
  }

  return aggregatePnL(lines, from, to);
}

// ─── Cash flow summary (bank transactions) ────────────────────────────────────

export interface CashFlowSummary {
  from: string;
  to: string;
  totalIn: number;
  totalOut: number;
  net: number;
  byCategory: { category: string; totalIn: number; totalOut: number }[];
}

export async function getCashFlowSummary(from: string, to: string): Promise<CashFlowSummary> {
  const orgId = (await getMemberOrgId()) ?? "";
  const t = await getServerT("books");
  if (!orgId) throw new Error(t("reports.business.errors.notAuthenticated"));

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bank_transactions")
    .select("amount, personal_finance_category")
    .eq("organization_id", orgId)
    .gte("date", from)
    .lte("date", to);

  if (error) throw new Error(error.message);

  // Plaid sign convention: negative = money in, positive = money out
  let totalIn = 0;
  let totalOut = 0;
  const catMap = new Map<string, { totalIn: number; totalOut: number }>();

  for (const tx of data ?? []) {
    const amt = Number(tx.amount);
    const cat = tx.personal_finance_category ?? t("reports.business.fallbacks.uncategorized");
    const cur = catMap.get(cat) ?? { totalIn: 0, totalOut: 0 };

    if (amt < 0) {
      totalIn += Math.abs(amt);
      cur.totalIn += Math.abs(amt);
    } else {
      totalOut += amt;
      cur.totalOut += amt;
    }
    catMap.set(cat, cur);
  }

  const byCategory = Array.from(catMap.entries())
    .map(([category, vals]) => ({ category, ...vals }))
    .sort((a, b) => (b.totalIn + b.totalOut) - (a.totalIn + a.totalOut));

  return { from, to, totalIn, totalOut, net: totalIn - totalOut, byCategory };
}

// ─── Time report ──────────────────────────────────────────────────────────────

export interface TimeByProject {
  project_id: string | null;
  project_name: string;
  color: string;
  totalMinutes: number;
  billableMinutes: number;
  billableAmount: number;
}

export interface TimeByClient {
  client_id: string | null;
  client_name: string;
  totalMinutes: number;
  billableMinutes: number;
  billableAmount: number;
}

export interface TimeReport {
  from: string;
  to: string;
  totalMinutes: number;
  billableMinutes: number;
  billableAmount: number;
  uninvoicedAmount: number;
  byProject: TimeByProject[];
  byClient: TimeByClient[];
}

export async function getTimeReport(from: string, to: string): Promise<TimeReport> {
  const orgId = (await getMemberOrgId()) ?? "";
  const t = await getServerT("books");
  if (!orgId) throw new Error(t("reports.business.errors.notAuthenticated"));

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("time_entries")
    .select(
      "duration_minutes, billable, hourly_rate, invoiced, " +
      "project_id, project, client_id, " +
      "projects(name, color), " +
      "clients(first_name, last_name, company)"
    )
    .eq("organization_id", orgId)
    .not("ended_at", "is", null)
    .gte("started_at", from)
    .lte("started_at", to + "T23:59:59.999Z");

  if (error) throw new Error(error.message);

  type TimeRow = {
    duration_minutes: number | null;
    billable: boolean;
    hourly_rate: number | null;
    invoiced: boolean;
    project_id: string | null;
    project: string | null;
    client_id: string | null;
    projects: unknown;
    clients: unknown;
  };
  const entries = (data ?? []) as unknown as TimeRow[];
  let totalMinutes = 0, billableMinutes = 0, billableAmount = 0, uninvoicedAmount = 0;

  type ProjAgg = { project_id: string | null; project_name: string; color: string; totalMinutes: number; billableMinutes: number; billableAmount: number };
  type ClientAgg = { client_id: string | null; client_name: string; totalMinutes: number; billableMinutes: number; billableAmount: number };

  const projectMap = new Map<string, ProjAgg>();
  const clientMap  = new Map<string, ClientAgg>();

  for (const e of entries) {
    const mins = e.duration_minutes ?? 0;
    totalMinutes += mins;

    const amt = e.billable ? (mins / 60) * Number(e.hourly_rate ?? 0) : 0;
    if (e.billable) {
      billableMinutes += mins;
      billableAmount  += amt;
      if (!e.invoiced) uninvoicedAmount += amt;
    }

    // ── by project ──
    const projRaw = Array.isArray(e.projects) ? (e.projects as unknown[])[0] : e.projects;
    const proj = projRaw as { name?: string; color?: string } | null;
    const projId   = e.project_id as string | null;
    const projKey  = projId ?? ("legacy:" + (e.project ?? "none"));
    const projName = proj?.name ?? (e.project as string | null) ?? t("reports.business.fallbacks.noProject");
    const projColor = proj?.color ?? "slate";

    const pa = projectMap.get(projKey) ?? { project_id: projId, project_name: projName, color: projColor, totalMinutes: 0, billableMinutes: 0, billableAmount: 0 };
    pa.totalMinutes    += mins;
    if (e.billable) { pa.billableMinutes += mins; pa.billableAmount += amt; }
    projectMap.set(projKey, pa);

    // ── by client ──
    const clientRaw = Array.isArray(e.clients) ? (e.clients as unknown[])[0] : e.clients;
    const client = clientRaw as { first_name?: string | null; last_name?: string | null; company?: string | null } | null;
    const clientId  = e.client_id as string | null;
    const clientKey = clientId ?? "none";
    const clientName = client
      ? ([client.first_name, client.last_name].filter(Boolean).join(" ") || client.company || t("reports.business.fallbacks.unknownClient"))
      : t("reports.business.fallbacks.noClient");

    const ca = clientMap.get(clientKey) ?? { client_id: clientId, client_name: clientName, totalMinutes: 0, billableMinutes: 0, billableAmount: 0 };
    ca.totalMinutes    += mins;
    if (e.billable) { ca.billableMinutes += mins; ca.billableAmount += amt; }
    clientMap.set(clientKey, ca);
  }

  const byProject = Array.from(projectMap.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  const byClient  = Array.from(clientMap.values()).sort((a, b) => b.billableAmount - a.billableAmount);

  return { from, to, totalMinutes, billableMinutes, billableAmount, uninvoicedAmount, byProject, byClient };
}

// ─── Accounts Receivable aging (Week 37) ──────────────────────────────────────
// "Who owes me money, and how overdue is it?" Buckets each unpaid invoice
// (status sent/overdue) by days past its due date, grouped by client. As-of
// today — independent of the report date range.

export interface AgingRow {
  client_id: string | null;
  client_name: string;
  current: number;   // not yet due
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
  invoiceCount: number;
  oldestDueDate: string | null;
}

export interface AgingTotals {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

export interface ReceivablesAging {
  asOf: string;             // YYYY-MM-DD (today)
  rows: AgingRow[];
  totals: AgingTotals;
  totalOutstanding: number;
  overdueAmount: number;    // sum of all past-due buckets (excludes current)
}

export async function getReceivablesAging(): Promise<ReceivablesAging> {
  const t = await getServerT("books");
  const orgId = (await getMemberOrgId()) ?? "";
  const today = await orgToday(orgId);
  const emptyTotals: AgingTotals = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };

  if (!orgId) {
    return { asOf: today, rows: [], totals: emptyTotals, totalOutstanding: 0, overdueAmount: 0 };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("id, client_id, total, due_date, status, clients(first_name, last_name, company)")
    .eq("organization_id", orgId)
    .in("status", ["sent", "overdue"]);

  if (error) throw new Error(error.message);

  const map = new Map<string, AgingRow>();
  const totals: AgingTotals = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };

  for (const inv of data ?? []) {
    const amt = Number(inv.total) || 0;
    if (amt === 0) continue;

    const clientRaw = Array.isArray(inv.clients) ? (inv.clients as unknown[])[0] : inv.clients;
    const client = clientRaw as { first_name?: string | null; last_name?: string | null; company?: string | null } | null;
    const clientId = (inv.client_id as string | null) ?? null;
    const clientKey = clientId ?? "none";
    const clientName = client
      ? ([client.first_name, client.last_name].filter(Boolean).join(" ") || client.company || t("reports.business.fallbacks.unknownClient"))
      : t("reports.business.fallbacks.noClient");

    const due = inv.due_date as string;
    const bucket = agingBucket(daysPastDue(due, today));

    const row = map.get(clientKey) ?? {
      client_id: clientId,
      client_name: clientName,
      current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0,
      total: 0, invoiceCount: 0, oldestDueDate: null,
    };
    row[bucket] += amt;
    row.total += amt;
    row.invoiceCount += 1;
    if (!row.oldestDueDate || due < row.oldestDueDate) row.oldestDueDate = due;
    map.set(clientKey, row);

    totals[bucket] += amt;
    totals.total += amt;
  }

  const rows = Array.from(map.values()).sort((a, b) => b.total - a.total);
  const overdueAmount = totals.d1_30 + totals.d31_60 + totals.d61_90 + totals.d90_plus;

  return { asOf: today, rows, totals, totalOutstanding: totals.total, overdueAmount };
}

// ─── Cash-flow forecast (Week 39) ─────────────────────────────────────────────
// Projects cash position forward by combining open invoices (money in) and open
// bills (money out) against the current bank balance, bucketed by due date.
// As-of today — independent of the report date range.

type ForecastBucket = "now" | "d1_30" | "d31_60" | "d61_90" | "later";

const FORECAST_LABELS: Record<ForecastBucket, string> = {
  now: "Overdue / now",
  d1_30: "1–30 days",
  d31_60: "31–60 days",
  d61_90: "61–90 days",
  later: "90+ days",
};

const FORECAST_ORDER: ForecastBucket[] = ["now", "d1_30", "d31_60", "d61_90", "later"];

export interface ForecastPeriod {
  key: ForecastBucket;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  projectedBalance: number;
}

export interface CashFlowForecast {
  asOf: string;
  hasBank: boolean;
  startingBalance: number;
  periods: ForecastPeriod[];
  totalInflow: number;
  totalOutflow: number;
  endingBalance: number;
  lowestBalance: number;
}

function forecastBucket(daysUntilDue: number): ForecastBucket {
  if (daysUntilDue <= 0) return "now";
  if (daysUntilDue <= 30) return "d1_30";
  if (daysUntilDue <= 60) return "d31_60";
  if (daysUntilDue <= 90) return "d61_90";
  return "later";
}

export async function getCashFlowForecast(): Promise<CashFlowForecast> {
  const orgId = (await getMemberOrgId()) ?? "";
  const today = await orgToday(orgId);

  const emptyPeriods: ForecastPeriod[] = FORECAST_ORDER.map((k) => ({
    key: k, label: FORECAST_LABELS[k], inflow: 0, outflow: 0, net: 0, projectedBalance: 0,
  }));

  if (!orgId) {
    return { asOf: today, hasBank: false, startingBalance: 0, periods: emptyPeriods, totalInflow: 0, totalOutflow: 0, endingBalance: 0, lowestBalance: 0 };
  }

  const supabase = await createClient();

  const [banksRes, invoicesRes, billsRes] = await Promise.all([
    supabase.from("bank_accounts").select("current_balance, type, is_active").eq("organization_id", orgId).eq("is_active", true),
    supabase.from("invoices").select("total, due_date, status").eq("organization_id", orgId).in("status", ["sent", "overdue"]),
    supabase.from("bills").select("amount, due_date, status").eq("organization_id", orgId).eq("status", "open"),
  ]);

  const banks = banksRes.data ?? [];
  const hasBank = banks.length > 0;
  const startingBalance = banks.reduce((sum, a) => {
    const bal = Number(a.current_balance ?? 0);
    return a.type === "credit" ? sum - bal : sum + bal;
  }, 0);

  const todayMs = new Date(today + "T00:00:00").getTime();
  const DAY = 86_400_000;

  const inflow: Record<ForecastBucket, number> = { now: 0, d1_30: 0, d31_60: 0, d61_90: 0, later: 0 };
  const outflow: Record<ForecastBucket, number> = { now: 0, d1_30: 0, d31_60: 0, d61_90: 0, later: 0 };

  for (const inv of invoicesRes.data ?? []) {
    const amt = Number(inv.total) || 0;
    if (amt === 0) continue;
    const days = Math.floor((new Date((inv.due_date as string) + "T00:00:00").getTime() - todayMs) / DAY);
    inflow[forecastBucket(days)] += amt;
  }
  for (const bill of billsRes.data ?? []) {
    const amt = Number(bill.amount) || 0;
    if (amt === 0) continue;
    const days = Math.floor((new Date((bill.due_date as string) + "T00:00:00").getTime() - todayMs) / DAY);
    outflow[forecastBucket(days)] += amt;
  }

  let running = startingBalance;
  let lowestBalance = startingBalance;
  const periods: ForecastPeriod[] = FORECAST_ORDER.map((k) => {
    const net = inflow[k] - outflow[k];
    running += net;
    if (running < lowestBalance) lowestBalance = running;
    return { key: k, label: FORECAST_LABELS[k], inflow: inflow[k], outflow: outflow[k], net, projectedBalance: running };
  });

  const totalInflow = FORECAST_ORDER.reduce((s, k) => s + inflow[k], 0);
  const totalOutflow = FORECAST_ORDER.reduce((s, k) => s + outflow[k], 0);

  return { asOf: today, hasBank, startingBalance, periods, totalInflow, totalOutflow, endingBalance: running, lowestBalance };
}

// ─── Sales-tax liability report (Week 42) ─────────────────────────────────────
// Cash-basis: "tax collected" = tax on invoices PAID within the period (by
// paid_at), grouped by rate — what you'd report on a sales-tax return.

export interface SalesTaxRateRow {
  rate: number;          // e.g. 0.0875
  taxableSales: number;  // pre-tax base
  taxCollected: number;
  invoiceCount: number;
}

export interface SalesTaxReport {
  from: string;
  to: string;
  taxableSales: number;
  nonTaxableSales: number;
  totalSales: number;       // pre-tax base across all paid invoices
  taxCollected: number;
  taxedInvoiceCount: number;
  byRate: SalesTaxRateRow[];
}

export async function getSalesTaxReport(from: string, to: string): Promise<SalesTaxReport> {
  const orgId = (await getMemberOrgId()) ?? "";
  const t = await getServerT("books");
  if (!orgId) throw new Error(t("reports.business.errors.notAuthenticated"));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("subtotal, tax_rate, tax_amount, paid_at, status")
    .eq("organization_id", orgId)
    .eq("status", "paid")
    .gte("paid_at", from + "T00:00:00")
    .lte("paid_at", to + "T23:59:59.999Z");

  if (error) throw new Error(error.message);

  let taxableSales = 0;
  let nonTaxableSales = 0;
  let taxCollected = 0;
  let taxedInvoiceCount = 0;
  const rateMap = new Map<string, SalesTaxRateRow>();

  for (const inv of data ?? []) {
    const subtotal = Number(inv.subtotal) || 0;
    const tax = Number(inv.tax_amount) || 0;
    const rate = Number(inv.tax_rate) || 0;

    if (tax > 0 && rate > 0) {
      taxableSales += subtotal;
      taxCollected += tax;
      taxedInvoiceCount += 1;
      const key = rate.toFixed(4);
      const row = rateMap.get(key) ?? { rate, taxableSales: 0, taxCollected: 0, invoiceCount: 0 };
      row.taxableSales += subtotal;
      row.taxCollected += tax;
      row.invoiceCount += 1;
      rateMap.set(key, row);
    } else {
      nonTaxableSales += subtotal;
    }
  }

  const byRate = Array.from(rateMap.values()).sort((a, b) => b.taxCollected - a.taxCollected);

  return {
    from,
    to,
    taxableSales,
    nonTaxableSales,
    totalSales: taxableSales + nonTaxableSales,
    taxCollected,
    taxedInvoiceCount,
    byRate,
  };
}
