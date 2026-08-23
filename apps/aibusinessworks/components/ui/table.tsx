import type { ReactNode } from "react";
import { cx } from "./primitives";

export interface Column<Row> {
  key: string;
  header: string;
  /** Render the cell. */
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
  /** Hide on the mobile card layout (e.g. a duplicate of the card title). */
  primary?: boolean;
}

/**
 * One dataset, two layouts: a real table from `sm` up, and a stack of labelled
 * cards below it. Financial tables have to stay readable on a phone, and a
 * horizontally scrolling table of money is not readable.
 */
export function ResponsiveTable<Row>({
  columns,
  rows,
  rowKey,
  empty = "Nothing here yet.",
  caption,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string;
  empty?: ReactNode;
  caption?: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline bg-canvas-alt px-6 py-10 text-center text-sm text-muted">
        {empty}
      </div>
    );
  }

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const secondary = columns.filter((c) => c.key !== primary.key);

  return (
    <>
      {/* Table, small screens and up */}
      <div className="hidden overflow-x-auto rounded-2xl border border-hairline bg-white shadow-card sm:block">
        <table className="w-full min-w-full border-collapse text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr className="border-b border-hairline bg-canvas-alt">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cx(
                    "px-4 py-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500",
                    col.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={rowKey(row, i)} className="border-b border-hairline last:border-0">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cx(
                      "px-4 py-3.5 align-middle text-ink",
                      col.align === "right" ? "text-right tabular-nums" : "text-left",
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards, below sm */}
      <div className="space-y-3 sm:hidden">
        {rows.map((row, i) => (
          <div
            key={rowKey(row, i)}
            className="rounded-2xl border border-hairline bg-white p-4 shadow-card"
          >
            <div className="font-semibold text-ink">{primary.cell(row)}</div>
            <dl className="mt-3 space-y-2">
              {secondary.map((col) => (
                <div key={col.key} className="flex items-baseline justify-between gap-4">
                  <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-navy-500">
                    {col.header}
                  </dt>
                  <dd className="text-right text-sm tabular-nums text-ink">{col.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}
