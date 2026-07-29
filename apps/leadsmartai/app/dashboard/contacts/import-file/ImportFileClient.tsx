"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * AI file-extract intake — three-step flow:
 *
 *   1. Pick / drop a PDF, image, or text file.
 *   2. Server extracts the contacts → preview table renders, every
 *      field editable, rows tagged with a "likely duplicate" badge if
 *      the dedup matcher flagged one.
 *   3. Click save → bulk insert through the shared ingestion pipeline.
 *
 * Why a full page (not a modal): the preview table is the meat of the
 * UX and edit ergonomics matter — scroll, focus, keyboard nav. A modal
 * would cap the visible row count and add nothing.
 *
 * Why preview is editable per-field (not just per-row): the AI is good
 * but not perfect, especially on phone formats and split-line addresses.
 * The agent fixes a few values inline and ships; the alternative is
 * "delete + re-add" which is friction the CSV path also lacks today.
 */

type ExtractedRow = {
  rowKey: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  address: string | null;
  notes: string | null;
  duplicateContactId: string | null;
  duplicateScore: number | null;
};

type Step = "pick" | "extracting" | "review" | "saving" | "done";

type DuplicateStrategy = "skip" | "merge" | "create_anyway";

type SaveResult = {
  inserted: number;
  merged: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
};

export default function ImportFileClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<"pdf" | "image" | "text" | null>(
    null,
  );
  const [jobId, setJobId] = useState<string | null>(null);
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [totalExtracted, setTotalExtracted] = useState(0);
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<DuplicateStrategy>("skip");
  const [error, setError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);

  const duplicateCount = useMemo(
    () => rows.filter((r) => r.duplicateContactId).length,
    [rows],
  );

  const updateField = useCallback(
    (rowKey: string, field: keyof ExtractedRow, value: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.rowKey === rowKey ? { ...r, [field]: value || null } : r,
        ),
      );
    },
    [],
  );

  const removeRow = useCallback((rowKey: string) => {
    setRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
  }, []);

  const addBlankRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      {
        rowKey: `new-${Date.now()}-${prev.length}`,
        name: null,
        email: null,
        phone: null,
        company: null,
        title: null,
        address: null,
        notes: null,
        duplicateContactId: null,
        duplicateScore: null,
      },
    ]);
  }, []);

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    setStep("extracting");

    try {
      let res: Response;
      const supa = createClient();
      if (supa) {
        // Upload the file straight to Storage first, then extract from there.
        // This bypasses Vercel's ~4.5 MB serverless request-body cap, which was
        // silently 413-ing larger PDFs/images on the old multipart path.
        const signRes = await fetch("/api/dashboard/contacts/import-file/sign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileName: file.name }),
        });
        const sign = await signRes.json().catch(() => ({}));
        if (!signRes.ok || !sign.ok) throw new Error(sign.error ?? "Upload failed");

        const up = await supa.storage
          .from(sign.bucket)
          .uploadToSignedUrl(sign.path, sign.token, file, {
            contentType: file.type || undefined,
          });
        if (up.error) throw new Error(up.error.message || "Upload failed");

        res = await fetch("/api/dashboard/contacts/import-file/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storagePath: sign.path, fileName: file.name, mime: file.type }),
        });
      } else {
        // Fallback (no public Supabase env): multipart, subject to the 4.5 MB cap.
        const form = new FormData();
        form.append("file", file);
        res = await fetch("/api/dashboard/contacts/import-file/extract", {
          method: "POST",
          body: form,
        });
      }

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Extraction failed");

      setJobId(body.jobId ?? null);
      setSourceKind(body.sourceKind ?? null);
      setRows(body.contacts ?? []);
      setTruncated(Boolean(body.truncated));
      setTotalExtracted(Number(body.totalExtracted ?? body.contacts?.length ?? 0));
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed");
      setStep("pick");
    }
  }

  async function handleSave() {
    if (rows.length === 0) {
      setError("Nothing to save");
      return;
    }
    setError(null);
    setStep("saving");
    try {
      const res = await fetch("/api/dashboard/contacts/import-file/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          duplicateStrategy,
          contacts: rows.map(({ rowKey: _k, duplicateContactId: _d, duplicateScore: _s, ...rest }) => {
            void _k; void _d; void _s;
            return rest;
          }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Save failed");
      setSaveResult({
        inserted: body.inserted ?? 0,
        merged: body.merged ?? 0,
        skipped: body.skipped ?? 0,
        errors: body.errors ?? 0,
        errorMessages: body.errorMessages ?? [],
      });
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setStep("review");
    }
  }

  function resetAll() {
    setStep("pick");
    setFileName(null);
    setSourceKind(null);
    setJobId(null);
    setRows([]);
    setTruncated(false);
    setTotalExtracted(0);
    setDuplicateStrategy("skip");
    setError(null);
    setSaveResult(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            AI Import from File
          </h1>
          <p className="text-sm text-gray-500">
            Upload a PDF, image, or text file. AI extracts contacts; you review
            and save.
          </p>
        </div>
        <Link
          href="/dashboard/contacts"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          &larr; Contacts
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {step === "pick" && (
        <DropZone
          fileRef={fileRef}
          onFile={handleFile}
        />
      )}

      {step === "extracting" && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            <span className="text-sm text-gray-700">
              Reading {fileName ?? "file"}...
            </span>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            This usually takes 5–30 seconds depending on file size.
          </p>
        </div>
      )}

      {step === "review" && (
        <ReviewTable
          rows={rows}
          fileName={fileName}
          sourceKind={sourceKind}
          duplicateCount={duplicateCount}
          duplicateStrategy={duplicateStrategy}
          truncated={truncated}
          totalExtracted={totalExtracted}
          setDuplicateStrategy={setDuplicateStrategy}
          updateField={updateField}
          removeRow={removeRow}
          addBlankRow={addBlankRow}
          onSave={handleSave}
          onCancel={resetAll}
        />
      )}

      {step === "saving" && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
            <span className="text-sm text-gray-700">
              Saving {rows.length} contact{rows.length === 1 ? "" : "s"}...
            </span>
          </div>
        </div>
      )}

      {step === "done" && saveResult && (
        <DoneSummary
          result={saveResult}
          onAnother={resetAll}
          onViewContacts={() => router.push("/dashboard/contacts")}
        />
      )}
    </div>
  );
}

function DropZone({
  fileRef,
  onFile,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      onClick={() => fileRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 transition ${
        dragOver
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 bg-gray-50/50 hover:border-blue-400 hover:bg-blue-50/30"
      }`}
    >
      <svg
        className="h-12 w-12 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
      <span className="mt-3 text-sm font-semibold text-gray-700">
        Drop a file here, or click to browse
      </span>
      <span className="mt-1 text-xs text-gray-500">
        PDF · JPEG / PNG / WEBP · TXT / VCF / MD &nbsp;·&nbsp; up to 20 MB
      </span>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,image/gif,text/plain,.txt,.vcf,.md"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ReviewTable(props: {
  rows: ExtractedRow[];
  fileName: string | null;
  sourceKind: "pdf" | "image" | "text" | null;
  duplicateCount: number;
  duplicateStrategy: DuplicateStrategy;
  truncated: boolean;
  totalExtracted: number;
  setDuplicateStrategy: (s: DuplicateStrategy) => void;
  updateField: (rowKey: string, field: keyof ExtractedRow, value: string) => void;
  removeRow: (rowKey: string) => void;
  addBlankRow: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const {
    rows,
    fileName,
    sourceKind,
    duplicateCount,
    duplicateStrategy,
    truncated,
    totalExtracted,
    setDuplicateStrategy,
    updateField,
    removeRow,
    addBlankRow,
    onSave,
    onCancel,
  } = props;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span>
            <span className="font-medium text-gray-900">{rows.length}</span>{" "}
            contact{rows.length === 1 ? "" : "s"} ready
          </span>
          <span className="text-gray-500">
            from {sourceKind?.toUpperCase() ?? "file"} ·{" "}
            <span className="font-medium">{fileName ?? "upload"}</span>
          </span>
          {duplicateCount > 0 && (
            <span className="rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-800 ring-1 ring-yellow-200">
              {duplicateCount} likely duplicate
              {duplicateCount === 1 ? "" : "s"}
            </span>
          )}
          {truncated && (
            <span className="text-xs text-gray-500">
              (showing first 100 of {totalExtracted})
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Phone</th>
              <th className="px-3 py-2.5">Company</th>
              <th className="px-3 py-2.5">Title</th>
              <th className="px-3 py-2.5">Address</th>
              <th className="px-3 py-2.5">Notes</th>
              <th className="px-3 py-2.5 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr
                key={r.rowKey}
                className={r.duplicateContactId ? "bg-yellow-50/40" : ""}
              >
                <td className="px-2 py-1.5 align-top">
                  <div className="flex flex-col gap-1">
                    <Cell
                      value={r.name}
                      onChange={(v) => updateField(r.rowKey, "name", v)}
                      placeholder="Full name"
                    />
                    {r.duplicateContactId && (
                      <span
                        className="inline-flex w-fit items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800"
                        title={`Match score ${r.duplicateScore?.toFixed(2) ?? "—"}`}
                      >
                        Likely duplicate
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5 align-top">
                  <Cell
                    value={r.email}
                    onChange={(v) => updateField(r.rowKey, "email", v)}
                    placeholder="email@example.com"
                    type="email"
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <Cell
                    value={r.phone}
                    onChange={(v) => updateField(r.rowKey, "phone", v)}
                    placeholder="(555) 555-5555"
                    type="tel"
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <Cell
                    value={r.company}
                    onChange={(v) => updateField(r.rowKey, "company", v)}
                    placeholder="Company"
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <Cell
                    value={r.title}
                    onChange={(v) => updateField(r.rowKey, "title", v)}
                    placeholder="Title"
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <Cell
                    value={r.address}
                    onChange={(v) => updateField(r.rowKey, "address", v)}
                    placeholder="Address"
                  />
                </td>
                <td className="px-2 py-1.5 align-top">
                  <Cell
                    value={r.notes}
                    onChange={(v) => updateField(r.rowKey, "notes", v)}
                    placeholder="Notes"
                  />
                </td>
                <td className="px-2 py-1.5 text-right align-top">
                  <button
                    type="button"
                    onClick={() => removeRow(r.rowKey)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Remove row"
                    aria-label="Remove row"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addBlankRow}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          + Add empty row
        </button>

        <div className="flex items-center gap-3 text-sm">
          <label className="text-gray-600">If duplicate:</label>
          <select
            value={duplicateStrategy}
            onChange={(e) =>
              setDuplicateStrategy(e.target.value as DuplicateStrategy)
            }
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="skip">Skip duplicates</option>
            <option value="merge">Merge into existing</option>
            <option value="create_anyway">Create anyway</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={rows.length === 0}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
        >
          Save {rows.length} contact{rows.length === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

function Cell({
  value,
  onChange,
  placeholder,
  type,
}: {
  value: string | null;
  onChange: (next: string) => void;
  placeholder: string;
  type?: "email" | "tel" | "text";
}) {
  return (
    <input
      type={type ?? "text"}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full min-w-[8rem] rounded-md border border-transparent bg-white px-2 py-1.5 text-sm hover:border-gray-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

function DoneSummary({
  result,
  onAnother,
  onViewContacts,
}: {
  result: SaveResult;
  onAnother: () => void;
  onViewContacts: () => void;
}) {
  const total =
    result.inserted + result.merged + result.skipped + result.errors;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-5 w-5 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Saved {result.inserted + result.merged} of {total} contacts
          </p>
          <p className="text-xs text-gray-500">
            {result.inserted} added · {result.merged} merged ·{" "}
            {result.skipped} skipped · {result.errors} error
            {result.errors === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {result.errorMessages.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 space-y-1">
          <p className="font-semibold">First errors:</p>
          {result.errorMessages.map((m, i) => (
            <p key={i}>· {m}</p>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onViewContacts}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          View Contacts
        </button>
        <button
          type="button"
          onClick={onAnother}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Import another
        </button>
      </div>
    </div>
  );
}
