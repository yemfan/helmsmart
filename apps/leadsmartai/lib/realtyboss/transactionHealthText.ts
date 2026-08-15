import { fmtMilestoneDay, type TransactionHealth } from "./transactionHealth";

/**
 * Renders the structured output of {@link assessTransactionHealth} into display
 * strings, in the caller's language.
 *
 * `assessTransactionHealth` deliberately returns data rather than prose — it
 * runs server-side and has no translator — so this is where the two meet. Both
 * the Transaction Assistant page and the deal-detail banner render through
 * here, so a wording change lands in both.
 */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** "In escrow · 42% of checklist done · closes Jun 5 (12d)" */
export function happeningLine(
  h: TransactionHealth["happening"],
  t: Translate,
  locale = "en-US",
): string {
  const parts: string[] = [];
  // Unknown statuses pass through as-is rather than rendering a raw key.
  parts.push(t(`health.status.${h.status}`, { defaultValue: h.status }));
  if (h.pct != null) parts.push(t("health.pctDone", { pct: h.pct }));
  if (h.closing) {
    const date = fmtMilestoneDay(h.closing, locale);
    parts.push(
      h.closingInDays != null && h.closingInDays >= 0
        ? t("health.closesInDays", { date, days: h.closingInDays })
        : t("health.closes", { date }),
    );
  }
  return parts.join(" · ");
}

/** "Inspection contingency · Jun 5 (overdue)" */
export function nextLine(
  next: TransactionHealth["next"],
  t: Translate,
  locale = "en-US",
): string | null {
  if (!next) return null;
  const label = t(`health.milestone.${next.key}`);
  const day = fmtMilestoneDay(next.date, locale);
  return next.overdue ? `${label} · ${day} (${t("health.overdueSuffix")})` : `${label} · ${day}`;
}

/** "5 overdue checklist items" — null when there is no debt. */
export function missingLine(count: number, t: Translate): string | null {
  if (count <= 0) return null;
  return t(count === 1 ? "health.overdueTasks_one" : "health.overdueTasks", { count });
}

/** The at-risk explanation, already assembled in the target language. */
export function riskLine(
  risk: TransactionHealth["risk"],
  t: Translate,
  locale = "en-US",
): string | null {
  if (!risk) return null;
  if (risk.kind === "milestone_overdue") {
    return t("health.risk.milestoneOverdue", {
      milestone: t(`health.milestone.${risk.milestone}`),
      date: fmtMilestoneDay(risk.date, locale),
    });
  }
  return t(risk.days === 1 ? "health.risk.closingSoon_one" : "health.risk.closingSoon", {
    days: risk.days,
    tasks: missingLine(risk.overdueTasks, t) ?? "",
  });
}

export function levelLabel(level: TransactionHealth["level"], t: Translate): string {
  return t(`health.level.${level}`);
}
