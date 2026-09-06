"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

/**
 * Shared View toggle for the Transactions section. List and Board are
 * the same data — flat table at /dashboard/transactions, stage-grouped
 * kanban at /dashboard/transactions/coordinator. Mirrors the
 * Month / List toggle on /dashboard/calendar so the gesture is
 * consistent across the app.
 */
export function TransactionsViewToggle({ current }: { current: "list" | "board" }) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium">
      <Link
        href="/dashboard/transactions"
        className={`px-3 py-1 transition ${
          current === "list" ? "bg-slate-900 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
        aria-current={current === "list" ? "page" : undefined}
      >{t("pages.transactionsToggle.list")}</Link>
      <Link
        href="/dashboard/transactions/coordinator"
        className={`px-3 py-1 transition ${
          current === "board" ? "bg-slate-900 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
        aria-current={current === "board" ? "page" : undefined}
      >{t("pages.transactionsToggle.board")}</Link>
    </div>
  );
}
