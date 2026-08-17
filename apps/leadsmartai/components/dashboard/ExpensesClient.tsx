"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wallet, ChevronUp, Receipt as ReceiptIcon } from "lucide-react";
import { formatMoney } from "@/lib/books/money";
import { EXPENSE_CATEGORIES } from "@/lib/books/expense-categories";
import type { ExpenseRow, ExpenseTotals } from "@/lib/books/expenses";

const CATEGORY_TONE: Record<string, string> = {
  "Marketing & Advertising": "bg-blue-50 text-blue-700 ring-blue-200",
  "Auto & Mileage": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Dues & Subscriptions": "bg-violet-50 text-violet-700 ring-violet-200",
  "Signage & Printing": "bg-amber-50 text-amber-700 ring-amber-200",
  "Staging": "bg-rose-50 text-rose-700 ring-rose-200",
  "Client Gifts & Meals": "bg-orange-50 text-orange-700 ring-orange-200",
  "Office & Software": "bg-sky-50 text-sky-700 ring-sky-200",
  "Education & CE": "bg-indigo-50 text-indigo-700 ring-indigo-200",
  "Other": "bg-slate-100 text-slate-700 ring-slate-200",
};

function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ExpensesClient({
  initialExpenses,
  monthTotals,
  yearTotals,
}: {
  initialExpenses: ExpenseRow[];
  monthTotals: ExpenseTotals;
  yearTotals: ExpenseTotals;
}) {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [showForm, setShowForm] = useState(initialExpenses.length === 0);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Log-form state
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [expenseDate, setExpenseDate] = useState(todayLocalIso());
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topCategory = useMemo(
    () => yearTotals.byCategory[0]?.category ?? "—",
    [yearTotals],
  );
  const maxCat = useMemo(
    () => yearTotals.byCategory.reduce((m, c) => Math.max(m, c.total), 0),
    [yearTotals],
  );

  function resetForm() {
    setAmount("");
    setCategory(EXPENSE_CATEGORIES[0]);
    setExpenseDate(todayLocalIso());
    setVendor("");
    setNotes("");
  }

  async function logExpense() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(t("pages.expenses.needAmount"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/books/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          category,
          vendor,
          notes,
          expenseDate: expenseDate || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not save the expense.");
      resetForm();
      setShowForm(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the expense.");
    } finally {
      setSaving(false);
    }
  }

  async function removeExpense(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/dashboard/books/expenses/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (res.ok && data.ok) router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{t("pages.expenses.breadcrumb")}</div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Wallet className="h-6 w-6 text-blue-600" strokeWidth={2} />{t("pages.expenses.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("pages.expenses.intro")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          {showForm ? <ChevronUp className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{t("pages.dashFragments.logExpense")}</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("pages.expenses.thisMonth")} value={formatMoney(monthTotals.total)} tone="blue" />
        <Stat label={t("pages.expenses.yearToDate")} value={formatMoney(yearTotals.total)} tone="emerald" />
        <Stat label={t("pages.expenses.topCategory")} value={topCategory} tone="slate" small />
      </div>

      {/* Log form */}
      {showForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t("pages.expenses.logHeading")}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.expenses.amount")}</span>
              <input
                className={input}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder={t("pages.expenses.amountPlaceholder")}
                autoFocus
              />
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.expenses.category")}</span>
              <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.expenses.date")}</span>
              <input type="date" className={input} value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.expenses.vendor")}</span>
              <input className={input} value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder={t("pages.expenses.vendorPlaceholder")} />
            </div>
          </div>
          <div className="mt-3">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.expenses.notes")}</span>
            <textarea
              className={`${input} min-h-[56px]`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("pages.expenses.notesPlaceholder")}
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void logExpense()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? t("pages.expenses.saving") : t("pages.expenses.log")}
            </button>
            {error && <span className="text-xs font-medium text-rose-600">{error}</span>}
          </div>
        </section>
      )}

      {/* Year-to-date by category — what tax time cares about */}
      {yearTotals.byCategory.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t("pages.expenses.ytdByCategory")}</h2>
          <ul className="space-y-2.5">
            {yearTotals.byCategory.map((c) => (
              <li key={c.category}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-700">{c.category}</span>
                  <span className="font-semibold text-slate-900">{formatMoney(c.total)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${maxCat > 0 ? Math.max(4, (c.total / maxCat) * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Expense list */}
      {initialExpenses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">{t("pages.expenses.empty")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {initialExpenses.map((ex) => (
            <li key={ex.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${CATEGORY_TONE[ex.category] ?? CATEGORY_TONE.Other}`}
                  >
                    {ex.category}
                  </span>
                  {ex.receipt_url && (
                    <a
                      href={ex.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 hover:underline"
                    >
                      <ReceiptIcon className="h-3.5 w-3.5" />{t("pages.expenses.receipt")}</a>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {ex.expense_date}
                  {ex.vendor ? ` · ${ex.vendor}` : ""}
                  {ex.notes ? ` · ${ex.notes}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-slate-900">{formatMoney(Number(ex.amount))}</span>
              <button
                type="button"
                onClick={() => void removeExpense(ex.id)}
                disabled={busyId === ex.id}
                className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-50"
                aria-label={t("pages.expenses.deleteExpense")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone: "slate" | "blue" | "emerald";
  small?: boolean;
}) {
  const palette: Record<string, string> = {
    slate: "bg-slate-50 text-slate-900",
    blue: "bg-blue-50 text-blue-900",
    emerald: "bg-emerald-50 text-emerald-900",
  };
  return (
    <div className={`rounded-xl px-3 py-2.5 ${palette[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</div>
      <div className={`mt-0.5 font-semibold ${small ? "truncate text-sm" : "text-lg"}`}>{value}</div>
    </div>
  );
}
