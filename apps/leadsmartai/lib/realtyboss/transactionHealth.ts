/**
 * Transaction health — the constitution's transaction experience:
 * don't show transaction data, answer "What's happening? What's next?
 * What is missing? What is at risk?"
 *
 * Pure function over fields the transactions list API already returns
 * (no new queries, no schema changes). Client-safe.
 */

export type TransactionHealthInput = {
  status: string;
  transaction_type?: string | null;
  purchase_price?: number | null;
  inspection_deadline: string | null;
  inspection_completed_at: string | null;
  appraisal_deadline: string | null;
  appraisal_completed_at: string | null;
  loan_contingency_deadline: string | null;
  loan_contingency_removed_at: string | null;
  closing_date: string | null;
  task_total: number;
  task_completed: number;
  task_overdue: number;
};

export type TransactionHealth = {
  level: "on_track" | "needs_attention" | "at_risk";
  label: string;
  /** What's happening — one narrative line. */
  happening: string;
  /** What's next — the earliest open milestone. */
  next: { label: string; date: Date; overdue: boolean } | null;
  /** What's missing — open checklist debt, if any. */
  missing: string | null;
  /** What is at risk — only set when level is at_risk. */
  risk: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(d: Date): number {
  return Math.ceil((d.getTime() - Date.now()) / DAY_MS);
}

export function fmtMilestoneDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function assessTransactionHealth(t: TransactionHealthInput): TransactionHealth {
  const milestones: { label: string; date: string | null; done: string | null }[] = [
    { label: "Inspection contingency", date: t.inspection_deadline, done: t.inspection_completed_at },
    { label: "Appraisal", date: t.appraisal_deadline, done: t.appraisal_completed_at },
    { label: "Loan contingency", date: t.loan_contingency_deadline, done: t.loan_contingency_removed_at },
    { label: "Closing", date: t.closing_date, done: null },
  ];

  const open = milestones
    .filter((m) => m.date && !m.done)
    .map((m) => ({ label: m.label, date: new Date(m.date as string) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const next = open[0]
    ? { ...open[0], overdue: open[0].date.getTime() < Date.now() }
    : null;
  const overdueMilestones = open.filter((m) => m.date.getTime() < Date.now());

  const missing =
    t.task_overdue > 0
      ? `${t.task_overdue} overdue checklist item${t.task_overdue === 1 ? "" : "s"}`
      : null;

  const closingSoon = next?.label === "Closing" && daysUntil(next.date) <= 3;

  let level: TransactionHealth["level"] = "on_track";
  let risk: string | null = null;
  if (overdueMilestones.length > 0) {
    level = "at_risk";
    risk = `${overdueMilestones[0].label} passed ${fmtMilestoneDay(overdueMilestones[0].date)} and is still open.`;
  } else if (closingSoon && t.task_overdue > 0) {
    level = "at_risk";
    risk = `Closing in ${daysUntil(next!.date)} day${daysUntil(next!.date) === 1 ? "" : "s"} with ${missing}.`;
  } else if ((next && daysUntil(next.date) <= 3) || t.task_overdue > 0) {
    level = "needs_attention";
  }

  const pct = t.task_total > 0 ? Math.round((t.task_completed / t.task_total) * 100) : null;
  const closing = t.closing_date ? new Date(t.closing_date) : null;
  const happeningParts = [
    t.status === "active" ? "In escrow" : t.status,
    pct != null ? `${pct}% of checklist done` : null,
    closing ? `closes ${fmtMilestoneDay(closing)}${daysUntil(closing) >= 0 ? ` (${daysUntil(closing)}d)` : ""}` : null,
  ].filter(Boolean);

  return {
    level,
    label: level === "on_track" ? "On track" : level === "needs_attention" ? "Needs attention" : "At risk",
    happening: happeningParts.join(" · "),
    next,
    missing,
    risk,
  };
}
