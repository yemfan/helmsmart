"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { intlLocale } from "@/lib/i18n/locale";

type Kpis = {
  activeApplications: number;
  fundedThisMonth: number;
  avgDaysToClose: number | null;
  pipelineValue: number;
  totalFunded: number;
  conversionRate: number;
};

type StageCount = { name: string; value: number; color: string };

export default function BrokerOverviewClient() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [stages, setStages] = useState<StageCount[]>([]);
  const [recentApps, setRecentApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [statsRes, appsRes] = await Promise.all([
        fetch("/api/loan-broker/stats").then((r) => r.json()),
        fetch("/api/loan-broker/applications?pageSize=5").then((r) => r.json()),
      ]);
      if (statsRes.ok) {
        setKpis(statsRes.kpis);
        setStages(statsRes.stageCounts);
      }
      if (appsRes.ok) setRecentApps(appsRes.applications ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const h = now.getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  if (loading) return <div className="py-20 text-center text-gray-400">{t("pages.loanBroker.loadingDashboard")}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{greeting}</h1>
        <p className="text-sm text-gray-500">{now.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("pages.loanBroker.activeApplications")}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{kpis?.activeApplications ?? 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">{t("pages.loanBroker.fundedThisMonth")}</p>
          <p className="mt-1 text-3xl font-bold text-green-600">{kpis?.fundedThisMonth ?? 0}</p>
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

      {/* Stage pie + recent apps */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 mb-2">{t("pages.loanBroker.pipelineByStage")}</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stages.filter((s) => s.value > 0)} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35} strokeWidth={1}>
                  {stages.filter((s) => s.value > 0).map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {stages.filter((s) => s.value > 0).map((s) => (
              <div key={s.name} className="flex items-center gap-1 text-xs text-gray-600">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.name} ({s.value})
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 mb-2">{t("pages.loanBroker.recentApplications")}</h3>
          {recentApps.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">{t("pages.loanBroker.noApplications")}</p>
          ) : (
            <div className="space-y-2">
              {recentApps.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.borrower_name}</p>
                    <p className="text-xs text-gray-500">
                      ${Number(a.loan_amount ?? 0).toLocaleString(locale)} · {a.loan_type ?? "—"}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    {(a.pipeline_stage ?? "inquiry").replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h3 className="text-xs font-semibold text-gray-500 mb-3">{t("pages.loanBroker.quickActions")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Link href="/loan-broker/dashboard/pipeline" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100">{t("pages.loanBroker.viewPipeline")}</Link>
          <Link href="/mortgage-calculator" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100">{t("pages.loanBroker.mortgageCalc")}</Link>
          <Link href="/affordability-calculator" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100">{t("pages.loanBroker.affordabilityCalc")}</Link>
          <Link href="/refinance-calculator" className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-700 hover:bg-gray-100">{t("pages.loanBroker.refinanceCalc")}</Link>
        </div>
      </div>
    </div>
  );
}
