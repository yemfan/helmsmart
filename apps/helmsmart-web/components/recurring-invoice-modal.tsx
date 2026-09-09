"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCcw, X, Plus, Trash2 } from "lucide-react";
import { moneyFormatter } from "@/lib/books-format";
import { createRecurringInvoice } from "@/lib/actions/recurring";
import type { RecurringLineItem } from "@/lib/actions/recurring";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
}

interface Props {
  clients: Client[];
  /** `organizations.currency` — the ledger's currency, not the reader's country. */
  currency: string;
}

type Frequency = "weekly" | "monthly" | "quarterly" | "annually";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function defaultStartDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}

function emptyLine(): RecurringLineItem {
  return { description: "", quantity: 1, unit_price: 0 };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecurringInvoiceModal({ clients, currency }: Props) {
  const { t, i18n } = useTranslation("books");
  const fmt = moneyFormatter(i18n.language, currency);
  const [open, setOpen] = useState(false);

  // Form state
  const [clientId, setClientId] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState(defaultStartDate());
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [taxRatePct, setTaxRatePct] = useState("0");
  const [items, setItems] = useState<RecurringLineItem[]>([emptyLine()]);

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addItem() {
    setItems((prev) => [...prev, emptyLine()]);
  }

  function removeItem(i: number) {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(
    i: number,
    field: keyof RecurringLineItem,
    value: string | number
  ) {
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === i ? { ...item, [field]: value } : item
      )
    );
  }

  function resetForm() {
    setClientId("");
    setFrequency("monthly");
    setStartDate(defaultStartDate());
    setTitle("");
    setNotes("");
    setTaxRatePct("0");
    setItems([emptyLine()]);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const validItems = items.filter((i) => i.description.trim());
      if (!validItems.length) throw new Error(t("invoices.recurringModal.errors.noLineItems"));

      await createRecurringInvoice({
        client_id: clientId,
        frequency,
        next_invoice_date: startDate,
        title: title.trim() || t("invoices.recurringModal.defaultTitle"),
        notes: notes.trim() || undefined,
        tax_rate: Number(taxRatePct) / 100,
        line_items: validItems,
      });

      setOpen(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common:errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  // Live totals
  const subtotal = items.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.unit_price),
    0
  );
  const taxRate = Number(taxRatePct) / 100;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
      >
        <RefreshCcw className="w-4 h-4" />
        {t("invoices.recurringModal.trigger")}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
              <h2 className="text-base font-semibold text-slate-900">
                {t("invoices.recurringModal.title")}
              </h2>
              <button
                onClick={() => { setOpen(false); resetForm(); }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable form body */}
            <form
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
            >
              {/* Client */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t("invoices.recurringModal.client")}
                </label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">{t("invoices.recurringModal.noSpecificClient")}</option>
                  {clients.map((c) => {
                    const name =
                      [c.first_name, c.last_name].filter(Boolean).join(" ") ||
                      c.company ||
                      c.id;
                    return (
                      <option key={c.id} value={c.id}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Frequency + Start date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    {t("invoices.recurringModal.frequency")}
                  </label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as Frequency)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {(["weekly", "monthly", "quarterly", "annually"] as const).map((f) => (
                      <option key={f} value={f}>{t(`invoices.frequency.${f}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    {t("invoices.recurringModal.firstInvoiceDate")}
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t("invoices.recurringModal.invoiceTitle")}{" "}
                  <span className="text-slate-400 font-normal">{t("invoices.recurringModal.optional")}</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("invoices.recurringModal.titlePlaceholder")}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-600">
                    {t("invoices.recurringModal.lineItems")}
                  </label>
                  <button
                    type="button"
                    onClick={addItem}
                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    {t("invoices.recurringModal.addItem")}
                  </button>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[1fr_72px_96px_32px] gap-2 mb-1 px-1">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                    {t("invoices.recurringModal.columns.description")}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                    {t("invoices.recurringModal.columns.qty")}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                    {t("invoices.recurringModal.columns.price")}
                  </span>
                </div>

                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_72px_96px_32px] gap-2 items-center"
                    >
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(i, "description", e.target.value)
                        }
                        placeholder={t("invoices.recurringModal.itemPlaceholder")}
                        className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(i, "quantity", Number(e.target.value))
                        }
                        min={1}
                        step={1}
                        className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                      />
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) =>
                          updateItem(i, "unit_price", Number(e.target.value))
                        }
                        min={0}
                        step={0.01}
                        placeholder="0.00"
                        className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        disabled={items.length === 1}
                        className="p-1.5 text-slate-300 hover:text-rose-500 disabled:opacity-20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tax rate + live totals */}
              <div className="grid grid-cols-2 gap-4 items-start">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">
                    {t("invoices.recurringModal.taxRate")}
                  </label>
                  <input
                    type="number"
                    value={taxRatePct}
                    onChange={(e) => setTaxRatePct(e.target.value)}
                    min={0}
                    max={100}
                    step={0.01}
                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="bg-slate-50 rounded-xl p-4 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>{t("invoices.recurringModal.subtotal")}</span>
                    <span className="tabular-nums font-mono">{fmt(subtotal)}</span>
                  </div>
                  {taxRate > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>{t("invoices.recurringModal.taxAt", { rate: taxRatePct })}</span>
                      <span className="tabular-nums font-mono">{fmt(tax)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-slate-800 border-t border-slate-200 pt-1.5">
                    <span>{t("invoices.recurringModal.perInvoice")}</span>
                    <span className="tabular-nums font-mono">{fmt(total)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t("invoices.recurringModal.notes")}{" "}
                  <span className="text-slate-400 font-normal">{t("invoices.recurringModal.optional")}</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t("invoices.recurringModal.notesPlaceholder")}
                  className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {error && (
                <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </form>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
              <button
                type="button"
                onClick={() => { setOpen(false); resetForm(); }}
                className="flex-1 py-2.5 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                type="submit"
                form="recurring-form"
                disabled={loading}
                onClick={handleSubmit}
                className="flex-1 py-2.5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
              >
                {loading ? t("common:status.creating") : t("invoices.recurringModal.create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
