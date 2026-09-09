import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Receipt, Upload } from "lucide-react";
import { BooksNav } from "@/components/books-nav";
import { listExpenses } from "@/lib/actions/expenses";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { dateFormatter, moneyFormatter } from "@/lib/books-format";
import { orgCurrency } from "@/lib/books-currency";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("expenses.list.metaTitle") };
}

export default async function ExpensesPage() {
  const t = await getServerT("books");
  const locale = await getServerLocale();
  const currency = await orgCurrency();
  const fmt = moneyFormatter(locale, currency);
  const fmtDate = dateFormatter(locale, { month: "short", day: "numeric", year: "numeric" });

  const expenses = await listExpenses(200);
  const totalSpend = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <BooksNav />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("expenses.list.title")}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t("expenses.list.subtitle", { count: expenses.length, total: fmt(totalSpend) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative group">
            <button className="flex items-center gap-2 px-4 py-2.5 text-slate-700 text-sm font-medium border border-slate-200 hover:border-slate-300 rounded-lg transition-colors bg-white">
              <Upload className="w-4 h-4" />
              {t("expenses.list.import")}
              <span className="text-slate-400">▼</span>
            </button>
            <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <Link
                href="/books/expenses/import"
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-100 first:rounded-t-lg"
              >
                <span>{t("expenses.list.importCsv")}</span>
              </Link>
              <Link
                href="/books/expenses/import-ofx"
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 last:rounded-b-lg"
              >
                <span>{t("expenses.list.importOfx")}</span>
              </Link>
            </div>
          </div>
          <Link
            href="/books/expenses/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("expenses.list.record")}
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
              <Receipt className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 mb-1">{t("expenses.list.emptyTitle")}</p>
            <p className="text-xs text-slate-400 max-w-xs mb-5">
              {t("expenses.list.emptyBody")}
            </p>
            <Link
              href="/books/expenses/new"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> {t("expenses.list.emptyCta")}
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[120px_1fr_180px_120px] gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
              <span>{t("expenses.list.columns.date")}</span>
              <span>{t("expenses.list.columns.description")}</span>
              <span>{t("expenses.list.columns.account")}</span>
              <span className="text-right">{t("expenses.list.columns.amount")}</span>
            </div>

            <div className="divide-y divide-slate-50">
              {expenses.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[120px_1fr_180px_120px] gap-4 px-6 py-4 items-center hover:bg-slate-50 transition-colors"
                >
                  <span className="text-sm text-slate-500 tabular-nums">
                    {fmtDate(e.date)}
                  </span>
                  <span className="text-sm text-slate-800 truncate">{e.memo ?? "—"}</span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-mono text-slate-400">{e.accountCode}</span>
                    <span className="text-xs text-slate-600 truncate">{e.accountName}</span>
                  </div>
                  <span className="text-sm font-semibold text-rose-600 text-right tabular-nums">
                    {fmt(e.amount)}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer total */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50">
              <span className="text-sm font-semibold text-slate-700">{t("expenses.list.total")}</span>
              <span className="text-sm font-bold text-rose-700 tabular-nums">{fmt(totalSpend)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
