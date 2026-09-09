"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Upload, CheckCircle2, AlertCircle, X } from "lucide-react";
import { moneyFormatter } from "@/lib/books-format";

interface ParsedTransaction {
  date: string;
  amount: string;
  description: string;
  memo: string;
  type: "debit" | "credit";
  _valid: boolean;
  /** Set when the row failed validation; the table translates it at render. */
  _invalid?: boolean;
}

// ─── OFX/QFX parser ──────────────────────────────────────────────────────────
// Parses text-based OFX format (SGML style, not true XML)

function parseOFX(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];

  // Extract all STMTTRN blocks (statement transactions)
  const stmtTrnPattern = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;

  while ((match = stmtTrnPattern.exec(text)) !== null) {
    const block = match[1];

    // Extract individual fields using regex
    const trnTypeMatch = /<TRNTYPE>([A-Z]+)/i.exec(block);
    const dtPostedMatch = /<DTPOSTED>(\d{8})/i.exec(block);
    const trnAmtMatch = /<TRNAMT>(-?[\d.]+)/i.exec(block);
    const nameMatch = /<NAME>([^<]+)/i.exec(block);
    const memoMatch = /<MEMO>([^<]*)/i.exec(block);

    if (!dtPostedMatch || !trnAmtMatch) continue;

    const dateStr = dtPostedMatch[1];
    const amount = parseFloat(trnAmtMatch[1]);
    const type = trnTypeMatch?.[1]?.toUpperCase() ?? "DEBIT";
    const name = nameMatch?.[1]?.trim() ?? "";
    const memo = memoMatch?.[1]?.trim() ?? "";

    // Format date as YYYY-MM-DD from YYYYMMDD
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const date = `${year}-${month}-${day}`;

    // Only import debits as expenses; skip credits (deposits, refunds, etc.)
    if (amount > 0 && type !== "DEBIT") continue;

    // Description: prefer NAME, fallback to MEMO. The last fallback is written
    // to the ledger as the expense description — stored data, not screen copy.
    const description = name || memo || "Bank transaction";

    // Validate
    const isValid = !isNaN(amount) && amount !== 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

    transactions.push({
      date,
      amount: Math.abs(amount).toFixed(2),
      description: description.slice(0, 100),
      memo: memo.slice(0, 200),
      type: amount < 0 ? "debit" : "credit",
      _valid: isValid && amount < 0,
      _invalid: !isValid,
    });
  }

  return transactions;
}

// ─── Format example ───────────────────────────────────────────────────────────

/**
 * An OFX file header, quoted verbatim — a file format, not copy, so it is the
 * same bytes in every language.
 *
 * These are exactly the lines the dialog showed: the body of the document used
 * to sit here too and was sliced off before it ever reached the reader.
 */
const OFX_EXAMPLE = `OFXHEADER:100
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEFORMAT:NO
NEWFILEFORMAT:YES
DATA:OFSGML
VERSION:102`;

// ─── Main component ───────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 50;
const COLUMNS = ["date", "amount", "description", "memo"] as const;

export function ImportOFXForm({ currency = "USD" }: { currency?: string }) {
  const router = useRouter();
  const { t, i18n } = useTranslation("books");
  const fmt = moneyFormatter(i18n.language, currency);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows]         = useState<ParsedTransaction[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult]     = useState<{ inserted: number; failed: number; skipped: number } | null>(null);
  const [error, setError]       = useState("");
  const [pending, start]        = useTransition();

  function showOFXExample() {
    alert(
      `${t("expenses.import.ofx.exampleTitle")}\n\n` +
        OFX_EXAMPLE +
        `\n\n${t("expenses.import.ofx.exampleFooter")}`
    );
  }

  function handleFile(file: File) {
    setFileName(file.name);
    setResult(null);
    setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseOFX(text);
      if (parsed.length === 0) {
        setError(t("expenses.import.ofx.noTransactions"));
      } else {
        setRows(parsed);
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".ofx") || file.name.endsWith(".qfx") || file.type === "application/vnd.intu.qbo" || file.type === "text/plain")) {
      handleFile(file);
    } else {
      setError(t("expenses.import.ofx.notOfx"));
    }
  }

  function handleImport() {
    const valid = rows.filter((r) => r._valid);
    if (valid.length === 0) { setError(t("expenses.import.ofx.noValidRows")); return; }
    setError("");
    start(async () => {
      try {
        const res = await fetch("/api/books/expenses/import-ofx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: valid }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("expenses.import.failed"));
        setResult({ inserted: data.inserted, failed: data.failed, skipped: data.skipped ?? 0 });
        if (data.inserted > 0) {
          setTimeout(() => router.push("/books/expenses"), 1500);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("expenses.import.failed"));
      }
    });
  }

  const validCount   = rows.filter((r) => r._valid).length;
  const invalidCount = rows.filter((r) => !r._valid).length;

  // Each clause is a whole sentence of its own, joined by a separator — never
  // a sentence assembled out of halves.
  const resultLine = result
    ? [
        t("expenses.import.ofx.imported", { count: result.inserted }),
        ...(result.skipped > 0 ? [t("expenses.import.ofx.creditsSkipped", { count: result.skipped })] : []),
        ...(result.failed > 0 ? [t("expenses.import.failedCount", { count: result.failed })] : []),
      ].join(" · ")
    : "";

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 flex items-start gap-4">
        <div className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5 font-bold">ⓘ</div>
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-800 mb-1">{t("expenses.import.ofx.formatTitle")}</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            {t("expenses.import.ofx.formatBody")}
          </p>
          <button
            onClick={showOFXExample}
            className="text-xs font-medium text-blue-600 underline mt-2 hover:text-blue-800"
          >
            {t("expenses.import.ofx.viewExample")}
          </button>
        </div>
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
          accept=".ofx,.qfx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
        {fileName ? (
          <p className="text-sm font-medium text-slate-700">{fileName}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-600">{t("expenses.import.ofx.dropZone")}</p>
            <p className="text-xs text-slate-400 mt-1">{t("expenses.import.ofx.dropZoneHint")}</p>
          </>
        )}
      </div>

      {/* Preview table */}
      {rows.length > 0 && !result && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-slate-800">{t("expenses.import.ofx.preview")}</h2>
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                {t("expenses.import.ofx.toImport", { count: validCount })}
              </span>
              {invalidCount > 0 && (
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                  {t("expenses.import.ofx.skippedCount", { count: invalidCount })}
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
                      {t(`expenses.import.ofx.columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.slice(0, PREVIEW_LIMIT).map((row, i) => (
                  <tr key={i} className={row._valid ? "" : "bg-slate-50"}>
                    <td className="px-3 py-2">
                      {row._valid
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        : (
                          <span title={row._invalid ? t("expenses.import.ofx.invalidRow") : undefined}>
                            <AlertCircle className="w-3.5 h-3.5 text-slate-300" />
                          </span>
                        )
                      }
                    </td>
                    <td className="px-3 py-2 text-slate-800 font-medium">{row.date}</td>
                    <td className="px-3 py-2 text-slate-800 font-medium">
                      {fmt(parseFloat(row.amount))}
                    </td>
                    <td className="px-3 py-2 text-slate-600 truncate">{row.description}</td>
                    <td className="px-3 py-2 text-slate-500 text-[11px] max-w-[100px] truncate">{row.memo || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > PREVIEW_LIMIT && (
              <p className="text-xs text-slate-400 text-center py-3">
                {t("expenses.import.ofx.showingFirst", { shown: PREVIEW_LIMIT, total: rows.length })}
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
              ? t("expenses.import.ofx.importing", { count: validCount })
              : t("expenses.import.ofx.importAction", { count: validCount })}
          </button>
        </div>
      )}
    </div>
  );
}
