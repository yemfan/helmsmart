"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { autoMapHeaders, IMPORT_PRESETS, presetExtra } from "@/lib/contact-intake/autoMap";

type ColumnMapping = {
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  property_address: string;
  notes: string;
  source: string;
  lead_type: string;
  search_location: string;
  city: string;
  state: string;
  timeline: string;
  price_min: string;
  price_max: string;
  beds: string;
  baths: string;
  tags: string;
};

const emptyMapping = (): ColumnMapping => ({
  name: "",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  property_address: "",
  notes: "",
  source: "",
  lead_type: "",
  search_location: "",
  city: "",
  state: "",
  timeline: "",
  price_min: "",
  price_max: "",
  beds: "",
  baths: "",
  tags: "",
});

/**
 * Fields the user can map. Order = display order. The label is a translation
 * KEY rather than text — this list is module scope, so it cannot reach a hook.
 */
const MAP_FIELDS: { key: keyof ColumnMapping; labelKey: string }[] = [
  { key: "name", labelKey: "pages.importWizard.field.full_name" },
  { key: "first_name", labelKey: "pages.importWizard.field.first_name" },
  { key: "last_name", labelKey: "pages.importWizard.field.last_name" },
  { key: "email", labelKey: "pages.importWizard.field.email" },
  { key: "phone", labelKey: "pages.importWizard.field.phone" },
  { key: "source", labelKey: "pages.importWizard.field.lead_source" },
  { key: "lead_type", labelKey: "pages.importWizard.field.lead_type" },
  { key: "search_location", labelKey: "pages.importWizard.field.area_of_interest" },
  { key: "city", labelKey: "pages.importWizard.field.city" },
  { key: "state", labelKey: "pages.importWizard.field.state" },
  { key: "price_min", labelKey: "pages.importWizard.field.budget_min" },
  { key: "price_max", labelKey: "pages.importWizard.field.budget_max" },
  { key: "beds", labelKey: "pages.importWizard.field.beds" },
  { key: "baths", labelKey: "pages.importWizard.field.baths" },
  { key: "timeline", labelKey: "pages.importWizard.field.timeline" },
  { key: "property_address", labelKey: "pages.importWizard.field.property_address" },
  { key: "tags", labelKey: "pages.importWizard.field.tags" },
  { key: "notes", labelKey: "pages.importWizard.field.notes" },
];

export function ImportWizardClient() {
  const { t } = useTranslation("dashboard");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping());
  const [preset, setPreset] = useState<string>("auto");
  const [dupStrategy, setDupStrategy] = useState<"skip" | "merge" | "create_anyway">("skip");
  const [preview, setPreview] = useState<
    Array<{
      row_index: number;
      normalized_payload: Record<string, string | null | undefined> | null;
      duplicate_contact_id: string | null;
      duplicate_confidence: number | null;
    }>
  >([]);
  const [stats, setStats] = useState<{ total: number; likelyDuplicates: number } | null>(null);
  const [summary, setSummary] = useState<{ inserted: number; merged: number; skipped: number; errors: number } | null>(
    null
  );
  const [history, setHistory] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/dashboard/contacts/import/history");
    const body = await res.json().catch(() => ({}));
    if (res.ok) setHistory(body.jobs ?? []);
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function onUpload(file: File) {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/dashboard/contacts/import/upload", {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Upload failed");
      setJobId(body.jobId);
      const hdrs: string[] = body.headers ?? [];
      setHeaders(hdrs);
      setRowCount(body.rowCount ?? 0);
      // Auto-detect the mapping from the headers (BoldTrail / Follow Up Boss /
      // kvCORE aliases). Pre-fills the wizard; the user can still adjust.
      setMapping({ ...emptyMapping(), ...autoMapHeaders(hdrs, presetExtra(preset)) });
      setStep(2);
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload error");
    } finally {
      setLoading(false);
    }
  }

  async function runPreview() {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/contacts/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          mapping: Object.fromEntries(
            (Object.keys(mapping) as (keyof ColumnMapping)[]).map((k) => [k, mapping[k] || null]),
          ),
          duplicateStrategy: dupStrategy,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Preview failed");
      setPreview(body.preview ?? []);
      setStats(body.stats ?? null);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview error");
    } finally {
      setLoading(false);
    }
  }

  async function runFinalize() {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/contacts/import/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          duplicateStrategy: dupStrategy,
          enrichRows: false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Import failed");
      setSummary(body.summary ?? null);
      setStep(4);
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Finalize error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div>
        <Link href="/dashboard/leads" className="text-sm font-medium text-gray-600 hover:text-gray-900">
          {t("pages.importWizard.backToLeads")}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{t("pages.importWizard.heading")}</h1>
        <p className="text-sm text-gray-600">{t("pages.importWizard.sub")}</p>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      {step === 1 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">{t("pages.importWizard.step1")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("pages.importWizard.step1Hint")}</p>
          <label
            className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition ${
              loading
                ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                : "border-gray-300 bg-gray-50/50 hover:border-blue-400 hover:bg-blue-50/30"
            }`}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const f = e.dataTransfer.files?.[0];
              if (f && !loading) void onUpload(f);
            }}
          >
            <svg className="h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <span className="mt-3 text-sm font-semibold text-gray-700">
              {loading ? t("pages.importWizard.uploading") : t("pages.importWizard.dropzone")}
            </span>
            <span className="mt-1 text-xs text-gray-500">{t("pages.importWizard.csvOnly")}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={loading}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
            />
          </label>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">{t("pages.importWizard.step2")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("pages.importWizard.rowsJob", { rows: rowCount.toLocaleString(), job: jobId })}</p>
          <label className="mt-3 block text-sm">
            <span className="font-medium text-gray-700">{t("pages.importWizard.importingFrom")}</span>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm sm:w-64"
              value={preset}
              onChange={(e) => {
                const key = e.target.value;
                setPreset(key);
                // Re-run auto-map tuned to the chosen CRM; user edits still overridable.
                setMapping({ ...emptyMapping(), ...autoMapHeaders(headers, presetExtra(key)) });
              }}
            >
              {IMPORT_PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-gray-500">
            {t("pages.importWizard.autoDetect")}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {MAP_FIELDS.map(({ key, labelKey }) => (
              <label key={key} className="block text-sm">
                <span className="font-medium text-gray-700">{t(labelKey)}</span>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
                  value={mapping[key]}
                  onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                >
                  <option value="">{t("pages.importWizard.ignore")}</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-4">
            <span className="text-sm font-medium text-gray-700">{t("pages.importWizard.duplicateHandling")}</span>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dup"
                  checked={dupStrategy === "skip"}
                  onChange={() => setDupStrategy("skip")}
                />{t("pages.importWizard.skipDupes")}</label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dup"
                  checked={dupStrategy === "merge"}
                  onChange={() => setDupStrategy("merge")}
                />{t("pages.importWizard.mergeExisting")}</label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dup"
                  checked={dupStrategy === "create_anyway"}
                  onChange={() => setDupStrategy("create_anyway")}
                />{t("pages.importWizard.createAnyway")}</label>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            onClick={() => void runPreview()}
          >{t("pages.importWizard.preview")}</button>
        </section>
      )}

      {step === 3 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">{t("pages.importWizard.step3")}</h2>
          {stats ? (
            <p className="mt-1 text-sm text-gray-600">
              {t("pages.importWizard.rowsAndDupes", { total: stats.total, dupes: stats.likelyDuplicates })}
            </p>
          ) : null}
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="px-2 py-1">#</th>
                  <th className="px-2 py-1">{t("pages.importWizard.colName")}</th>
                  <th className="px-2 py-1">{t("pages.importWizard.colEmail")}</th>
                  <th className="px-2 py-1">{t("pages.importWizard.colPhone")}</th>
                  <th className="px-2 py-1">{t("pages.importWizard.colDup")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.row_index} className="border-t border-gray-100">
                    <td className="px-2 py-1">{p.row_index}</td>
                    <td className="px-2 py-1">{String(p.normalized_payload?.name ?? "")}</td>
                    <td className="px-2 py-1">{String(p.normalized_payload?.email ?? "")}</td>
                    <td className="px-2 py-1">{String(p.normalized_payload?.phone ?? "")}</td>
                    <td className="px-2 py-1">
                      {p.duplicate_contact_id ? `Yes (${p.duplicate_confidence ?? ""})` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            disabled={loading}
            className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            onClick={() => void runFinalize()}
          >{t("pages.importWizard.runImport")}</button>
        </section>
      )}

      {step === 4 && summary && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">{t("pages.importWizard.step4")}</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">
            <li>{t("pages.importWizard.inserted", { count: summary.inserted })}</li>
            <li>{t("pages.importWizard.merged", { count: summary.merged })}</li>
            <li>{t("pages.importWizard.skipped", { count: summary.skipped })}</li>
            <li>{t("pages.importWizard.errors", { count: summary.errors })}</li>
          </ul>
          <Link href="/dashboard/leads" className="mt-4 inline-block text-sm font-medium text-gray-900 underline">{t("pages.importWizard.viewLeads")}</Link>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{t("pages.importWizard.history")}</h2>
          <button type="button" className="text-sm text-gray-600 hover:text-gray-900" onClick={() => void loadHistory()}>{t("pages.importWizard.refresh")}</button>
        </div>
        <ul className="mt-3 divide-y divide-gray-100 text-sm">
          {history.length === 0 ? <li className="py-2 text-gray-500">{t("pages.importWizard.noImports")}</li> : null}
          {(history as Array<Record<string, unknown>>).map((j) => (
            <li key={String(j.id)} className="py-2 flex flex-wrap justify-between gap-2">
              <span className="text-gray-800">{String(j.file_name ?? j.intake_channel ?? "job")}</span>
              <span className="text-gray-500">{String(j.status ?? "")}</span>
              <span className="text-gray-400 text-xs w-full">
                {j.created_at ? new Date(String(j.created_at)).toLocaleString() : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
