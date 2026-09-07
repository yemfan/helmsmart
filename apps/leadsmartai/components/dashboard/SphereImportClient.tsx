"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import type { ParsedSphereRow, CommitRow } from "@/lib/contacts/import";

type ParseResponse = {
  ok: boolean;
  parsed?: { rows: ParsedSphereRow[]; headers: string[]; skipped: number };
  error?: string;
};

type CommitResponse = {
  ok: boolean;
  result?: { inserted: number; errors: string[] };
  error?: string;
};

type UIRow = ParsedSphereRow & {
  include: boolean;
  confirmedOptIn: boolean;
};

export default function SphereImportClient() {
  const { t } = useTranslation("dashboard");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<UIRow[] | null>(null);
  const [skipped, setSkipped] = useState(0);

  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResponse["result"] | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = rows?.length ?? 0;
    const included = rows?.filter((r) => r.include).length ?? 0;
    const optIns = rows?.filter((r) => r.include && r.confirmedOptIn).length ?? 0;
    const withErrors = rows?.filter((r) => r.errors.length > 0).length ?? 0;
    return { total, included, optIns, withErrors };
  }, [rows]);

  async function handleParse() {
    if (!file) {
      setParseError("Choose a CSV file first.");
      return;
    }
    setParsing(true);
    setParseError(null);
    setCommitResult(null);
    setCommitError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/dashboard/sphere/import", { method: "POST", body: form });
      const data = (await res.json()) as ParseResponse;
      if (!res.ok || !data.ok || !data.parsed) {
        throw new Error(data.error || "Parse failed");
      }
      const uiRows: UIRow[] = data.parsed.rows.map((r) => ({
        ...r,
        include: r.errors.length === 0,
        confirmedOptIn: false, // spec §2.8 — user must explicitly tick
      }));
      setRows(uiRows);
      setSkipped(data.parsed.skipped);
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  async function handleCommit() {
    if (!rows) return;
    const payload: CommitRow[] = rows
      .filter((r) => r.include)
      .map((r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        address: r.address,
        closingAddress: r.closingAddress,
        closingDate: r.closingDate,
        closingPrice: r.closingPrice,
        relationshipType: r.relationshipType,
        relationshipTag: r.relationshipTag,
        preferredLanguage: r.preferredLanguage,
        anniversaryOptIn: r.confirmedOptIn,
      }));
    if (!payload.length) {
      setCommitError("No rows selected.");
      return;
    }
    setCommitting(true);
    setCommitError(null);
    try {
      const res = await fetch("/api/dashboard/sphere/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      const data = (await res.json()) as CommitResponse;
      if (!res.ok || !data.ok || !data.result) {
        throw new Error(data.error || "Import failed");
      }
      setCommitResult(data.result);
      // Clear the included rows so the user sees progress.
      setRows((prev) =>
        prev ? prev.map((r) => (r.include ? { ...r, include: false } : r)) : prev,
      );
    } catch (e: unknown) {
      setCommitError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setCommitting(false);
    }
  }

  function update(i: number, patch: Partial<UIRow>) {
    setRows((prev) =>
      prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev,
    );
  }

  function bulkOptIn(value: boolean) {
    setRows((prev) =>
      prev
        ? prev.map((r) =>
            r.include && r.closingDate ? { ...r, confirmedOptIn: value } : r,
          )
        : prev,
    );
  }

  return (
    <div className="space-y-5">
      <Link
        href="/dashboard/sphere"
        className="inline-flex text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        {t("pages.sphereImport.backToSphere")}
      </Link>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("pages.sphereImport.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pages.sphereImport.sub")}</p>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Spec §2.8:</strong> anniversary triggers do not fire until you explicitly
          confirm each contact has consented to SMS. The CSV can pre-fill this column, but we
          still require a per-row tick before the contact is imported with opt-in = true.
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm text-slate-700 dark:text-slate-300"
          />
          <button
            type="button"
            onClick={() => void handleParse()}
            disabled={!file || parsing}
            className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {parsing ? t("common:status.parsing") : t("pages.sphereImport.parseCsv")}
          </button>
          {parseError && <span className="text-sm text-red-600">{parseError}</span>}
        </div>
      </div>

      {rows && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="border-b border-slate-100 dark:border-slate-700 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-700 dark:text-slate-300">
                {t("pages.sphereImport.rowsIncluded", { included: stats.included, total: stats.total })}{" "}
                <strong>{stats.optIns}</strong> {t("pages.dashFragments.anniversaryOptIn")}{skipped > 0 && <> · {skipped} {t("pages.dashFragments.emptyRowsSkipped")}</>}
                {stats.withErrors > 0 && (
                  <> · <span className="text-amber-700">{stats.withErrors} {t("pages.dashFragments.withWarnings")}</span></>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => bulkOptIn(true)}
                  className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >{t("pages.sphereImport.confirmAll")}</button>
                <button
                  type="button"
                  onClick={() => bulkOptIn(false)}
                  className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >{t("pages.sphereImport.uncheckAll")}</button>
                <button
                  type="button"
                  onClick={() => void handleCommit()}
                  disabled={committing || !stats.included}
                  className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {committing ? t("common:status.importing") : `Import ${stats.included} contact${stats.included === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
            {commitError && <div className="mt-2 text-sm text-red-600">{commitError}</div>}
            {commitResult && (
              <div className="mt-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                {t("pages.sphereImport.insertedContacts", { count: commitResult.inserted })}
                {commitResult.errors.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-green-800">
                      {t("pages.sphereImport.warningCount", { count: commitResult.errors.length })}
                    </summary>
                    <ul className="mt-1 list-disc pl-5 text-xs text-green-800">
                      {commitResult.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>

          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900/60">
                <tr>
                  <Th>{t("pages.sphereImport.include")}</Th>
                  <Th>{t("pages.sphereImport.name")}</Th>
                  <Th>{t("pages.sphereImport.relationship")}</Th>
                  <Th>{t("pages.sphereImport.closing")}</Th>
                  <Th>{t("pages.sphereImport.emailPhone")}</Th>
                  <Th>Opt-in ✓</Th>
                  <Th>{t("pages.sphereImport.warnings")}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r, i) => (
                  <tr key={i} className={r.errors.length ? "bg-amber-50/40" : ""}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => update(i, { include: e.target.checked })}
                        className="h-4 w-4 accent-brand-accent"
                        aria-label={`Include row ${r.rowNumber}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {r.firstName} {r.lastName ?? ""}
                      </div>
                      {r.address && (
                        <div className="text-[11px] text-slate-500">{r.address}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600 dark:text-slate-400">
                        {r.relationshipType.replace("_", " ")}
                      </span>
                      {r.relationshipTag && (
                        <div className="mt-0.5 text-[11px] text-slate-500 italic">
                          {r.relationshipTag}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.closingDate ? (
                        <>
                          <div>{r.closingDate}</div>
                          {r.closingPrice && (
                            <div className="text-[11px] text-slate-500">
                              ${r.closingPrice.toLocaleString()}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.email && <div className="truncate text-slate-700 dark:text-slate-300">{r.email}</div>}
                      {r.phone && <div className="text-[11px] text-slate-500">{r.phone}</div>}
                      {!r.email && !r.phone && <span className="text-slate-500">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={r.confirmedOptIn}
                          disabled={!r.include || !r.closingDate}
                          onChange={(e) => update(i, { confirmedOptIn: e.target.checked })}
                          className="h-4 w-4 accent-brand-accent disabled:opacity-40"
                          aria-label={`Confirm anniversary opt-in for ${r.firstName}`}
                        />
                        {r.csvAnniversaryOptIn && (
                          <span
                            className="text-[9px] uppercase tracking-wide text-slate-500"
                            title={t("pages.sphereImport.csvOptIn")}
                          >
                            csv
                          </span>
                        )}
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      {r.errors.length > 0 && (
                        <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-amber-700">
                          {r.errors.map((e, j) => (
                            <li key={j}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}
