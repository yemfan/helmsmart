"use client";

import {
  assessTransactionHealth,
  fmtMilestoneDay,
  type TransactionHealthInput,
} from "@/lib/realtyboss/transactionHealth";

/**
 * Health banner for the transaction detail page — constitution:
 * lead with transaction HEALTH (what's happening / what's next /
 * what's missing / what's at risk), not transaction data.
 */
export function TransactionHealthBanner({ input }: { input: TransactionHealthInput }) {
  const h = assessTransactionHealth(input);
  const tone =
    h.level === "at_risk"
      ? "border-red-200 bg-red-50/60"
      : h.level === "needs_attention"
        ? "border-amber-200 bg-amber-50/60"
        : "border-emerald-200 bg-emerald-50/50";
  const chip =
    h.level === "at_risk"
      ? "bg-red-100 text-red-700"
      : h.level === "needs_attention"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5 ${tone}`}>
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${chip}`}>{h.label}</span>
      <p className="text-sm text-slate-700">{h.happening}</p>
      {h.next && (
        <p className="text-sm text-slate-700">
          <span className="font-medium">Next:</span> {h.next.label} · {fmtMilestoneDay(h.next.date)}
          {h.next.overdue ? " (overdue)" : ""}
        </p>
      )}
      {h.missing && (
        <p className="text-sm text-amber-800">
          <span className="font-medium">Missing:</span> {h.missing}
        </p>
      )}
      {h.risk && (
        <p className="text-sm font-medium text-red-700">
          <span className="font-semibold">At risk:</span> {h.risk}
        </p>
      )}
    </div>
  );
}
