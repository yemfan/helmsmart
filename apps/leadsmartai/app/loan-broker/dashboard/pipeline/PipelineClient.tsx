"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { showToast } from "@/components/ui/Toast";
import { intlLocale } from "@/lib/i18n/locale";

type Application = {
  id: string;
  borrower_name: string;
  borrower_email: string | null;
  borrower_phone: string | null;
  property_address: string | null;
  loan_amount: number | null;
  loan_type: string;
  loan_purpose: string;
  interest_rate: number | null;
  loan_term_years: number;
  pipeline_stage: string;
  source: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

const STAGES = [
  { value: "inquiry", label: "Inquiry" },
  { value: "pre_qualification", label: "Pre-Qualification" },
  { value: "application", label: "Application" },
  { value: "processing", label: "Processing" },
  { value: "underwriting", label: "Underwriting" },
  { value: "closing", label: "Closing" },
  { value: "funded", label: "Funded" },
];

const LOAN_TYPES = ["conventional", "FHA", "VA", "USDA", "jumbo"];
const LOAN_PURPOSES = ["purchase", "refinance", "cash_out"];

export default function PipelineClient() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [apps, setApps] = useState<Application[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Application | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addFields, setAddFields] = useState({ borrower_name: "", borrower_email: "", borrower_phone: "", property_address: "", loan_amount: "", loan_type: "conventional", loan_purpose: "purchase", notes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stageFilter) params.set("stage", stageFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/loan-broker/applications?${params}`);
      const body = await res.json();
      if (body.ok) {
        setApps(body.applications);
        setTotal(body.total);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [stageFilter, search]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => apps, [apps]);

  async function saveApp(id: string, patch: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/loan-broker/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to update");
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } as Application : a)));
      setSelected((prev) => (prev?.id === id ? { ...prev, ...patch } as Application : prev));
      showToast("Application updated.", "success");
    } catch (e: any) {
      showToast(e?.message ?? "Error saving.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function addApp() {
    setSaving(true);
    try {
      const res = await fetch("/api/loan-broker/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addFields,
          loan_amount: addFields.loan_amount ? Number(addFields.loan_amount) : null,
        }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error);
      setShowAdd(false);
      setAddFields({ borrower_name: "", borrower_email: "", borrower_phone: "", property_address: "", loan_amount: "", loan_type: "conventional", loan_purpose: "purchase", notes: "" });
      showToast("Borrower added.", "success");
      load();
    } catch (e: any) {
      showToast(e?.message ?? "Error adding borrower.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t("pages.loanBroker.pipelineTitle")}</h1>
          <p className="text-sm text-gray-500">{t("pages.loanBrokerPipeline.applications", { count: total })}</p>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          {showAdd ? t("common:actions.cancel") : "+ Add Borrower"}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={addFields.borrower_name} onChange={(e) => setAddFields((f) => ({ ...f, borrower_name: e.target.value }))} placeholder="Borrower name *" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input value={addFields.borrower_email} onChange={(e) => setAddFields((f) => ({ ...f, borrower_email: e.target.value }))} placeholder={t("pages.loanBroker.email")} type="email" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input value={addFields.borrower_phone} onChange={(e) => setAddFields((f) => ({ ...f, borrower_phone: e.target.value }))} placeholder={t("pages.loanBroker.phone")} type="tel" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input value={addFields.property_address} onChange={(e) => setAddFields((f) => ({ ...f, property_address: e.target.value }))} placeholder={t("pages.loanBroker.propertyAddress")} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input value={addFields.loan_amount} onChange={(e) => setAddFields((f) => ({ ...f, loan_amount: e.target.value }))} placeholder={t("pages.loanBroker.loanAmountField")} type="number" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <select value={addFields.loan_type} onChange={(e) => setAddFields((f) => ({ ...f, loan_type: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white">
              {LOAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button onClick={addApp} disabled={!addFields.borrower_name.trim() || saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? t("common:status.adding") : t("pages.pipeline.addBorrower")}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("pages.loanBroker.searchPlaceholder")} className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">{t("pages.loanBroker.allStages")}</option>
          {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">{t("pages.loanBroker.borrower")}</th>
                <th className="text-right px-4 py-3 font-medium">{t("pages.loanBroker.loanAmount")}</th>
                <th className="text-left px-4 py-3 font-medium">{t("pages.loanBroker.type")}</th>
                <th className="text-left px-4 py-3 font-medium">{t("pages.loanBroker.purpose")}</th>
                <th className="text-left px-4 py-3 font-medium">{t("pages.loanBroker.stage")}</th>
                <th className="text-left px-4 py-3 font-medium">{t("pages.loanBroker.source")}</th>
                <th className="text-left px-4 py-3 font-medium">{t("pages.loanBroker.created")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t("pages.loanBroker.loading")}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{t("pages.loanBroker.noApplicationsFound")}</td></tr>
              ) : filtered.map((a) => (
                <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(a)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{a.borrower_name}</p>
                    <p className="text-xs text-gray-500">{a.borrower_email ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    {a.loan_amount ? `$${Number(a.loan_amount).toLocaleString(locale)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{a.loan_type}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{a.loan_purpose?.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold bg-blue-50 text-blue-700 border-blue-200">
                      {STAGES.find((s) => s.value === a.pipeline_stage)?.label ?? a.pipeline_stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{(a.source ?? "manual").replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(a.created_at).toLocaleDateString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          app={selected}
          onClose={() => setSelected(null)}
          onSave={(patch) => saveApp(selected.id, patch)}
          saving={saving}
        />
      )}
    </div>
  );
}

function DetailPanel({ app, onClose, onSave, saving }: {
  app: Application;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [stage, setStage] = useState(app.pipeline_stage);
  const [notes, setNotes] = useState(app.notes ?? "");
  const [loanType, setLoanType] = useState(app.loan_type);
  const [loanPurpose, setLoanPurpose] = useState(app.loan_purpose);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full sm:w-[480px] bg-white shadow-xl border-l border-gray-200 p-5 overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{app.borrower_name}</h2>
            <p className="text-xs text-gray-500">{app.borrower_email ?? t("pages.pipeline.noEmail")} · {app.borrower_phone ?? t("pages.pipeline.noPhone")}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">✕</button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-1">
            <p><span className="text-gray-500">{t("pages.loanBroker.loanAmountLabel")}</span> <span className="font-semibold">{app.loan_amount ? `$${Number(app.loan_amount).toLocaleString(locale)}` : "—"}</span></p>
            <p><span className="text-gray-500">{t("pages.loanBroker.propertyLabel")}</span> {app.property_address ?? "—"}</p>
            <p><span className="text-gray-500">{t("pages.loanBroker.rateLabel")}</span> {app.interest_rate ? `${app.interest_rate}%` : "—"}</p>
            <p><span className="text-gray-500">{t("pages.loanBroker.termLabel")}</span>{" "}
            {t("pages.loanBrokerPipeline.termYears", { count: app.loan_term_years })}</p>
            <p><span className="text-gray-500">{t("pages.loanBroker.sourceLabel")}</span> {(app.source ?? "manual").replace(/_/g, " ")}</p>
            <p><span className="text-gray-500">{t("pages.loanBroker.createdLabel")}</span> {new Date(app.created_at).toLocaleString(locale)}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t("pages.loanBroker.stage")}</label>
            <select value={stage} onChange={(e) => setStage(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t("pages.loanBroker.loanType")}</label>
              <select value={loanType} onChange={(e) => setLoanType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {LOAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t("pages.loanBroker.purpose")}</label>
              <select value={loanPurpose} onChange={(e) => setLoanPurpose(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                {LOAN_PURPOSES.map((p) => <option key={p} value={p}>{p.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t("pages.loanBroker.notes")}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          <button
            onClick={() => onSave({ pipeline_stage: stage, notes, loan_type: loanType, loan_purpose: loanPurpose })}
            disabled={saving}
            className="w-full bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? t("common:status.saving") : t("common:actions.save_changes")}
          </button>
        </div>
      </div>
    </div>
  );
}

