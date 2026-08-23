"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type ImportResult = {
  jobId: string;
  headers: string[];
  rowCount: number;
};

export function CsvImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
    setFileName(null);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Please select a CSV file.");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/dashboard/contacts/import/upload", {
        method: "POST",
        body: form,
      });

      const body = await res.json();

      if (!res.ok || !body.ok) {
        throw new Error(body.error || "Upload failed");
      }

      setResult({
        jobId: body.jobId,
        headers: body.headers,
        rowCount: body.rowCount,
      });
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{t("pages.csvImport.title")}</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-gray-600">{t("pages.csvImport.sub")}</p>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className="cursor-pointer block"
                >
                  <div className="text-gray-400 text-3xl mb-2">+</div>
                  <p className="text-sm font-medium text-gray-700">
                    {fileName || t("pages.csvImport.clickToSelectA")}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">{t("pages.csvImport.limits")}</p>
                </label>
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >{t("pages.csvImport.cancel")}</button>
                <button
                  onClick={handleUpload}
                  disabled={uploading || !fileName}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? t("common:status.uploading") : t("pages.csvImport.uploadImport")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                <p className="text-sm font-semibold text-green-800">{t("pages.csvImport.started")}</p>
                <p className="text-sm text-green-700 mt-1">
                  {result.rowCount} contact{result.rowCount !== 1 ? "s" : ""} {t("pages.dashFragments.beingProcessed")}</p>
                <p className="text-xs text-green-600 mt-2">{t("pages.dashFragments.detectedColumns")} {result.headers.join(", ")}
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    handleClose();
                    onImported();
                  }}
                  className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
                >{t("pages.csvImport.done")}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
