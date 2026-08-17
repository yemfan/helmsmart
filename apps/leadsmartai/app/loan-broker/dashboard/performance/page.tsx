"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function BrokerPerformancePage() {
  const { t } = useTranslation("dashboard");
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/loan-broker/stats");
      const body = await res.json();
      if (body.ok) setStats(body);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-20 text-center text-gray-400">{t("pages.loanBroker.loadingPerformance")}</div>;

  const kpis = stats?.kpis;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{t("pages.loanBroker.performance")}</h1>
        <p className="text-sm text-gray-500">{t("pages.loanBroker.performanceSub")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("pages.loanBroker.totalFunded")}</p>
          <p className="mt-1 text-3xl font-bold text-green-600">{kpis?.totalFunded ?? 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("pages.loanBroker.conversionRate")}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{kpis?.conversionRate ?? 0}%</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("pages.loanBroker.avgDaysToClose")}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{kpis?.avgDaysToClose ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("pages.loanBroker.pipelineValue")}</p>
          <p className="mt-1 text-3xl font-bold text-blue-600">
            ${((kpis?.pipelineValue ?? 0) / 1_000_000).toFixed(1)}M
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 mb-2">{t("pages.loanBroker.stageDistribution")}</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={(stats?.stageCounts ?? []).filter((s: any) => s.value > 0)} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35} strokeWidth={1}>
                  {(stats?.stageCounts ?? []).filter((s: any) => s.value > 0).map((s: any, i: number) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 mb-2">{t("pages.loanBroker.fundedByMonth")}</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.fundedByMonth ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 9 }} stroke="#9ca3af" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#059669" name="Funded" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
