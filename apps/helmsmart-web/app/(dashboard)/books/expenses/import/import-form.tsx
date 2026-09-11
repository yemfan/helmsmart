"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { EXPENSE_HEADER_ALIASES, canonicalHeaders } from "@/lib/csv-headers";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X } from "lucide-react";
import { moneyFormatter } from "@/lib/books-format";

/**
 * Why the row error is a KEY, not a sentence.
 *
 * `parseRows` runs at module scope, outside any component, so it has no `t`.
 * It records WHICH rule the row broke; the table translates that at render.
 */
type RowErrorKey =
  | "dateRequired"
  | "amountRequired"
  | "amountNotNumber"
  | "amountNotPositive"
  | "descriptionRequired";

interface ParsedRow {
  date: string;
  amount: string;
  description: string;
  category: string;
  _valid: boolean;
  _errorKey?: RowErrorKey;
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

  // These are COLUMN NAMES the parser matches on — spreadsheet input, never
  // copy. English or Spanish, compared without case or accents; the names each
  // column answers to are in lib/csv-headers.ts.
  const headers = canonicalHeaders(lines[0], EXPENSE_HEADER_ALIASES);

  const col = (row: string[], name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] ?? "").trim() : "";
  };

  return lines.slice(1).map((row) => {
    const date = col(row, "date");
    const amount = col(row, "amount");
    const description = col(row, "description") || col(row, "vendor_name") || col(row, "vendor");
    const category = col(row, "category") || "";

    const valid = !!(date && amount && description && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0);
    return {
      date,
      amount,
      description,
      category,
      _valid: valid,
      _errorKey: valid ? undefined :
        !date ? "dateRequired" as const :
        !amount ? "amountRequired" as const :
        isNaN(parseFloat(amount)) ? "amountNotNumber" as const :
        parseFloat(amount) <= 0 ? "amountNotPositive" as const :
        "descriptionRequired" as const,
    };
  });
}

// ─── Template download ────────────────────────────────────────────────────────

/**
 * The template is PARSER INPUT, not copy: the header row is what `parseRows`
 * matches on and the `category` column has to hold the English account hints
 * `findBestAccount` looks up, so the file stays English in every locale.
 */
function downloadTemplate() {
  const csv = `date,amount,description,category
2025-06-01,85.50,Office supplies at Staples,Office Supplies
2025-06-02,42.00,Lunch meeting with client,Meals & Entertainment
2025-06-03,120.00,Software subscription renewal,Dues & Subscriptions
`;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "expense_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 50;
const COLUMNS = ["date", "amount", "description", "category"] as const;

export function ImportForm({ currency = "USD" }: { currency?: string }) {
  const router = useRouter();
  const { t, i18n } = useTranslation("books");
  const fmt = moneyFormatter(i18n.language, currency);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]         = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult]     = useState<{ inserted: number; failed: number } | null>(null);
  const [error, setError]       = useState("");
  const [pending, start]        = useTransition();

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
    else setError(t("expenses.import.csv.notCsv"));
  }

  function handleImport() {
    const valid = rows.filter((r) => r._valid);
    if (valid.length === 0) { setError(t("expenses.import.csv.noValidRows")); return; }
    setError("");
    start(async () => {
      try {
        const res = await fetch("/api/books/expenses/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: valid }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("expenses.import.failed"));
        setResult({ inserted: data.inserted, failed: data.failed });
        if (data.inserted > 0) {
          setTimeout(() => router.push("/books/expenses"), 1500);
        }
      } catch (err) {
        console.error("import expenses from CSV", err);
        setError(t("expenses.import.failed"));
      }
    });
  }

  const validCount   = rows.filter((r) => r._valid).length;
  const invalidCount = rows.filter((r) => !r._valid).length;

  // Each clause is a whole sentence of its own, joined by a separator — never
  // a sentence assembled out of halves.
  const resultLine = result
    ? [
        t("expenses.import.csv.imported", { count: result.inserted }),
        ...(result.failed > 0 ? [t("expenses.import.failedCount", { count: result.failed })] : []),
      ].join(" · ")
    : "";

  return (
    <div className="space-y-6">
      {/* Instructions + template */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex flex-wrap items-start gap-4">
        <FileSpreadsheet className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm font-medium text-indigo-800 mb-1">{t("expenses.import.csv.formatTitle")}</p>
          <p className="text-xs text-indigo-700 leading-relaxed">
            {t("expenses.import.csv.formatRequired")}
          </p>
          <p className="text-xs text-indigo-700 leading-relaxed">
            {t("expenses.import.csv.formatOptional")}
          </p>
          <p className="text-xs text-indigo-700 leading-relaxed">
            {t("expenses.import.csv.spanishHeaders")}
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="text-xs font-medium text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap"
        >
          {t("expenses.import.csv.downloadTemplate")}
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
            <p className="text-sm font-medium text-slate-600">{t("expenses.import.csv.dropZone")}</p>
            <p className="text-xs text-slate-400 mt-1">{t("expenses.import.csv.dropZoneHint")}</p>
          </>
        )}
      </div>

      {/* Preview table */}
      {rows.length > 0 && !result && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-slate-800">{t("expenses.import.csv.preview")}</h2>
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                {t("expenses.import.csv.validCount", { count: validCount })}
              </span>
              {invalidCount > 0 && (
                <span className="text-xs text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full font-medium">
                  {t("expenses.import.csv.skipCount", { count: invalidCount })}
                </span>
              )}
            </div>
            <button
              onClick={() => { setRows([]); setFileName(""); }}
              className="text-slate-400 hover:text-slate-600"
              aria-label={t("expenses.import.clear")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap" />
                  {COLUMNS.map((c) => (
                    <th key={c} className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {t(`expenses.import.csv.columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.slice(0, PREVIEW_LIMIT).map((row, i) => (
                  <tr key={i} className={row._valid ? "" : "bg-rose-50/40"}>
                    <td className="px-3 py-2">
                      {row._valid
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        : (
                          <span title={row._errorKey ? t(`expenses.import.csv.rowErrors.${row._errorKey}`) : undefined}>
                            <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                          </span>
                        )
                      }
                    </td>
                    <td className="px-3 py-2 text-slate-800 font-medium">{row.date || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-slate-800 font-medium">
                      {fmt(parseFloat(row.amount || "0"))}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.description || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-slate-600">{row.category || <span className="text-slate-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > PREVIEW_LIMIT && (
              <p className="text-xs text-slate-400 text-center py-3">
                {t("expenses.import.csv.showingFirst", { shown: PREVIEW_LIMIT, total: rows.length })}
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
              {resultLine}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{t("expenses.import.redirecting")}</p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-4 py-3" role="alert">{error}</p>
      )}

      {/* Actions */}
      {rows.length > 0 && !result && (
        <div className="flex gap-3">
          <button
            onClick={() => { setRows([]); setFileName(""); setError(""); }}
            disabled={pending}
            className="flex-1 py-3 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            {t("expenses.import.clear")}
          </button>
          <button
            onClick={handleImport}
            disabled={pending || validCount === 0}
            className="flex-1 py-3 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {pending
              ? t("expenses.import.csv.importing", { count: validCount })
              : t("expenses.import.csv.importAction", { count: validCount })}
          </button>
        </div>
      )}
    </div>
  );
}
