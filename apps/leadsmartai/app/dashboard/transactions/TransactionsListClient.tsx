"use client";

import { useTranslation } from "react-i18next";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TransactionListItem, TransactionType } from "@/lib/transactions/types";
import { TransactionsViewToggle } from "./TransactionsViewToggle";
import {
  formatClosingLabel,
  TransactionStatusPill,
  TransactionTasksBadge,
  TransactionTypeBadge,
} from "@/components/transactions/TransactionAtoms";

function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(`${dateIso}T00:00:00Z`);
  const ms = target.getTime() - today.getTime();
  return Math.round(ms / 86_400_000);
}

type StatusFilter =
  | "active"
  | "pending"
  | "closing_this_week"
  | "overdue"
  | "closed_this_month"
  | "all";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "closing_this_week", label: "Closing this week" },
  { key: "overdue", label: "Overdue" },
  { key: "closed_this_month", label: "Closed (this month)" },
  { key: "all", label: "All" },
];

type TypeFilter = "all" | TransactionType;

function statusMatches(t: TransactionListItem, filter: StatusFilter): boolean {
  switch (filter) {
    case "active":
      return t.status === "active";
    case "pending":
      return t.status === "pending";
    case "all":
      return true;
    case "overdue":
      return t.task_overdue > 0 && t.status !== "closed" && t.status !== "terminated";
    case "closing_this_week": {
      const d = daysUntil(t.closing_date);
      return d != null && d >= 0 && d <= 7 && t.status !== "closed" && t.status !== "terminated";
    }
    case "closed_this_month": {
      if (t.status !== "closed") return false;
      const ref = t.closing_date_actual ?? t.closing_date;
      if (!ref) return false;
      const d = new Date(`${ref}T00:00:00Z`);
      const now = new Date();
      return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
    }
  }
}

/** Sort by closing date ascending, nulls last, ties broken by created_at descending. */
function defaultSort(a: TransactionListItem, b: TransactionListItem): number {
  if (a.closing_date && b.closing_date) {
    const cmp = a.closing_date.localeCompare(b.closing_date);
    if (cmp !== 0) return cmp;
    return b.created_at.localeCompare(a.created_at);
  }
  if (a.closing_date) return -1;
  if (b.closing_date) return 1;
  return b.created_at.localeCompare(a.created_at);
}

export function TransactionsListClient({
  initialItems,
}: {
  initialItems: TransactionListItem[];
}) {
  const { t } = useTranslation("dashboard");
  const [items] = useState(initialItems);
  // Land on the first filter that has something in it. "Active (0)" beside
  // "All (2)" opened the page on an empty state while records existed.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => STATUS_FILTERS.find((f) => initialItems.some((t) => statusMatches(t, f.key)))?.key ?? "active",
  );
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  /**
   * Top-of-page KPIs — same trio the Coordinator board surfaces, so the
   * two views agree on the headline numbers regardless of which one the
   * agent opens. Sourced from the full unfiltered set so the strip
   * doesn't "lie" when the user narrows by status or type.
   */
  const kpis = useMemo(() => {
    let inFlight = 0;
    let overdueTasks = 0;
    let closingThisWeek = 0;
    for (const t of items) {
      const isInFlight = t.status === "active" || t.status === "pending";
      if (isInFlight) {
        inFlight += 1;
        overdueTasks += t.task_overdue;
        const d = daysUntil(t.closing_date);
        if (d != null && d >= 0 && d <= 7) closingThisWeek += 1;
      }
    }
    return { inFlight, overdueTasks, closingThisWeek };
  }, [items]);

  const visible = useMemo(() => {
    return items
      .filter((t) => statusMatches(t, statusFilter))
      .filter((t) => typeFilter === "all" || t.transaction_type === typeFilter)
      .slice()
      .sort(defaultSort);
  }, [items, statusFilter, typeFilter]);

  const statusCounts = useMemo(() => {
    const out: Partial<Record<StatusFilter, number>> = {};
    for (const f of STATUS_FILTERS) {
      out[f.key] = items.filter((t) => statusMatches(t, f.key)).length;
    }
    return out;
  }, [items]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t("transactions.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("pages.transactionsList.sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <TransactionsViewToggle current="list" />
          <Link
            href="/dashboard/transactions/new"
            className="rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-medium text-white hover:bg-[#005ca8]"
          >{t("pages.transactionsList.newTransaction")}</Link>
        </div>
      </header>

      {/* KPI strip — mirrors /dashboard/transactions/coordinator. */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
        <KpiCell label={t("transactions.kpis.inFlight")} value={kpis.inFlight} tone="text-slate-900" />
        <KpiCell
          label={t("transactions.kpis.overdueTasks")}
          value={kpis.overdueTasks}
          tone={kpis.overdueTasks > 0 ? "text-rose-700" : "text-slate-900"}
        />
        <KpiCell
          label={t("transactions.kpis.closingThisWeek")}
          value={kpis.closingThisWeek}
          tone={kpis.closingThisWeek > 0 ? "text-emerald-700" : "text-slate-900"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          const count = statusCounts[f.key] ?? 0;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                active
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
        <div className="ml-auto inline-flex items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="txn-type-filter">{t("pages.transactionsList.type")}</label>
          <select
            id="txn-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
          >
            <option value="all">{t("transactions.typeFilters.all")}</option>
            <option value="buyer_rep">{t("transactions.typeFilters.buyer")}</option>
            <option value="listing_rep">{t("transactions.typeFilters.listing")}</option>
            <option value="dual">{t("transactions.typeFilters.dual")}</option>
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-900">
            {items.length === 0 ? t("transactions.empty") : t("transactions.noMatch")}
          </p>
          {items.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">{t("pages.transactionsList.emptyHint")}</p>
          ) : null}
          <Link
            href="/dashboard/transactions/new"
            className="mt-4 inline-flex rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-medium text-white hover:bg-[#005ca8]"
          >{t("pages.transactionsList.newTransaction")}</Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">{t("transactions.columns.property")}</th>
                <th className="px-5 py-3 text-left font-semibold">{t("transactions.columns.client")}</th>
                <th className="px-5 py-3 text-left font-semibold">{t("transactions.columns.type")}</th>
                <th className="px-5 py-3 text-left font-semibold">{t("transactions.columns.status")}</th>
                <th className="px-5 py-3 text-left font-semibold">{t("transactions.columns.closing")}</th>
                <th className="px-5 py-3 text-left font-semibold">{t("transactions.columns.tasks")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((t) => {
                return (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <Link
                        href={`/dashboard/transactions/${t.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {t.property_address}
                      </Link>
                      {t.city ? (
                        <div className="text-xs text-slate-500">
                          {t.city}
                          {t.state ? `, ${t.state}` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{t.contact_name ?? "—"}</td>
                    <td className="px-5 py-3">
                      <TransactionTypeBadge type={t.transaction_type} />
                    </td>
                    <td className="px-5 py-3">
                      <TransactionStatusPill status={t.status} />
                    </td>
                    <td className="px-5 py-3 text-slate-700">{formatClosingLabel(t.closing_date)}</td>
                    <td className="px-5 py-3">
                      <TransactionTasksBadge
                        total={t.task_total}
                        completed={t.task_completed}
                        overdue={t.task_overdue}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KpiCell({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{String(value)}</p>
    </div>
  );
}
