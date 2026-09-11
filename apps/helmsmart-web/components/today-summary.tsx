"use client";

import { useTranslation } from "react-i18next";

type TodayData = {
  overdueInvoices: number;
  /** Already formatted for the org's currency and the reader's locale. */
  overdueTotal: string;
  openTasks: number;
  urgentTasks: number;
};

/**
 * Today's open items on the Command Center — overdue invoices and open tasks,
 * counted straight from the rows. No AI writes it, so no AI employee signs it:
 * it used to sit under Tim's avatar and "Tim · AI CIO", and an employee's name
 * belongs only on work that employee performs (#1740). Steady-state status, so
 * it is body text in the page's own type, not a card.
 */
export function TodaySummary({ data }: { data: TodayData }) {
  const { t } = useTranslation("home");
  const { overdueInvoices, overdueTotal, openTasks, urgentTasks } = data;

  const lines: string[] = [];
  if (overdueInvoices > 0) {
    lines.push(t("commandCenter.today.overdue", { count: overdueInvoices, amount: overdueTotal }));
  }
  if (urgentTasks > 0) lines.push(t("commandCenter.today.urgentTasks", { count: urgentTasks }));
  else if (openTasks > 0) lines.push(t("commandCenter.today.openTasks", { count: openTasks }));
  if (lines.length === 0) lines.push(t("commandCenter.today.allClear"));

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-slate-900 mb-2">{t("commandCenter.today.heading")}</h2>
      <ul className="space-y-1 text-sm text-slate-600">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
