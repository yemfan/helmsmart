"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

type ImportResult = {
  insertedProperties: number;
  updatedProperties: number;
  insertedSnapshots: number;
  skippedSnapshots: number;
  skippedRows: number;
  errors: Array<{ row: number; error: string }>;
};

export default function MlsCsvImportClient() {
  const { t } = useTranslation("dashboard");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleUpload() {
    setError(null);
    setResult(null);

    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import-mls-csv", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error ?? "MLS import failed.");
      }

      setResult(json.result as ImportResult);
    } catch (e: any) {
      setError(e?.message ?? "MLS import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-brand-text">{t("pages.mlsImport.title")}</div>
      <p className="text-xs text-brand-text/80">
        Upload an MLS export (sold + active listings). We’ll upsert properties and
        store sold prices as “sold” snapshots for comps and valuation tools.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-slate-700"
          />
          <button
            type="button"
            onClick={handleUpload}
            disabled={loading}
            className="inline-flex items-center justify-center bg-brand-primary text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#005ca8] disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {loading ? "Importing..." : "Upload MLS CSV"}
          </button>
        </div>

        {error ? (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="text-xs text-gray-700 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="font-semibold">{t("pages.mlsImport.added")}</span>{" "}
                {result.insertedProperties}
              </div>
              <div>
                <span className="font-semibold">{t("pages.mlsImport.updated")}</span>{" "}
                {result.updatedProperties}
              </div>
              <div>
                <span className="font-semibold">{t("pages.mlsImport.soldInserted")}</span>{" "}
                {result.insertedSnapshots}
              </div>
              <div>
                <span className="font-semibold">{t("pages.mlsImport.soldSkipped")}</span>{" "}
                {result.skippedSnapshots}
              </div>
            </div>

            {result.skippedRows ? (
              <div>
                <span className="font-semibold">{t("pages.mlsImport.skippedRows")}</span>{" "}
                {result.skippedRows}
              </div>
            ) : null}

            {result.errors?.length ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-gray-500">
                  Show import errors ({result.errors.length})
                </summary>
                <div className="mt-2 overflow-auto max-h-48 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <pre className="text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(result.errors.slice(0, 50), null, 2)}
                  </pre>
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

