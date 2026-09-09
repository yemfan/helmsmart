"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Plus, X, AlertCircle, Building2, Pencil, Trash2, FileText } from "lucide-react";
import { moneyFormatter } from "@/lib/books-format";
import { createVendor, updateVendor, deleteVendor, type VendorWithSpend } from "@/lib/actions/vendors";

// ─── Add / edit modal ───────────────────────────────────────────────────────────

function VendorModal({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: VendorWithSpend | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("books");
  const editing = !!vendor;
  const [name, setName]   = useState(vendor?.name ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const [is1099, setIs1099] = useState(vendor?.is_1099 ?? false);
  const [error, setError] = useState("");
  const [isPending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(t("vendors.errors.nameRequired")); return; }
    setError("");
    start(async () => {
      try {
        const payload = {
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
          is1099,
        };
        if (editing) await updateVendor(vendor!.id, payload);
        else await createVendor(payload);
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("vendors.errors.saveFailed"));
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />
            <h2 className="text-base font-semibold text-slate-800">
              {editing ? t("vendors.form.editTitle") : t("vendors.form.newTitle")}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <p className="text-xs text-rose-600 flex items-center gap-1" role="alert"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("vendors.form.name")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("vendors.form.namePlaceholder")} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <p className="text-[11px] text-slate-400 mt-1">{t("vendors.form.nameHint")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("vendors.form.email")}</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="billing@acme.com" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t("vendors.form.phone")}</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t("vendors.form.notes")}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t("vendors.form.notesPlaceholder")} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" checked={is1099} onChange={(e) => setIs1099(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
          {t("vendors.form.is1099")}
          <span className="text-xs text-slate-400">{t("vendors.form.is1099Hint")}</span>
        </label>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">{t("common:actions.cancel")}</button>
          <button type="submit" disabled={isPending} className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {isPending
              ? t("common:status.saving")
              : editing
                ? t("common:actions.save_changes")
                : t("vendors.form.add")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Row ───────────────────────────────────────────────────────────────────────

function VendorRow({
  vendor,
  currency,
  onEdit,
  onDeleted,
}: {
  vendor: VendorWithSpend;
  currency: string;
  onEdit: (v: VendorWithSpend) => void;
  onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation("books");
  const fmt = moneyFormatter(i18n.language, currency, { maximumFractionDigits: 0 });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, start] = useTransition();

  function del() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    start(async () => {
      await deleteVendor(vendor.id);
      onDeleted();
    });
  }

  const contact = [vendor.email, vendor.phone].filter(Boolean).join(" · ");

  return (
    <div className="grid grid-cols-[1.7fr_60px_1fr_1fr_1fr_64px] gap-3 px-5 py-3.5 items-center group">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-800 truncate">{vendor.name}</p>
          {vendor.is_1099 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 flex-shrink-0">1099</span>
          )}
        </div>
        {contact && <p className="text-xs text-slate-400 truncate">{contact}</p>}
      </div>
      <span className="text-sm text-slate-500 text-right tabular-nums">{vendor.billCount}</span>
      <span className="text-sm text-slate-600 text-right tabular-nums">{vendor.totalBilled > 0 ? fmt(vendor.totalBilled) : "—"}</span>
      <span className="text-sm text-emerald-600 text-right tabular-nums">{vendor.totalPaid > 0 ? fmt(vendor.totalPaid) : "—"}</span>
      <span className={`text-sm text-right tabular-nums ${vendor.openAmount > 0 ? "text-amber-600 font-medium" : "text-slate-300"}`}>
        {vendor.openAmount > 0 ? fmt(vendor.openAmount) : "—"}
      </span>
      <div className="flex items-center justify-end gap-1">
        <button onClick={() => onEdit(vendor)} disabled={isPending} title={t("common:actions.edit")} className="p-1.5 text-slate-300 hover:text-indigo-500 transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={del}
          disabled={isPending}
          title={t("common:actions.delete")}
          className={`text-xs px-2 py-1 rounded-lg transition-colors ${
            confirmDelete ? "bg-rose-100 text-rose-700 hover:bg-rose-200" : "text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"
          }`}
        >
          {confirmDelete ? t("vendors.row.confirmDelete") : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────────

export function VendorsClient({
  initialVendors,
  currency,
}: {
  initialVendors: VendorWithSpend[];
  currency: string;
}) {
  const { t, i18n } = useTranslation("books");
  const fmt = moneyFormatter(i18n.language, currency, { maximumFractionDigits: 0 });
  const router = useRouter();
  const [showNew, setShowNew]       = useState(false);
  const [editTarget, setEditTarget] = useState<VendorWithSpend | null>(null);

  function refresh() {
    setShowNew(false);
    setEditTarget(null);
    router.refresh();
  }

  const totalPaid = initialVendors.reduce((s, v) => s + v.totalPaid, 0);
  const totalOpen = initialVendors.reduce((s, v) => s + v.openAmount, 0);

  // Whole phrases joined by punctuation — never a sentence built from halves.
  const facts = [t("vendors.list.vendorCount", { count: initialVendors.length })];
  if (totalPaid > 0) facts.push(t("vendors.list.paidAmount", { amount: fmt(totalPaid) }));
  if (totalOpen > 0) facts.push(t("vendors.list.openAmount", { amount: fmt(totalOpen) }));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-800">{t("vendors.list.title")}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{facts.join(" · ")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/books/vendors/1099"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-700 transition-colors"
          >
            <FileText className="w-4 h-4" />
            {t("vendors.list.report1099")}
          </Link>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("vendors.list.newVendor")}
          </button>
        </div>
      </div>

      {initialVendors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl">
          <Building2 className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500 mb-1">{t("vendors.list.empty.title")}</p>
          <p className="text-xs text-slate-400 mb-4 max-w-sm">{t("vendors.list.empty.body")}</p>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" />
            {t("vendors.list.empty.cta")}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-[1.7fr_60px_1fr_1fr_1fr_64px] gap-3 px-5 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
            <span>{t("vendors.list.columns.vendor")}</span>
            <span className="text-right">{t("vendors.list.columns.bills")}</span>
            <span className="text-right">{t("vendors.list.columns.billed")}</span>
            <span className="text-right">{t("vendors.list.columns.paid")}</span>
            <span className="text-right">{t("vendors.list.columns.open")}</span>
            <span />
          </div>
          <div className="divide-y divide-slate-50">
            {initialVendors.map((v) => (
              <VendorRow key={v.id} vendor={v} currency={currency} onEdit={setEditTarget} onDeleted={refresh} />
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-4">{t("vendors.list.footnote")}</p>

      {showNew && <VendorModal vendor={null} onClose={() => setShowNew(false)} onSaved={refresh} />}
      {editTarget && <VendorModal vendor={editTarget} onClose={() => setEditTarget(null)} onSaved={refresh} />}
    </div>
  );
}
