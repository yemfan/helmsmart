"use client";

import { useTranslation } from "react-i18next";
import {
  assessTransactionHealth,
  type TransactionHealthInput,
} from "@/lib/closeboss/transactionHealth";
import {
  happeningLine,
  levelLabel,
  missingLine,
  nextLine,
  riskLine,
} from "@/lib/closeboss/transactionHealthText";
import { intlLocale } from "@/lib/i18n/locale";

/**
 * Health banner for the transaction detail page — constitution:
 * lead with transaction HEALTH (what's happening / what's next /
 * what's missing / what's at risk), not transaction data.
 */
export function TransactionHealthBanner({ input }: { input: TransactionHealthInput }) {
  const { t, i18n } = useTranslation("dashboard");
  const dateLocale = intlLocale(i18n.language);
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
      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${chip}`}>{levelLabel(h.level, t)}</span>
      <p className="text-sm text-slate-700">{happeningLine(h.happening, t, dateLocale)}</p>
      {h.next && (
        <p className="text-sm text-slate-700">
          <span className="font-medium">{t("assistants.transaction.next")}</span> {nextLine(h.next, t, dateLocale)}
        </p>
      )}
      {h.overdueTasks > 0 && (
        <p className="text-sm text-amber-800">
          <span className="font-medium">{t("assistants.transaction.missing")}</span> {missingLine(h.overdueTasks, t)}
        </p>
      )}
      {h.risk && (
        <p className="text-sm font-medium text-red-700">
          <span className="font-semibold">{t("assistants.transaction.atRisk")}</span>{" "}
          {riskLine(h.risk, t, dateLocale)}
        </p>
      )}
    </div>
  );
}
