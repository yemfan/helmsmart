"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionCard } from "@/components/dashboard/SectionCard";

function fmtMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

type OverviewPayload = {
  success: boolean;
  mrr: number;
  payingSubscriptions: number;
  payingUsersDistinct: number;
  mauUsage: number;
  activation: { rate: number | null; onboarded: number; activatedWithin7dOfOnboarding: number };
  conversion: { rate: number | null; checkoutStartedUsers: number; convertedUsers: number };
  churn: { rate: number | null; churnedUsers: number; payingUsersNow: number };
  newPayingUsersInWindow: number;
  scope: { usageAndConversionWindowDays: number; churnWindowDays: number };
};

type RevenuePayload = {
  success: boolean;
  currentMrr: number;
  mrrByPlan: { plan: string; mrr: number; subscribers: number }[];
  weeklyMrrFromEvents: { period: string; mrr: number }[];
  seriesNote: string | null;
};

type FunnelPayload = {
  success: boolean;
  windowDays: number;
  cumulative: { onboarded: number; firstReply: number; firstAi: number };
  inWindowDistinctUsers: Record<string, number>;
};

type UsagePayload = {
  success: boolean;
  windowDays: number;
  breakdown: { event_type: string; count: number }[];
};

type MetricsApiError = {
  success?: boolean;
  error?: string;
  details?: string;
};

function formatMetricsApiError(j: MetricsApiError, fallback: string): string {
  const base = j.error ?? fallback;
  if (j.details && String(j.details).trim()) {
    return `${base} — ${j.details}`;
  }
  return base;
}

export function FounderDashboardClient() {
  const { t } = useTranslation("dashboard");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [revenue, setRevenue] = useState<RevenuePayload | null>(null);
  const [funnel, setFunnel] = useState<FunnelPayload | null>(null);
  const [usage, setUsage] = useState<UsagePayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [o, r, f, u] = await Promise.all([
        fetch("/api/admin/metrics/overview?days=30&churnDays=30"),
        fetch("/api/admin/metrics/revenue?weeks=12"),
        fetch("/api/admin/metrics/funnel?days=30"),
        fetch("/api/admin/metrics/usage?days=30"),
      ]);
      const [oj, rj, fj, uj] = await Promise.all([o.json(), r.json(), f.json(), u.json()]);
      const oe = oj as MetricsApiError & OverviewPayload;
      const re = rj as MetricsApiError & RevenuePayload;
      const fe = fj as MetricsApiError & FunnelPayload;
      const ue = uj as MetricsApiError & UsagePayload;
      if (!oe.success) throw new Error(formatMetricsApiError(oe, "Overview failed"));
      if (!re.success) throw new Error(formatMetricsApiError(re, "Revenue failed"));
      if (!fe.success) throw new Error(formatMetricsApiError(fe, "Funnel failed"));
      if (!ue.success) throw new Error(formatMetricsApiError(ue, "Usage failed"));
      setOverview(oe);
      setRevenue(re);
      setFunnel(fe);
      setUsage(ue);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const funnelBars =
    funnel?.inWindowDistinctUsers != null
      ? Object.entries(funnel.inWindowDistinctUsers).map(([stage, users]) => ({
          stage: stage.replace(/_/g, " "),
          users,
        }))
      : [];

  const mauUsersData =
    overview != null
      ? [
          { label: "MAU (usage)", value: overview.mauUsage },
          { label: "Paying users", value: overview.payingUsersDistinct },
        ]
      : [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("pages.adminCommon.admin")}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{t("pages.adminPages.founderAnalytics")}</h1>
        <p className="max-w-2xl text-sm text-gray-600">{t("pages.adminPages.founderSub")}<span className="font-medium text-gray-800">billing_subscriptions</span>; charts use the same APIs as
          your product integrations.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
        >{t("pages.adminCommon.refresh")}</button>
      </header>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      {loading && !overview ? (
        <div className="text-sm text-gray-500">{t("pages.founderDashboard.loadingMetrics")}</div>
      ) : overview ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label={t("pages.adminPages.mrr")} value={fmtMoney(overview.mrr)} subtext="Active + trialing rows" />
            <KpiCard
              label={t("pages.adminPages.payingSubs")}
              value={String(overview.payingSubscriptions)}
              subtext="Rows in billing_subscriptions"
            />
            <KpiCard
              label={t("pages.adminPages.distinctPaying")}
              value={String(overview.payingUsersDistinct)}
              subtext="Unique profile ids on paying rows"
            />
            <KpiCard
              label={`MAU (usage, ${overview.scope.usageAndConversionWindowDays}d)`}
              value={String(overview.mauUsage)}
              subtext="Distinct users in usage_events"
            />
            <KpiCard
              label={t("pages.adminPages.activationRate")}
              value={fmtPct(overview.activation.rate)}
              subtext={`${overview.activation.activatedWithin7dOfOnboarding} / ${overview.activation.onboarded} onboarded (7d reply)`}
            />
            <KpiCard
              label={t("pages.founderDashboard.checkoutToPaid")}
              value={fmtPct(overview.conversion.rate)}
              subtext={`${overview.conversion.convertedUsers} / ${overview.conversion.checkoutStartedUsers} starters (${overview.scope.usageAndConversionWindowDays}d)`}
            />
            <KpiCard
              label={`Churn (${overview.scope.churnWindowDays}d)`}
              value={fmtPct(overview.churn.rate)}
              subtext={`${overview.churn.churnedUsers} churned users · ${overview.churn.payingUsersNow} paying now`}
            />
            <KpiCard
              label={t("pages.adminPages.newPaying")}
              value={String(overview.newPayingUsersInWindow)}
              subtext={`subscription_active_crm · ${overview.scope.usageAndConversionWindowDays}d`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title={t("pages.adminPages.mrrTrend")}>
              {revenue?.seriesNote ? (
                <p className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {revenue.seriesNote}
                </p>
              ) : null}
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenue?.weeklyMrrFromEvents ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={((v: number | string) => fmtMoney(Number(v))) as never} />
                    <Line type="monotone" dataKey="mrr" stroke="#111827" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-gray-500">{t("pages.dashFragments.currentMrr")}{" "}
                <span className="font-medium text-gray-700">{fmtMoney(revenue?.currentMrr ?? overview.mrr)}</span>
              </p>
            </SectionCard>

            <SectionCard title={t("pages.adminPages.users")}>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mauUsersData} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#111827" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>

          <SectionCard title={t("pages.adminPages.funnelWindow")}>
            <p className="mb-4 text-xs text-gray-500">{t("pages.dashFragments.window")} {funnel?.windowDays ?? "—"} days · Cumulative state: onboarded {funnel?.cumulative.onboarded ?? "—"}
              , first reply {funnel?.cumulative.firstReply ?? "—"}, first AI {funnel?.cumulative.firstAi ?? "—"}
            </p>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelBars} margin={{ bottom: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="stage" interval={0} angle={-28} textAnchor="end" height={70} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <Tooltip />
                  <Bar dataKey="users" fill="#4b5563" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard title="Feature usage (usage_events)">
            <p className="mb-4 text-xs text-gray-500">{t("pages.founder.windowDays", { count: Number(usage?.windowDays ?? 0), n: usage?.windowDays ?? "—" })}</p>
            {usage && usage.breakdown.length === 0 ? (
              <p className="text-sm text-gray-600">{t("pages.adminPages.noUsageEvents")}</p>
            ) : (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(usage?.breakdown ?? []).map((b) => ({
                      name: b.event_type.replace(/_/g, " "),
                      count: b.count,
                    }))}
                    layout="vertical"
                    margin={{ left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} stroke="#9ca3af" />
                    <Tooltip />
                    <Bar dataKey="count" fill="#111827" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          {revenue && revenue.mrrByPlan.length > 0 ? (
            <SectionCard title={t("pages.adminPages.mrrByPlan")}>
              <ul className="divide-y divide-gray-100 text-sm">
                {revenue.mrrByPlan.map((row) => (
                  <li key={row.plan} className="flex justify-between py-2">
                    <span className="font-medium text-gray-800">{row.plan}</span>
                    <span className="text-gray-600">
                      {fmtMoney(row.mrr)}
                      <span className="text-gray-400"> · {t("pages.founder.subscribers", { count: row.subscribers })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
