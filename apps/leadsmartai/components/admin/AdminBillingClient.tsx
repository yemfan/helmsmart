"use client";

import {
  estimatedMrrForPlan,
  type BillingPlan,
  type BillingRecord,
  type BillingStatus,
} from "@/lib/admin/billingRecords";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusClass(status: BillingStatus) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700";
    case "trialing":
      return "bg-blue-50 text-blue-700";
    case "past_due":
      return "bg-red-50 text-red-700";
    case "canceled":
      return "bg-gray-100 text-gray-700";
    case "incomplete":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function planLabel(plan: BillingPlan) {
  switch (plan) {
    case "consumer_free":
      return "Consumer Free";
    case "consumer_premium":
      return "Consumer Premium";
    case "agent_starter":
      return "Agent Starter";
    case "agent_pro":
      return "Agent Pro";
    case "loan_broker_pro":
      return "Loan Broker Pro";
    default:
      return plan;
  }
}

export default function AdminBillingClient() {
  const { t } = useTranslation("dashboard");
  const [rows, setRows] = useState<BillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [error, setError] = useState("");

  async function loadBilling() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (roleFilter !== "all") params.set("role", roleFilter);

      const res = await fetch(`/api/admin/billing/list?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        records?: BillingRecord[];
      };

      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || "Failed to load billing records");
      }

      setRows(json.records ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, roleFilter]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter(
      (r) =>
        r.email.toLowerCase().includes(q) ||
        (r.full_name ?? "").toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.status === "active");
    const pastDue = rows.filter((r) => r.status === "past_due");
    const trialing = rows.filter((r) => r.status === "trialing");
    const canceled = rows.filter((r) => r.status === "canceled");

    const mrr = active.reduce((sum, r) => sum + (r.amount_monthly || 0), 0);

    return {
      activeCount: active.length,
      pastDueCount: pastDue.length,
      trialingCount: trialing.length,
      canceledCount: canceled.length,
      mrr,
    };
  }, [rows]);

  async function updateBilling(
    recordId: string,
    payload: Partial<{
      status: BillingStatus;
      plan: BillingPlan;
      cancel_at_period_end: boolean;
    }>
  ) {
    try {
      setSavingId(recordId);
      setError("");

      const res = await fetch("/api/admin/billing/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: recordId,
          ...payload,
        }),
      });

      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        record?: BillingRecord;
      };

      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || "Failed to update billing record");
      }

      if (json.record) {
        setRows((prev) => prev.map((r) => (r.id === recordId ? json.record! : r)));
      } else {
        setRows((prev) =>
          prev.map((r) =>
            r.id === recordId
              ? {
                  ...r,
                  ...payload,
                  amount_monthly:
                    payload.plan != null
                      ? (() => {
                          const p = payload.plan;
                          const m: Record<BillingPlan, number> = {
                            consumer_free: 0,
                            consumer_premium: 29,
                            agent_starter: 49,
                            agent_pro: 99,
                            loan_broker_pro: 149,
                          };
                          return m[p] ?? r.amount_monthly;
                        })()
                      : r.amount_monthly,
                }
              : r
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update billing record");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">{t("pages.adminBilling.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("pages.adminBilling.sub")}</p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">{t("pages.adminBilling.mrr")}</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrency(summary.mrr)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">{t("pages.adminBilling.active")}</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.activeCount}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">{t("pages.adminBilling.trialing")}</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.trialingCount}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">{t("pages.adminBilling.pastDue")}</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.pastDueCount}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">{t("pages.adminBilling.canceled")}</div>
          <div className="mt-2 text-2xl font-semibold text-gray-900">{summary.canceledCount}</div>
        </div>
      </div>

      <section className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("pages.adminBilling.searchPlaceholder")}
              className="flex-1 rounded-2xl border px-4 py-3 text-sm outline-none focus:border-gray-400"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border px-4 py-3 text-sm outline-none focus:border-gray-400"
            >
              <option value="all">{t("pages.adminBilling.allStatus")}</option>
              <option value="active">{t("pages.adminBilling.active")}</option>
              <option value="trialing">{t("pages.adminBilling.trialing")}</option>
              <option value="past_due">{t("pages.adminBilling.pastDue")}</option>
              <option value="canceled">{t("pages.adminBilling.canceled")}</option>
              <option value="incomplete">{t("pages.adminBilling.incomplete")}</option>
            </select>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-2xl border px-4 py-3 text-sm outline-none focus:border-gray-400"
            >
              <option value="all">{t("pages.adminBilling.allRoles")}</option>
              <option value="consumer">{t("pages.adminBilling.consumer")}</option>
              <option value="agent">{t("pages.adminBilling.agent")}</option>
              <option value="loan_broker">{t("pages.adminBilling.loanBroker")}</option>
            </select>

            <button
              type="button"
              onClick={() => void loadBilling()}
              className="rounded-2xl border px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >{t("pages.adminBilling.refresh")}</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-gray-500">
              <tr>
                <th className="px-5 py-4 font-medium">{t("pages.adminBilling.colUser")}</th>
                <th className="px-5 py-4 font-medium">{t("pages.adminBilling.colRole")}</th>
                <th className="px-5 py-4 font-medium">{t("pages.adminBilling.colPlan")}</th>
                <th className="px-5 py-4 font-medium">{t("pages.adminBilling.colStatus")}</th>
                <th className="px-5 py-4 font-medium">{t("pages.adminBilling.colMonthly")}</th>
                <th className="px-5 py-4 font-medium">{t("pages.adminBilling.colPeriodEnd")}</th>
                <th className="px-5 py-4 font-medium">{t("pages.adminBilling.colActions")}</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-gray-500">{t("pages.adminBilling.loading")}</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-gray-500">{t("pages.adminBilling.empty")}</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{row.full_name || t("pages.adminBilling.unnamedUser")}</div>
                      <div className="text-gray-500">{row.email}</div>
                    </td>

                    <td className="px-5 py-4 capitalize text-gray-700">
                      {row.role.replace(/_/g, " ")}
                    </td>

                    <td className="px-5 py-4">
                      <select
                        value={row.plan}
                        disabled={savingId === row.id}
                        onChange={(e) =>
                          void updateBilling(row.id, {
                            plan: e.target.value as BillingPlan,
                          })
                        }
                        className="max-w-[200px] rounded-xl border px-3 py-2 text-sm"
                        title={planLabel(row.plan)}
                      >
                        <option value="consumer_free">{t("pages.adminBilling.planConsumerFree")}</option>
                        <option value="consumer_premium">{t("pages.adminBilling.planConsumerPremium")}</option>
                        <option value="agent_starter">{t("pages.adminBilling.planAgentStarter")}</option>
                        <option value="agent_pro">{t("pages.adminBilling.planAgentPro")}</option>
                        <option value="loan_broker_pro">{t("pages.adminBilling.planLoanBrokerPro")}</option>
                      </select>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusClass(
                          row.status
                        )}`}
                      >
                        {row.status.replace(/_/g, " ")}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-gray-700">{formatCurrency(row.amount_monthly)}</td>

                    <td className="px-5 py-4 text-gray-500">{formatDate(row.current_period_end)}</td>

                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={savingId === row.id}
                          onClick={() =>
                            void updateBilling(row.id, {
                              status: row.status === "active" ? "canceled" : "active",
                            })
                          }
                          className="rounded-xl border px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        >
                          {row.status === "active" ? t("common:actions.cancel") : t("common:actions.activate")}
                        </button>

                        <button
                          type="button"
                          disabled={savingId === row.id}
                          onClick={() =>
                            void updateBilling(row.id, {
                              cancel_at_period_end: !row.cancel_at_period_end,
                            })
                          }
                          className="rounded-xl border px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        >
                          {row.cancel_at_period_end ? t("pages.adminBilling.keepRenewal") : t("pages.adminBilling.cancelAtPeriodEnd")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
