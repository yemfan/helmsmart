"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { createInvoice, type InvoiceLine } from "@/lib/actions/invoices";
import { moneyFormatter } from "@/lib/books-format";

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
}

interface CoaAccount {
  id: string;
  code: string;
  name: string;
}

interface Props {
  clients: Client[];
  revenueAccounts: CoaAccount[];
  preselectedClientId?: string;
  /** `organizations.currency` — the ledger's currency, not the reader's country. */
  currency: string;
}

const emptyLine = (): InvoiceLine & { key: string } => ({
  key: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unit_price: 0,
  amount: 0,
  coa_account_id: null,
});

export function InvoiceBuilder({ clients, revenueAccounts, preselectedClientId, currency }: Props) {
  const { t, i18n } = useTranslation("books");
  const money = moneyFormatter(i18n.language, currency);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [clientId, setClientId]   = useState(preselectedClientId ?? "");
  const [dueDate, setDueDate]     = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [taxRate, setTaxRate]     = useState(0);
  const [notes, setNotes]         = useState("");
  const [lines, setLines]         = useState<(InvoiceLine & { key: string })[]>([emptyLine()]);

  // Computed totals
  const subtotal  = lines.reduce((s, l) => s + l.amount, 0);
  const taxAmount = +(subtotal * taxRate / 100).toFixed(2);
  const total     = subtotal + taxAmount;

  function updateLine(key: string, field: string, raw: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, [field]: raw };
        if (field === "quantity" || field === "unit_price") {
          updated.quantity   = field === "quantity"   ? Number(raw) : l.quantity;
          updated.unit_price = field === "unit_price" ? Number(raw) : l.unit_price;
          updated.amount = +(updated.quantity * updated.unit_price).toFixed(2);
        }
        return updated;
      })
    );
  }

  function submit(action: "draft" | "save") {
    if (!dueDate) { setError(t("invoices.builder.errors.dueDateRequired")); return; }
    const validLines = lines.filter((l) => l.description.trim());
    if (!validLines.length) { setError(t("invoices.builder.errors.noLineItems")); return; }
    setError(null);

    startTransition(async () => {
      try {
        const id = await createInvoice({
          clientId: clientId || null,
          dueDate,
          taxRate: taxRate / 100,
          notes,
          lines: validLines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            amount: l.amount,
            coa_account_id: l.coa_account_id,
          })),
        });
        router.push(`/books/invoices/${id}`);
      } catch (e: unknown) {
        console.error("save invoice", e);
        setError(t("invoices.builder.errors.saveFailed"));
      }
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Header bar */}
        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700">{t("invoices.builder.title")}</h2>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Client + dates row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("invoices.builder.billTo")}</label>
              <div className="relative">
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-8"
                >
                  <option value="">{t("invoices.builder.noClient")}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || c.email || t("invoices.builder.unnamedClient")}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("invoices.builder.issueDate")}</label>
              <input
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                readOnly
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("invoices.builder.dueDate")}</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="grid grid-cols-[1fr_80px_110px_110px_36px] gap-2 mb-2">
              {(["description", "qty", "unitPrice", "amount"] as const).map((h) => (
                <span key={h} className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {t(`invoices.builder.columns.${h}`)}
                </span>
              ))}
              <span />
            </div>

            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.key} className="grid grid-cols-[1fr_80px_110px_110px_36px] gap-2 items-start">
                  <div className="space-y-1">
                    <input
                      type="text"
                      placeholder={t("invoices.builder.descriptionPlaceholder")}
                      value={line.description}
                      onChange={(e) => updateLine(line.key, "description", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    {revenueAccounts.length > 0 && (
                      <select
                        value={line.coa_account_id ?? ""}
                        onChange={(e) => updateLine(line.key, "coa_account_id", e.target.value)}
                        className="w-full border border-slate-100 rounded-lg px-3 py-1.5 text-xs text-slate-500 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">{t("invoices.builder.revenueAccountOptional")}</option>
                        {revenueAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, "quantity", e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unit_price}
                    onChange={(e) => updateLine(line.key, "unit_price", e.target.value)}
                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="0.00"
                  />
                  <div className="border border-slate-100 rounded-lg px-3 py-2 text-sm text-right bg-slate-50 text-slate-700 tabular-nums">
                    {money(line.amount)}
                  </div>
                  <button
                    onClick={() => setLines((p) => p.filter((l) => l.key !== line.key))}
                    disabled={lines.length === 1}
                    className="p-2 text-slate-400 hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors mt-0.5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setLines((p) => [...p, emptyLine()])}
              className="mt-3 flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t("invoices.builder.addLineItem")}
            </button>
          </div>

          {/* Totals + tax */}
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>{t("invoices.builder.subtotal")}</span>
                <span className="tabular-nums">{money(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span>{t("invoices.builder.tax")}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.25"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-16 border border-slate-200 rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
                <span className="tabular-nums">{money(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold text-slate-800 pt-2 border-t border-slate-200">
                <span>{t("invoices.builder.total")}</span>
                <span className="tabular-nums">{money(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("invoices.builder.notesOptional")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t("invoices.builder.notesPlaceholder")}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-4 py-2.5">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              onClick={() => router.back()}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              {t("common:actions.cancel")}
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => submit("draft")}
                disabled={isPending}
                className="px-5 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                {t("invoices.builder.saveAsDraft")}
              </button>
              <button
                onClick={() => submit("save")}
                disabled={isPending}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {isPending ? t("common:status.saving") : t("invoices.builder.createInvoice")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
