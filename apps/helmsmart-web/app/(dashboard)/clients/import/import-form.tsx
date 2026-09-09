"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

type Status = "lead" | "prospect" | "active" | "inactive";

interface ParsedRow {
  first_name: string;
  last_name: string;
  company: string;
  email: string;
  phone: string;
  status: Status;
  tags: string;
  notes: string;
  _valid: boolean;
}

// ─── CSV parser (no external deps) ───────────────────────────────────────────

function parseCsv(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        if (ch === "\r") i++;
        row.push(cell); cell = "";
        if (row.some((c) => c !== "")) lines.push(row);
        row = [];
      } else cell += ch;
    }
  }
  if (cell || row.length) { row.push(cell); if (row.some((c) => c !== "")) lines.push(row); }
  return lines;
}

function parseRows(text: string): ParsedRow[] {
  const lines = parseCsv(text);
  if (lines.length < 2) return [];

  // Normalise header names
  const headers = lines[0].map((h) => h.toLowerCase().trim().replace(/\s+/g, "_"));

  const col = (row: string[], name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] ?? "").trim() : "";
  };

  const VALID_STATUSES = ["lead", "prospect", "active", "inactive"];

  return lines.slice(1).map((row) => {
    const firstName = col(row, "first_name");
    const company   = col(row, "company");
    const statusRaw = col(row, "status").toLowerCase();
    const valid = !!(firstName || company);
    return {
      first_name: firstName,
      last_name:  col(row, "last_name"),
      company,
      email:      col(row, "email"),
      phone:      col(row, "phone"),
      status:     (VALID_STATUSES.includes(statusRaw) ? statusRaw : "lead") as Status,
      tags:       col(row, "tags"),
      notes:      col(row, "notes"),
      _valid:     valid,
    };
  });
}

// ─── AI-extracted contact → preview row ───────────────────────────────────────

type ExtractedContact = {
  first_name: string;
  last_name: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
};

function toRow(c: ExtractedContact): ParsedRow {
  const valid = !!(c.first_name || c.company);
  return {
    first_name: c.first_name,
    last_name: c.last_name,
    company: c.company,
    email: c.email,
    phone: c.phone,
    status: "lead",
    tags: "",
    notes: c.notes,
    _valid: valid,
  };
}

// ─── Template download ────────────────────────────────────────────────────────

function downloadTemplate() {
  const csv = `first_name,last_name,company,email,phone,status,tags,notes
Jane,Smith,Acme Corp,jane@acme.com,555-0100,active,"vip,enterprise",Key account
Bob,Jones,,bob@example.com,,lead,,Met at conference
,,,,,,,
`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "client_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ImportForm() {
  const router = useRouter();
  const { t } = useTranslation("clients");
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef  = useRef<HTMLInputElement>(null);
  const [rows, setRows]         = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult]     = useState<{ inserted: number; failed: number } | null>(null);
  const [error, setError]       = useState("");
  const [pending, start]        = useTransition();
  const [aiText, setAiText]       = useState("");
  const [aiImage, setAiImage]     = useState<File | null>(null);
  const [aiPending, setAiPending] = useState(false);

  function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRows(parseRows(text));
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) handleFile(file);
    else setError(t("import.errors.csvOnly"));
  }

  function handleImport() {
    const valid = rows.filter((r) => r._valid);
    if (valid.length === 0) { setError(t("import.errors.noValidRows")); return; }
    setError("");
    start(async () => {
      try {
        const res = await fetch("/api/clients/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: valid }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("import.errors.importFailed"));
        setResult({ inserted: data.inserted, failed: data.failed });
        if (data.inserted > 0) {
          setTimeout(() => router.push("/clients"), 1500);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("import.errors.importFailed"));
      }
    });
  }

  async function handleExtract() {
    setError("");
    setResult(null);
    setAiPending(true);
    try {
      const fd = new FormData();
      if (aiText.trim()) fd.append("text", aiText.trim());
      if (aiImage) fd.append("image", aiImage);
      const res = await fetch("/api/clients/extract", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("import.errors.extractFailed"));
      const mapped = ((data.contacts ?? []) as ExtractedContact[]).map(toRow);
      if (mapped.length === 0) { setError(t("import.errors.noContacts")); return; }
      setRows(mapped);
      setAiText("");
      setAiImage(null);
      setFileName(t("import.ai.fileLabel", { count: mapped.length }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("import.errors.extractFailed"));
    } finally {
      setAiPending(false);
    }
  }

  const validCount   = rows.filter((r) => r._valid).length;
  const invalidCount = rows.filter((r) => !r._valid).length;

  return (
    <div className="space-y-6">
      {/* Add with AI */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <p className="text-sm font-semibold text-slate-800">{t("import.ai.title")}</p>
        </div>
        <p className="text-xs text-slate-500">{t("import.ai.hint")}</p>
        <textarea
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          rows={4}
          placeholder={t("import.ai.placeholder")}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
        <div className="flex items-center gap-3">
          <input
            ref={imgRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setAiImage(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => imgRef.current?.click()}
            className="text-xs font-medium text-slate-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors max-w-[200px] truncate"
          >
            {aiImage ? aiImage.name : t("import.ai.uploadPhoto")}
          </button>
          <button
            type="button"
            onClick={handleExtract}
            disabled={aiPending || (!aiText.trim() && !aiImage)}
            className="ml-auto flex items-center gap-1.5 text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {aiPending ? t("common:status.analyzing") : t("import.ai.extract")}
          </button>
        </div>
      </div>

      {/* Instructions + template */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex items-start gap-4">
        <FileSpreadsheet className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-indigo-800 mb-1">{t("import.csv.title")}</p>
          <p className="text-xs text-indigo-700 leading-relaxed">
            {t("import.csv.required")} <code className="bg-indigo-100 px-1 rounded">first_name</code> {t("import.csv.or")} <code className="bg-indigo-100 px-1 rounded">company</code>.
            {" "}{t("import.csv.optional")} <code className="bg-indigo-100 px-1 rounded">last_name</code>, <code className="bg-indigo-100 px-1 rounded">email</code>, <code className="bg-indigo-100 px-1 rounded">phone</code>, <code className="bg-indigo-100 px-1 rounded">status</code> {t("import.csv.statusValues")}, <code className="bg-indigo-100 px-1 rounded">tags</code> {t("import.csv.tagsHint")}, <code className="bg-indigo-100 px-1 rounded">notes</code>.
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="text-xs font-medium text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap"
        >
          {t("import.csv.downloadTemplate")}
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        {fileName ? (
          <p className="text-sm font-medium text-slate-700">{fileName}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-600">{t("import.drop.hint")}</p>
            <p className="text-xs text-slate-400 mt-1">{t("import.drop.limits")}</p>
          </>
        )}
      </div>

      {/* Preview table */}
      {rows.length > 0 && !result && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-slate-800">{t("import.preview.title")}</h2>
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                {t("import.preview.valid", { n: validCount })}
              </span>
              {invalidCount > 0 && (
                <span className="text-xs text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full font-medium">
                  {t("import.preview.willSkip", { n: invalidCount })}
                </span>
              )}
            </div>
            <button onClick={() => { setRows([]); setFileName(""); }} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["", "firstName", "lastName", "company", "email", "phone", "status", "tags"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h ? t(`import.preview.columns.${h}`) : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.slice(0, 50).map((row, i) => (
                  <tr key={i} className={row._valid ? "" : "bg-rose-50/40"}>
                    <td className="px-3 py-2">
                      {row._valid
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        : <span title={t("import.preview.rowError")}><AlertCircle className="w-3.5 h-3.5 text-rose-500" /></span>
                      }
                    </td>
                    <td className="px-3 py-2 text-slate-800">{row.first_name || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{row.last_name || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{row.company || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{row.email || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{row.phone || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{t(`statuses.${row.status}`)}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate">{row.tags || <span className="text-slate-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && (
              <p className="text-xs text-slate-400 text-center py-3">
                {t("import.preview.showing", { n: rows.length })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Result banner */}
      {result && (
        <div className={`flex items-center gap-3 px-5 py-4 rounded-xl border ${result.failed === 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${result.failed === 0 ? "text-emerald-500" : "text-amber-500"}`} />
          <div>
            <p className={`text-sm font-semibold ${result.failed === 0 ? "text-emerald-800" : "text-amber-800"}`}>
              {t("import.result.imported", { count: result.inserted })}
              {result.failed > 0 && t("import.result.failedSuffix", { n: result.failed })}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{t("import.result.redirecting")}</p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-4 py-3">{error}</p>
      )}

      {/* Actions */}
      {rows.length > 0 && !result && (
        <div className="flex gap-3">
          <button
            onClick={() => { setRows([]); setFileName(""); setError(""); }}
            disabled={pending}
            className="flex-1 py-3 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            {t("import.actions.clear")}
          </button>
          <button
            onClick={handleImport}
            disabled={pending || validCount === 0}
            className="flex-1 py-3 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {pending
              ? t("import.actions.importing", { count: validCount })
              : t("import.actions.import", { count: validCount })}
          </button>
        </div>
      )}
    </div>
  );
}
