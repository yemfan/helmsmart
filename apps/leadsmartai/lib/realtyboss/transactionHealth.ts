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

/** Stable milestone ids; callers translate them. */
export type MilestoneKey = "inspection" | "appraisal" | "loan" | "closing";

/**
 * Health is returned as DATA, not prose. This module used to compose English
 * sentences by concatenation ("Closing in 3 days with 5 overdue checklist
 * items"), which no amount of UI translation could reach — and which can't be
 * reordered for languages that put the clause the other way round. Callers now
 * render each shape in their own language.
 */
export type TransactionHealth = {
  level: "on_track" | "needs_attention" | "at_risk";
  /** What's happening — the pieces, for the caller to join. */
  happening: {
    /** "active" maps to an "in escrow" label; anything else is a raw status. */
    status: string;
    /** Checklist completion, 0-100, when there are tasks. */
    pct: number | null;
    closing: Date | null;
    /** Days until closing; negative once it has passed. */
    closingInDays: number | null;
  };
  /** What's next — the earliest open milestone. */
  next: { key: MilestoneKey; date: Date; overdue: boolean } | null;
  /** Open checklist debt. Zero when there is none. */
  overdueTasks: number;
  /** Why it's at risk — only set when level is at_risk. */
  risk:
    | { kind: "milestone_overdue"; milestone: MilestoneKey; date: Date }
    | { kind: "closing_soon"; days: number; overdueTasks: number }
    | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(d: Date): number {
  return Math.ceil((d.getTime() - Date.now()) / DAY_MS);
}

export function fmtMilestoneDay(d: Date, locale = "en-US"): string {
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function assessTransactionHealth(t: TransactionHealthInput): TransactionHealth {
  const milestones: { key: MilestoneKey; date: string | null; done: string | null }[] = [
    { key: "inspection", date: t.inspection_deadline, done: t.inspection_completed_at },
    { key: "appraisal", date: t.appraisal_deadline, done: t.appraisal_completed_at },
    { key: "loan", date: t.loan_contingency_deadline, done: t.loan_contingency_removed_at },
    { key: "closing", date: t.closing_date, done: null },
  ];

  const open = milestones
    .filter((m) => m.date && !m.done)
    .map((m) => ({ key: m.key, date: new Date(m.date as string) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const next = open[0]
    ? { ...open[0], overdue: open[0].date.getTime() < Date.now() }
    : null;
  const overdueMilestones = open.filter((m) => m.date.getTime() < Date.now());

  const closingSoon = next?.key === "closing" && daysUntil(next.date) <= 3;

  let level: TransactionHealth["level"] = "on_track";
  let risk: TransactionHealth["risk"] = null;
  if (overdueMilestones.length > 0) {
    level = "at_risk";
    risk = {
      kind: "milestone_overdue",
      milestone: overdueMilestones[0].key,
      date: overdueMilestones[0].date,
    };
  } else if (closingSoon && t.task_overdue > 0) {
    level = "at_risk";
    risk = { kind: "closing_soon", days: daysUntil(next!.date), overdueTasks: t.task_overdue };
  } else if ((next && daysUntil(next.date) <= 3) || t.task_overdue > 0) {
    level = "needs_attention";
  }

  const pct = t.task_total > 0 ? Math.round((t.task_completed / t.task_total) * 100) : null;
  const closing = t.closing_date ? new Date(t.closing_date) : null;

  return {
    level,
    happening: {
      status: t.status,
      pct,
      closing,
      closingInDays: closing ? daysUntil(closing) : null,
    },
    next,
    overdueTasks: t.task_overdue,
    risk,
  };
}
