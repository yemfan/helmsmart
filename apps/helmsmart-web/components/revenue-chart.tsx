"use client";

import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface ChartMonth {
  month: string; // e.g. "Jan", "Feb"
  revenue: number;
  expenses: number;
}

interface Props {
  data: ChartMonth[];
}

function fmtTick(value: number) {
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
  return `$${value}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  const { i18n } = useTranslation("home");
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => (
          <div key={p.name} className="flex items-center gap-2 mb-1">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ background: p.fill }}
            />
            <span className="text-slate-500">{p.name}</span>
            <span className="ml-auto font-semibold text-slate-800 tabular-nums">
              ${Number(p.value).toLocaleString(intlLocale(i18n.language), { maximumFractionDigits: 0 })}
            </span>
          </div>
        )
      )}
    </div>
  );
}

export function RevenueChart({ data }: Props) {
  const { t } = useTranslation("home");

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        {t("revenueChart.empty")}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
        barSize={16}
        barGap={4}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtTick}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
        <Legend
          iconType="square"
          iconSize={10}
          wrapperStyle={{ fontSize: 11, color: "#64748b", paddingTop: 12 }}
        />
        <Bar dataKey="revenue" name={t("revenueChart.revenue")} fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="expenses" name={t("revenueChart.expenses")} fill="#f43f5e" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
