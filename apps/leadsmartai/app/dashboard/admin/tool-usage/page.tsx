"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type ToolUsageData = {
  tools: Record<string, { total: number; last7d: number; last30d: number }>;
  daily: Record<string, number>;
  leadCount: number;
  totalEvents: number;
};

export default function ToolUsagePage() {
  const { t } = useTranslation("dashboard");
  const [data, setData] = useState<ToolUsageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/tool-usage")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setData(j);
        else setError(j.error ?? t("pages.toolUsage.loadFailed"));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="p-6 text-red-600">{t("pages.toolUsage.error", { message: error })}</div>;
  if (!data) return <div className="p-6 text-slate-500">{t("pages.toolUsage.loading")}</div>;

  const toolNames = Object.keys(data.tools).sort((a, b) => data.tools[b].total - data.tools[a].total);
  const dailyDays = Object.keys(data.daily).sort().reverse().slice(0, 30);

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("pages.toolUsage.heading")}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("pages.toolUsage.totals", {
            events: data.totalEvents.toLocaleString(),
            leads: data.leadCount.toLocaleString(),
          })}
        </p>
      </div>

      {/* Tool breakdown table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">{t("pages.toolUsage.colTool")}</th>
              <th className="px-4 py-3 text-right">{t("pages.toolUsage.colTotal")}</th>
              <th className="px-4 py-3 text-right">{t("pages.toolUsage.col7d")}</th>
              <th className="px-4 py-3 text-right">{t("pages.toolUsage.col30d")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {toolNames.map((tool) => (
              <tr key={tool} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                  {tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </td>
                <td className="px-4 py-3 text-right font-mono">{data.tools[tool].total}</td>
                <td className="px-4 py-3 text-right font-mono">{data.tools[tool].last7d}</td>
                <td className="px-4 py-3 text-right font-mono">{data.tools[tool].last30d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Daily breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("pages.toolUsage.dailyHeading")}</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">{t("pages.toolUsage.colDate")}</th>
                <th className="px-4 py-3 text-right">{t("pages.toolUsage.colEvents")}</th>
                <th className="px-4 py-3">{t("pages.toolUsage.colActivity")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {dailyDays.map((day) => {
                const count = data.daily[day];
                const maxCount = Math.max(...Object.values(data.daily));
                const barWidth = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                return (
                  <tr key={day} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{day}</td>
                    <td className="px-4 py-2 text-right font-mono">{count}</td>
                    <td className="px-4 py-2">
                      <div className="h-4 rounded-full bg-blue-100" style={{ width: "100%" }}>
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: barWidth + "%" }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
