"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { autoMapHeaders } from "@/lib/contact-intake/autoMap";

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

/** Fields the user can map, with friendly labels. Order = display order. */
const MAP_FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: "name", label: "Full name" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "source", label: "Lead source" },
  { key: "lead_type", label: "Type (buyer/seller/renter)" },
  { key: "search_location", label: "Area of interest" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "price_min", label: "Budget min" },
  { key: "price_max", label: "Budget max" },
  { key: "beds", label: "Beds" },
  { key: "baths", label: "Baths" },
  { key: "timeline", label: "Timeline" },
  { key: "property_address", label: "Property address" },
  { key: "tags", label: "Tags" },
  { key: "notes", label: "Notes" },
];

export function ImportWizardClient() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>(emptyMapping());
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
      setMapping((m) => ({ ...m, ...autoMapHeaders(hdrs) }));
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
          ← Back to leads
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">Import contacts (CSV)</h1>
        <p className="text-sm text-gray-600">
          Upload a spreadsheet, map columns, preview duplicates, then finalize. Uses the same normalization, dedupe,
          enrichment, and CRM save path as manual entry.
        </p>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}

      {step === 1 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">1. Upload CSV</h2>
          <p className="mt-1 text-sm text-gray-600">First row must be headers (e.g. Name, Email, Phone).</p>
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
              {loading ? "Uploading..." : "Click to upload or drag and drop"}
            </span>
            <span className="mt-1 text-xs text-gray-500">CSV files only</span>
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
          <h2 className="text-base font-semibold text-gray-900">2. Column mapping</h2>
          <p className="mt-1 text-sm text-gray-600">{rowCount.toLocaleString()} rows · job {jobId}</p>
          <p className="mt-1 text-xs text-gray-500">
            We auto-detected the mapping from your headers (BoldTrail, Follow Up Boss,
            kvCORE, etc.) — review and adjust below. Anything left as “ignore” is skipped.
            Only a name (full, or first + last) plus email or phone is required.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {MAP_FIELDS.map(({ key, label }) => (
              <label key={key} className="block text-sm">
                <span className="font-medium text-gray-700">{label}</span>
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
                  value={mapping[key]}
                  onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                >
                  <option value="">— ignore —</option>
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
            <span className="text-sm font-medium text-gray-700">Duplicate handling</span>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dup"
                  checked={dupStrategy === "skip"}
                  onChange={() => setDupStrategy("skip")}
                />
                Skip likely duplicates
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dup"
                  checked={dupStrategy === "merge"}
                  onChange={() => setDupStrategy("merge")}
                />
                Merge into existing
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="dup"
                  checked={dupStrategy === "create_anyway"}
                  onChange={() => setDupStrategy("create_anyway")}
                />
                Create new rows anyway
              </label>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            onClick={() => void runPreview()}
          >
            Preview
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">3. Preview (first 100 rows)</h2>
          {stats ? (
            <p className="mt-1 text-sm text-gray-600">
              {stats.total} rows · {stats.likelyDuplicates} likely duplicates (by email/phone/address rules)
            </p>
          ) : null}
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="px-2 py-1">#</th>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Email</th>
                  <th className="px-2 py-1">Phone</th>
                  <th className="px-2 py-1">Dup?</th>
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
          >
            Run import
          </button>
        </section>
      )}

      {step === 4 && summary && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">4. Summary</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">
            <li>Inserted: {summary.inserted}</li>
            <li>Merged: {summary.merged}</li>
            <li>Skipped: {summary.skipped}</li>
            <li>Errors: {summary.errors}</li>
          </ul>
          <Link href="/dashboard/leads" className="mt-4 inline-block text-sm font-medium text-gray-900 underline">
            View leads
          </Link>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Import history</h2>
          <button type="button" className="text-sm text-gray-600 hover:text-gray-900" onClick={() => void loadHistory()}>
            Refresh
          </button>
        </div>
        <ul className="mt-3 divide-y divide-gray-100 text-sm">
          {history.length === 0 ? <li className="py-2 text-gray-500">No imports yet.</li> : null}
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
