"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus, Repeat, X, AlertCircle, Play, Pause, Calendar } from "lucide-react";
import { dateFormatter, moneyFormatter } from "@/lib/books-format";
import { calendarDate, firstOfMonth } from "@/lib/org-date";
import {
  createRecurringBill,
  setRecurringBillStatus,
  deleteRecurringBill,
  type RecurringBill,
  type RecurringFrequency,
} from "@/lib/actions/recurring-bills";

type ExpenseAccount = { id: string; code: string; name: string };

// The frequency VALUES are what the database stores; their labels live in the
// bundle under `bills.recurring.frequency.<value>`.
const FREQUENCIES: RecurringFrequency[] = ["weekly", "monthly", "quarterly", "annually"];

/** The 1st of the org's next month. */
function defaultNextRun(timeZone: string): string {
  return firstOfMonth(calendarDate(timeZone), 1);
}

// ─── New recurring bill modal ───────────────────────────────────────────────────

function NewRecurringBillModal({
  expenseAccounts,
  vendorNames,
  currency,
  timeZone,
  onClose,
  onSaved,
}: {
  expenseAccounts: ExpenseAccount[];
  vendorNames: string[];
  currency: string;
  timeZone: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("books");
  const [vendor, setVendor]               = useState("");
  const [description, setDesc]            = useState("");
  const [expenseAccountId, setExpenseAcc] = useState(expenseAccounts[0]?.id ?? "");
  const [amount, setAmount]               = useState("");
  const [dueDays, setDueDays]             = useState("30");
  const [frequency, setFreq]              = useState<RecurringFrequency>("monthly");
  const [nextRunDate, setNextRun]         = useState(() => defaultNextRun(timeZone));
  const [error, setError]                 = useState("");
  const [isPending, start]                = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!vendor.trim()) { setError(t("bills.errors.vendorRequired")); return; }
    if (!amt || amt <= 0) { setError(t("bills.errors.invalidAmount")); return; }
    if (!nextRunDate) { setError(t("bills.errors.firstRunDateRequired")); return; }
    setError("");
    start(async () => {
      try {
        await createRecurringBill({
          vendor: vendor.trim(),
          description: description.trim() || null,
          expenseAccountId: expenseAccountId || null,
          amount: +amt.toFixed(2),
          dueDays: parseInt(dueDays, 10) || 0,
          frequency,
          nextRunDate,
        });
        onSaved();
      } catch (err) {
        console.error("create recurring bill", err);
        setError(t("bills.errors.createRecurringFailed"));
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-800">{t("bills.recurring.form.title")}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <p className="text-xs text-rose-600 flex items-center gap-1" role="alert"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("bills.form.vendor")}</label>
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder={t("bills.recurring.form.vendorPlaceholder")} list="recurring-bill-vendor-names" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {vendorNames.length > 0 && (
              <datalist id="recurring-bill-vendor-names">
                {vendorNames.map((n) => <option key={n} value={n} />)}
              </datalist>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("bills.form.amount", { currency })}</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("bills.form.description")}</label>
          <input value={description} onChange={(e) => setDesc(e.target.value)} placeholder={t("bills.recurring.form.descriptionPlaceholder")} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("bills.form.category")}</label>
          {expenseAccounts.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">{t("bills.form.noExpenseAccounts")}</p>
          ) : (
            <select value={expenseAccountId} onChange={(e) => setExpenseAcc(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("bills.recurring.form.frequency")}</label>
            <select value={frequency} onChange={(e) => setFreq(e.target.value as RecurringFrequency)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`bills.recurring.frequency.${f}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("bills.recurring.form.firstDate")}</label>
            <input type="date" value={nextRunDate} onChange={(e) => setNextRun(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("bills.recurring.form.netDays")}</label>
            <input type="number" min="0" step="1" value={dueDays} onChange={(e) => setDueDays(e.target.value)} placeholder="30" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          {t("bills.recurring.form.note", { count: parseInt(dueDays, 10) || 0 })}
        </p>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">{t("common:actions.cancel")}</button>
          <button type="submit" disabled={isPending} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {isPending ? t("common:status.saving") : t("bills.recurring.form.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Recurring bill row ───────────────────────────────────────────────────────────

function RecurringRow({
  rec,
  currency,
  onChanged,
  onDeleted,
}: {
  rec: RecurringBill;
  currency: string;
  onChanged: (id: string, status: "active" | "paused") => void;
  onDeleted: (id: string) => void;
}) {
  const { t, i18n } = useTranslation("books");
  const fmt = moneyFormatter(i18n.language, currency);
  const fmtDate = dateFormatter(i18n.language, { month: "short", day: "numeric", year: "numeric" });
  const fmtShortDate = dateFormatter(i18n.language, { month: "short", day: "numeric" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, start] = useTransition();
  const paused = rec.status === "paused";

  function toggleStatus() {
    const next = paused ? "active" : "paused";
    start(async () => {
      await setRecurringBillStatus(rec.id, next);
      onChanged(rec.id, next);
    });
  }
  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    start(async () => {
      await deleteRecurringBill(rec.id);
      onDeleted(rec.id);
    });
  }

  return (
    <div className="flex items-center gap-4 px-5 py-4 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-800 truncate">{rec.vendor}</p>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
            {t(`bills.recurring.frequency.${rec.frequency}`)}
          </span>
          {paused && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {t("bills.recurring.paused")}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span>{rec.expense_account?.name ?? t("bills.row.uncategorized")}</span>
          {rec.description ? <span className="truncate">{rec.description}</span> : null}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {paused
              ? t("bills.recurring.paused")
              : t("bills.recurring.next", { date: fmtDate(rec.next_run_date) })}
          </span>
          <span>{t("bills.recurring.net", { days: rec.due_days, count: rec.due_days })}</span>
          {rec.last_generated_at && (
            <span>
              {t("bills.recurring.last", { date: fmtShortDate(new Date(rec.last_generated_at)) })}
            </span>
          )}
        </p>
      </div>

      <span className="text-sm font-semibold text-slate-800 tabular-nums flex-shrink-0">{fmt(rec.amount)}</span>

      <button
        onClick={toggleStatus}
        disabled={isPending}
        title={paused ? t("bills.recurring.resume") : t("bills.recurring.pause")}
        className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50 transition-colors"
      >
        {paused ? (
          <><Play className="w-3 h-3" /> {t("bills.recurring.resume")}</>
        ) : (
          <><Pause className="w-3 h-3" /> {t("bills.recurring.pause")}</>
        )}
      </button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
          confirmDelete ? "bg-rose-100 text-rose-700 hover:bg-rose-200" : "text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"
        }`}
      >
        {confirmDelete ? t("common:actions.confirm") : t("common:actions.delete")}
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────────

interface Props {
  initialRecurring: RecurringBill[];
  expenseAccounts: ExpenseAccount[];
  vendorNames: string[];
  currency: string;
  /** `organizations.timezone` — decides the first-run default. */
  timeZone: string;
}

export function RecurringBillsClient({ initialRecurring, expenseAccounts, vendorNames, currency, timeZone }: Props) {
  const { t, i18n } = useTranslation("books");
  const fmt = moneyFormatter(i18n.language, currency);
  const [recurring, setRecurring] = useState<RecurringBill[]>(initialRecurring);
  const [showNew, setShowNew]     = useState(false);

  const activeCount = recurring.filter((r) => r.status === "active").length;
  const monthlyEstimate = recurring
    .filter((r) => r.status === "active")
    .reduce((s, r) => {
      const perMonth = r.frequency === "weekly" ? r.amount * 4.33 : r.frequency === "monthly" ? r.amount : r.frequency === "quarterly" ? r.amount / 3 : r.amount / 12;
      return s + perMonth;
    }, 0);

  // Three whole phrases separated by punctuation, never one sentence in parts.
  const summary = [
    t("bills.recurring.activeCount", { count: activeCount }),
    t("bills.recurring.monthlyEstimate", { amount: fmt(monthlyEstimate) }),
    t("bills.recurring.autoGenerate"),
  ].join(" · ");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-800">{t("bills.recurring.title")}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{summary}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/books/bills" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {t("bills.recurring.backToBills")}
          </Link>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" />
            {t("bills.recurring.newRecurring")}
          </button>
        </div>
      </div>

      {recurring.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl">
          <Repeat className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500 mb-1">{t("bills.recurring.empty.title")}</p>
          <p className="text-xs text-slate-400 mb-4 max-w-sm">{t("bills.recurring.empty.body")}</p>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" />
            {t("bills.recurring.empty.cta")}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-50">
          {recurring.map((r) => (
            <RecurringRow
              key={r.id}
              rec={r}
              currency={currency}
              onChanged={(id, status) => setRecurring((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)))}
              onDeleted={(id) => setRecurring((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4">{t("bills.recurring.footnote")}</p>

      {showNew && (
        <NewRecurringBillModal
          expenseAccounts={expenseAccounts}
          vendorNames={vendorNames}
          currency={currency}
          timeZone={timeZone}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
