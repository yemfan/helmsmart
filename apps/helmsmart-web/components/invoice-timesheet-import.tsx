"use client";

import { useState, useTransition } from "react";
import { Clock, Check, X, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { importTimeEntriesToInvoice, type TimeEntry } from "@/lib/actions/time-entries";
import { useRouter } from "next/navigation";
import { dateFormatter, moneyFormatter } from "@/lib/books-format";

interface Props {
  invoiceId: string;
  uninvoicedEntries: TimeEntry[];
  /** `organizations.currency` — the ledger's currency, not the reader's country. */
  currency: string;
}

export function InvoiceTimesheetImport({ invoiceId, uninvoicedEntries, currency }: Props) {
  const { t, i18n } = useTranslation("books");
  const fmtMoney = moneyFormatter(i18n.language, currency);
  const entryDate = dateFormatter(i18n.language, { month: "short", day: "numeric" });
  /** "2h 15m" reads as hours-and-minutes in both languages; the units are the copy. */
  const fmtDuration = (mins: number | null) => {
    if (!mins) return t("invoices.timesheetImport.minutes", { count: 0 });
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0
      ? `${t("invoices.timesheetImport.hours", { count: h })} ${t("invoices.timesheetImport.minutes", { count: m })}`
      : t("invoices.timesheetImport.minutes", { count: m });
  };
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  if (!uninvoicedEntries.length) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(uninvoicedEntries.map((e) => e.id)));
  }
  function clearAll() { setSelected(new Set()); }

  const totalMins = uninvoicedEntries
    .filter((e) => selected.has(e.id))
    .reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
  const totalAmt = uninvoicedEntries
    .filter((e) => selected.has(e.id) && e.billable && e.hourly_rate && e.duration_minutes)
    .reduce((s, e) => s + (e.duration_minutes! / 60) * e.hourly_rate!, 0);

  function doImport() {
    if (!selected.size) { setError(t("invoices.timesheetImport.selectAtLeastOne")); return; }
    setError("");
    startTransition(async () => {
      try {
        await importTimeEntriesToInvoice(invoiceId, Array.from(selected));
        setOpen(false);
        setSelected(new Set());
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("invoices.timesheetImport.importFailed"));
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Clock className="w-3.5 h-3.5" />
        {t("invoices.timesheetImport.trigger", { count: uninvoicedEntries.length })}
        <ChevronRight className="w-3 h-3" />
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{t("invoices.timesheetImport.title")}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{t("invoices.timesheetImport.subtitle")}</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Select all / clear */}
            <div className="px-6 py-2.5 border-b border-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {t("invoices.timesheetImport.selectedOf", { selected: selected.size, total: uninvoicedEntries.length })}
              </span>
              <div className="flex gap-3">
                <button onClick={selectAll} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">{t("invoices.timesheetImport.selectAll")}</button>
                <button onClick={clearAll}  className="text-xs text-slate-400 hover:text-slate-600">{t("invoices.timesheetImport.clear")}</button>
              </div>
            </div>

            {/* Entries list */}
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
              {uninvoicedEntries.map((entry) => {
                const amt = entry.billable && entry.hourly_rate && entry.duration_minutes
                  ? (entry.duration_minutes / 60) * entry.hourly_rate
                  : null;
                const checked = selected.has(entry.id);
                return (
                  <label
                    key={entry.id}
                    className={`flex items-center gap-3 px-6 py-3 cursor-pointer transition-colors ${checked ? "bg-indigo-50/50" : "hover:bg-slate-50"}`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}>
                      {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </div>
                    <input type="checkbox" checked={checked} onChange={() => toggle(entry.id)} className="sr-only" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {entry.description || t("invoices.timesheetImport.noDescription")}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {entryDate(new Date(entry.started_at))}
                        {entry.project && ` · ${entry.project}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-mono text-slate-600">{fmtDuration(entry.duration_minutes)}</p>
                      {amt !== null && (
                        <p className="text-xs text-emerald-600 font-medium">{fmtMoney(amt)}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">
                  {selected.size > 0 && (
                    <span>
                      {fmtDuration(totalMins)} · {fmtMoney(totalAmt)}
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition-colors"
                  >
                    {t("common:actions.cancel")}
                  </button>
                  <button
                    onClick={doImport}
                    disabled={isPending || !selected.size}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {isPending
                      ? t("common:status.importing")
                      : selected.size > 0
                        ? t("invoices.timesheetImport.importCount", { count: selected.size })
                        : t("invoices.timesheetImport.import")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
