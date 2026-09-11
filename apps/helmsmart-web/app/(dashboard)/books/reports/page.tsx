import { PageTitle } from "@/components/page-title";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { BooksNav } from "@/components/books-nav";
import { PeriodSelect } from "@/components/period-select";
import { TrendingUp, TrendingDown, Scale, DollarSign, Clock, ArrowRight } from "lucide-react";
import Link from "next/link";
import { getServerT, getServerLocale } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { moneyFormatter, dateFormatter } from "@/lib/books-format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("reports.financial.metaTitle") };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

type T = Awaited<ReturnType<typeof getServerT>>;

interface AccountBalance {
  code: string;
  name: string;
  type: AccountType;
  balance: number; // always positive; direction depends on type
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

async function getBalances(
  orgId: string,
  start: string,
  end: string
): Promise<AccountBalance[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("journal_lines")
    .select(`
      debit, credit,
      journal_entries!inner(organization_id, date),
      chart_of_accounts!inner(code, name, type)
    `)
    .eq("journal_entries.organization_id", orgId)
    .gte("journal_entries.date", start)
    .lte("journal_entries.date", end);

  if (!data?.length) return [];

  // Aggregate by account
  const map = new Map<string, AccountBalance>();
  for (const row of data) {
    const coaRaw = row.chart_of_accounts;
    const coa = (Array.isArray(coaRaw) ? coaRaw[0] : coaRaw) as { code: string; name: string; type: AccountType } | null;
    if (!coa) continue;
    const key = coa.code;
    const existing = map.get(key) ?? { code: coa.code, name: coa.name, type: coa.type, balance: 0 };

    const debit  = Number(row.debit  ?? 0);
    const credit = Number(row.credit ?? 0);

    // Normal balance direction:
    //   asset / expense  → debit increases (debit - credit = positive means balance)
    //   liability / equity / revenue → credit increases
    if (coa.type === "asset" || coa.type === "expense") {
      existing.balance += debit - credit;
    } else {
      existing.balance += credit - debit;
    }
    map.set(key, existing);
  }

  return Array.from(map.values()).filter((a) => a.balance !== 0);
}

// ─── Period helpers ───────────────────────────────────────────────────────────

/**
 * `period` is a URL value the code reads; the label beside it is copy, so it
 * comes out of the bundle (or out of a locale-aware month formatter).
 */
function getPeriod(
  period: string,
  t: T,
  fmtMonth: (value: Date | string) => string,
): { label: string; start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (period === "ytd") {
    return {
      label: t("reports.financial.periodLabels.ytd", { year: y }),
      start: `${y}-01-01`,
      end: now.toISOString().slice(0, 10),
    };
  }
  if (period === "last_month") {
    const d = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    return {
      label: fmtMonth(d),
      start: d.toISOString().slice(0, 10),
      end: last.toISOString().slice(0, 10),
    };
  }
  if (period === "q1" || period === "q2" || period === "q3" || period === "q4") {
    const spans: Record<string, [string, string]> = {
      q1: [`${y}-01-01`, `${y}-03-31`],
      q2: [`${y}-04-01`, `${y}-06-30`],
      q3: [`${y}-07-01`, `${y}-09-30`],
      q4: [`${y}-10-01`, `${y}-12-31`],
    };
    const [start, end] = spans[period];
    return { label: t(`reports.financial.periodLabels.${period}`, { year: y }), start, end };
  }

  // Default: current month
  const first = new Date(y, m, 1);
  const last  = new Date(y, m + 1, 0);
  return {
    label: fmtMonth(first),
    start: first.toISOString().slice(0, 10),
    end:   last.toISOString().slice(0, 10),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTable({
  title,
  rows,
  total,
  totalLabel,
  positive,
  t,
  fmt,
}: {
  title: string;
  rows: AccountBalance[];
  total: number;
  totalLabel: string;
  positive: boolean;
  t: T;
  fmt: (value: number) => string;
}) {
  if (!rows.length) {
    return (
      <div className="mb-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</h3>
        <p className="text-xs text-slate-400 italic pl-2">{t("reports.financial.noActivity")}</p>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</h3>
      <div className="space-y-0.5">
        {rows
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((row) => (
            <div key={row.code} className="flex items-center gap-4 px-3 py-1.5 rounded-lg hover:bg-slate-50 group">
              <span className="w-12 text-xs text-slate-400 tabular-nums font-mono">{row.code}</span>
              <span className="flex-1 text-sm text-slate-700 truncate">{row.name}</span>
              <span
                className={`text-sm font-medium tabular-nums ${
                  positive ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {fmt(row.balance)}
              </span>
            </div>
          ))}
      </div>
      <div className="flex items-center gap-4 px-3 py-2 mt-1 border-t border-slate-200">
        <span className="flex-1 text-xs font-semibold text-slate-600">{totalLabel}</span>
        <span className={`text-sm font-bold tabular-nums ${positive ? "text-emerald-700" : "text-rose-700"}`}>
          {fmt(total)}
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const t = await getServerT("books");
  const locale = await getServerLocale();
  const params = await searchParams;
  const period = params.period ?? "current_month";

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const currency = await orgCurrency(orgId);

  const fmtRaw = moneyFormatter(locale, currency, { maximumFractionDigits: 0 });
  const fmt = (n: number) => fmtRaw(Math.abs(n));
  const fmtMonth = dateFormatter(locale, { month: "long", year: "numeric" });
  const fmtDay = dateFormatter(locale, { year: "numeric", month: "short", day: "numeric" });

  const { label, start, end } = getPeriod(period, t, fmtMonth);
  const balances = await getBalances(orgId, start, end);

  const byType = (type: AccountType) => balances.filter((b) => b.type === type);

  // P&L figures
  const revenues  = byType("revenue");
  const expenses  = byType("expense");
  const totalRev  = revenues.reduce((s, b) => s + b.balance, 0);
  const totalExp  = expenses.reduce((s, b) => s + b.balance, 0);
  const netIncome = totalRev - totalExp;

  // Balance sheet
  const assets      = byType("asset");
  const liabilities = byType("liability");
  const equity      = byType("equity");
  const totalAssets = assets.reduce((s, b) => s + b.balance, 0);
  const totalLiab   = liabilities.reduce((s, b) => s + b.balance, 0);
  const totalEquity = equity.reduce((s, b) => s + b.balance, 0) + netIncome; // retained earnings
  const balanced    = Math.abs(totalAssets - (totalLiab + totalEquity)) < 0.01;

  // `value` is the URL query value the page reads back; only the label is copy.
  const PERIODS = ["current_month", "last_month", "ytd", "q1", "q2", "q3", "q4"].map((value) => ({
    value,
    label: t(`reports.financial.periods.${value}`),
  }));

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <PageTitle base="Books" />
          <p className="text-sm text-slate-500 mt-0.5">{t("reports.financial.subtitle")}</p>
        </div>
        <PeriodSelect options={PERIODS} value={period} />
      </div>

      <BooksNav />

      <p className="text-xs text-slate-400 mb-6">
        {t("reports.financial.periodLine", {
          label,
          start: fmtDay(start),
          end: fmtDay(end),
        })}
      </p>

      {/* Quick links to aging */}
      <div className="flex gap-3 mb-6">
        <Link
          href="/books/aging"
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-indigo-300 transition-colors"
        >
          <Clock className="w-4 h-4 text-rose-500" />
          {t("reports.financial.agingLink")}
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
        </Link>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {t("reports.financial.cards.revenue")}
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-semibold text-emerald-700 font-mono">{fmt(totalRev)}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {t("reports.financial.cards.accounts", { count: revenues.length })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {t("reports.financial.cards.expenses")}
            </span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-semibold text-rose-700 font-mono">{fmt(totalExp)}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {t("reports.financial.cards.accounts", { count: expenses.length })}
          </div>
        </div>

        <div className={`rounded-xl border p-5 ${netIncome >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              {t("reports.financial.cards.netIncome")}
            </span>
            <DollarSign className={`w-4 h-4 ${netIncome >= 0 ? "text-emerald-500" : "text-rose-500"}`} />
          </div>
          <div className={`text-2xl font-semibold font-mono ${netIncome >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {netIncome < 0 ? "–" : ""}{fmt(netIncome)}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{t("reports.financial.cards.netIncomeFormula")}</div>
        </div>
      </div>

      {/* ── Two column: P&L + Balance Sheet ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* P&L */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-800">{t("reports.financial.pnl.title")}</h2>
          </div>

          <SectionTable
            title={t("reports.financial.pnl.revenue")}
            rows={revenues}
            total={totalRev}
            totalLabel={t("reports.financial.pnl.totalRevenue")}
            positive={true}
            t={t}
            fmt={fmt}
          />
          <SectionTable
            title={t("reports.financial.pnl.expenses")}
            rows={expenses}
            total={totalExp}
            totalLabel={t("reports.financial.pnl.totalExpenses")}
            positive={false}
            t={t}
            fmt={fmt}
          />

          <div className={`flex items-center gap-4 px-3 py-3 rounded-lg mt-2 ${
            netIncome >= 0 ? "bg-emerald-50" : "bg-rose-50"
          }`}>
            <span className="flex-1 text-sm font-bold text-slate-700">
              {t("reports.financial.pnl.netIncome")}
            </span>
            <span className={`text-sm font-bold tabular-nums ${netIncome >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {netIncome < 0 ? "–" : ""}{fmt(netIncome)}
            </span>
          </div>
        </div>

        {/* Balance Sheet */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Scale className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-800">
              {t("reports.financial.balanceSheet.title")}
            </h2>
            {!balanced && balances.length > 0 && (
              <span className="ml-auto text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded-full">
                {t("reports.financial.balanceSheet.outOfBalance")}
              </span>
            )}
          </div>

          <SectionTable
            title={t("reports.financial.balanceSheet.assets")}
            rows={assets}
            total={totalAssets}
            totalLabel={t("reports.financial.balanceSheet.totalAssets")}
            positive={true}
            t={t}
            fmt={fmt}
          />
          <SectionTable
            title={t("reports.financial.balanceSheet.liabilities")}
            rows={liabilities}
            total={totalLiab}
            totalLabel={t("reports.financial.balanceSheet.totalLiabilities")}
            positive={false}
            t={t}
            fmt={fmt}
          />
          <SectionTable
            title={t("reports.financial.balanceSheet.equity")}
            rows={equity}
            total={totalEquity}
            totalLabel={t("reports.financial.balanceSheet.totalEquity")}
            positive={true}
            t={t}
            fmt={fmt}
          />

          {balances.length > 0 && (
            <div className={`flex items-center gap-4 px-3 py-3 rounded-lg mt-2 ${
              balanced ? "bg-slate-50" : "bg-amber-50"
            }`}>
              <span className="flex-1 text-xs font-semibold text-slate-500">
                {t("reports.financial.balanceSheet.equation")}
              </span>
              <span className={`text-xs font-bold ${balanced ? "text-slate-600" : "text-amber-700"}`}>
                {balanced
                  ? t("reports.financial.balanceSheet.balanced")
                  : t("reports.financial.balanceSheet.outBy", {
                      amount: fmt(Math.abs(totalAssets - totalLiab - totalEquity)),
                    })}
              </span>
            </div>
          )}

          {!balances.length && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Scale className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-xs text-slate-400">{t("reports.financial.balanceSheet.empty")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
