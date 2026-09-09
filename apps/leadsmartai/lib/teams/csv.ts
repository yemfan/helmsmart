/**
 * CSV for the team tables: quoted when a cell needs it, CRLF rows, a BOM so
 * Excel reads UTF-8 (a Chinese agent name otherwise opens as mojibake).
 */
export type CsvCell = string | number | boolean | null | undefined;

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const cell = (v: CsvCell): string => {
    if (v == null) return "";
    const s = typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "yes" : "no") : v;
    // Leading = + - @ would run as a formula in a spreadsheet; a tab-ish quote keeps it text.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [header.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Browser only: hand the file to the user. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
